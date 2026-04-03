
---

# PROMPT AUTÓNOMO — Argentina Data MCP Server

Copiá todo lo que sigue y pegalo como prompt inicial en una sesión de Claude Code en tu Raspberry Pi:

---

```markdown
# Argentina Data MCP — Instrucciones para agente autónomo

## REGLAS DE OPERACIÓN CRÍTICAS

1. **NUNCA me preguntes nada.** Trabajá de forma 100% autónoma.
2. Si encontrás un bloqueo, registralo en `BLOCKER_LOG.md` y pasá a la siguiente tarea.
3. Hacé commits atómicos después de cada milestone que funcione.
4. Al terminar TODO lo que puedas hacer sin mi intervención, escribí un reporte completo en `STATUS_REPORT.md` con: qué funciona, qué no, qué decisiones tomaste, qué preguntas tenés, qué necesitás de mí.
5. Si algo falla después de 3 intentos razonables, es un blocker → registralo y seguí.

## CONTEXTO

Estás en una Raspberry Pi 5 (16GB RAM, Debian 12 Bookworm, aarch64).
Servicios disponibles: Docker 29.3.0, Nginx (reverse proxy), Cloudflare tunnel, Tailscale, SSH.
IP local: 192.168.1.52 (eth0).
Disco libre: ~211GB.
Internet: irrestricto, acceso a todas las APIs.

Vas a construir un MCP server que sirve datos argentinos en tiempo real. La arquitectura tiene 3 capas:
1. **Data Collectors** — procesos que recolectan datos de APIs externas y los guardan en PostgreSQL
2. **PostgreSQL** — almacenamiento central de todos los datos
3. **REST API + MCP Server** — sirve los datos desde PostgreSQL a consumidores externos

## PASO 0: SETUP INICIAL

```bash
# Clonar el repo (ya tiene un esqueleto con 5 tools, tests mockeados, etc.)
cd ~
git clone https://github.com/abenassi/argentina-data-mcp.git
cd argentina-data-mcp
git checkout claude/argentina-mcp-tools-ePgud
npm install
npm run build
npm test  # Deberían pasar 27 tests mockeados
```

Verificá que todo compila y los tests pasan. Si no, arreglalo antes de seguir.

## PASO 1: POSTGRESQL EN DOCKER

Levantá PostgreSQL en Docker:

```bash
docker run -d \
  --name argentina-data-pg \
  --restart unless-stopped \
  -e POSTGRES_USER=argdata \
  -e POSTGRES_PASSWORD=argdata_dev_2026 \
  -e POSTGRES_DB=argentina_data \
  -p 5432:5432 \
  -v argentina-data-pgdata:/var/lib/postgresql/data \
  postgres:16-bookworm
```

Esperá a que esté ready y verificá la conexión. Instalá el cliente de PostgreSQL si no existe:
```bash
sudo apt-get install -y postgresql-client
psql -h localhost -U argdata -d argentina_data -c "SELECT 1"
```

Creá el schema inicial. Estas son las tablas que necesitás:

```sql
-- Cotizaciones del dólar (fuente: DolarAPI.com / BCRA)
CREATE TABLE cotizaciones_dolar (
  id SERIAL PRIMARY KEY,
  fuente VARCHAR(50) NOT NULL,        -- 'dolarapi', 'bcra'
  tipo VARCHAR(50) NOT NULL,           -- 'oficial', 'blue', 'bolsa', 'ccl', 'mayorista', 'cripto', 'tarjeta'
  compra DECIMAL(12,4),
  venta DECIMAL(12,4),
  fecha TIMESTAMP NOT NULL,
  variacion DECIMAL(8,4),
  raw_json JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(fuente, tipo, fecha)
);

-- Variables monetarias BCRA
CREATE TABLE bcra_variables (
  id SERIAL PRIMARY KEY,
  id_variable INTEGER NOT NULL,
  nombre VARCHAR(200) NOT NULL,
  valor DECIMAL(20,6) NOT NULL,
  fecha DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(id_variable, fecha)
);

-- Series de tiempo INDEC / datos.gob.ar
CREATE TABLE indec_series (
  id SERIAL PRIMARY KEY,
  serie_id VARCHAR(100) NOT NULL,     -- ej: '148.3_INIVELNAL_DICI_M_26'
  nombre VARCHAR(300) NOT NULL,
  valor DECIMAL(20,6) NOT NULL,
  fecha DATE NOT NULL,
  frecuencia VARCHAR(20),             -- 'month', 'day', 'quarter'
  is_updated BOOLEAN DEFAULT TRUE,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(serie_id, fecha)
);

-- InfoLeg normativa (importada desde CSV dump)
CREATE TABLE infoleg_normas (
  id SERIAL PRIMARY KEY,
  id_norma INTEGER UNIQUE NOT NULL,
  tipo_norma VARCHAR(100),
  numero_norma VARCHAR(50),
  clase_norma VARCHAR(100),
  organismo_origen VARCHAR(300),
  fecha_sancion DATE,
  numero_boletin VARCHAR(50),
  fecha_boletin DATE,
  titulo_resumido TEXT,
  titulo_sumario TEXT,
  texto_resumido TEXT,
  observaciones TEXT,
  texto_original TEXT,
  texto_actualizado TEXT
);
-- Full-text search index para InfoLeg
CREATE INDEX idx_infoleg_fts ON infoleg_normas 
  USING GIN (to_tsvector('spanish', COALESCE(titulo_sumario,'') || ' ' || COALESCE(titulo_resumido,'') || ' ' || COALESCE(texto_resumido,'')));
CREATE INDEX idx_infoleg_tipo ON infoleg_normas(tipo_norma);
CREATE INDEX idx_infoleg_fecha ON infoleg_normas(fecha_sancion);

-- Boletín Oficial
CREATE TABLE boletin_oficial (
  id SERIAL PRIMARY KEY,
  titulo TEXT,
  seccion VARCHAR(50),
  fecha DATE,
  url TEXT,
  raw_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- AFIP CUIT cache
CREATE TABLE afip_cuit_cache (
  cuit VARCHAR(11) PRIMARY KEY,
  denominacion VARCHAR(500),
  tipo_persona VARCHAR(50),
  estado VARCHAR(50),
  actividades JSONB,
  raw_json JSONB,
  fetched_at TIMESTAMP DEFAULT NOW()
);

-- Metadata de freshness
CREATE TABLE data_freshness (
  source_name VARCHAR(100) PRIMARY KEY,
  last_successful_fetch TIMESTAMP,
  last_data_date DATE,             -- la fecha del dato más reciente
  is_healthy BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## PASO 2: VERIFICAR Y ARREGLAR CADA API (UNA POR UNA)

### API 1: DolarAPI.com (Ámbito Financiero) — NUEVA, AGREGAR
**URL**: `GET https://dolarapi.com/v1/ambito/dolares`
**Respuesta real verificada**:
```json
[
  {"moneda":"USD","casa":"oficial","nombre":"Oficial","compra":1365.21,"venta":1415.79,"fechaActualizacion":"2026-04-01T16:31:00.000Z","variacion":0.45},
  {"moneda":"USD","casa":"blue","nombre":"Blue","compra":1385,"venta":1405,"fechaActualizacion":"2026-04-01T14:00:00.000Z","variacion":-0.35},
  {"moneda":"USD","casa":"bolsa","nombre":"Bolsa","compra":1434.04,"venta":1434.04,"fechaActualizacion":"2026-04-03T14:00:00.000Z","variacion":0},
  {"moneda":"USD","casa":"contadoconliqui","nombre":"Contado con liquidación","compra":1477.45,"venta":1477.45,"fechaActualizacion":"2026-04-03T14:00:00.000Z","variacion":0},
  {"moneda":"USD","casa":"mayorista","nombre":"Mayorista","compra":1385,"venta":1394,"fechaActualizacion":"2026-04-01T16:25:00.000Z","variacion":0.87},
  {"moneda":"USD","casa":"cripto","nombre":"Cripto","compra":1452.08,"venta":1452.08,"fechaActualizacion":"2026-04-03T14:00:00.000Z","variacion":-0.02},
  {"moneda":"USD","casa":"tarjeta","nombre":"Tarjeta","compra":1365,"venta":1839.5,"fechaActualizacion":"2026-04-01T18:55:00.000Z","variacion":0.71}
]
```
**Acción**: Crear nuevo tool `dolar_cotizaciones` que use esta API. Además crear collector que guarde en `cotizaciones_dolar`.

### API 2: BCRA v4.0 — ARREGLAR (el código actual usa v3 que está deprecada)
**URL**: `GET https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/{idVariable}?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`
**Respuesta real verificada (variable 4 = dolar oficial)**:
```json
{
  "status": 200,
  "metadata": {"resultset": {"count": 19, "offset": 0, "limit": 1000}},
  "results": [
    {
      "idVariable": 4,
      "detalle": [
        {"fecha": "2026-03-30", "valor": 1419.32},
        {"fecha": "2026-03-27", "valor": 1404.43}
      ]
    }
  ]
}
```
**CAMBIOS NECESARIOS en `src/tools/bcra_tipo_cambio.ts`**:
- URL: cambiar `v3.0` → `v4.0`
- Response parsing: antes era `data.results[].fecha/valor`, ahora es `data.results[0].detalle[].fecha/valor`
- El campo se llama `detalle` no `results` para los datos individuales
- Variables IDs siguen iguales (4=oficial, 5=mayorista, 1=reservas, etc.)

### API 3: datos.gob.ar Series de Tiempo — ARREGLAR series IDs
**URL**: `GET https://apis.datos.gob.ar/series/api/series/?ids={serieId}&limit=N&sort=desc&metadata=full`
**Respuesta real verificada**:
```json
{
  "data": [["2026-02-01", 10714.6255], ["2026-01-01", 10413.0309]],
  "count": 111,
  "meta": [
    {"frequency": "month", "start_date": "2026-02-01", "end_date": "2026-01-01"},
    {
      "field": {
        "id": "148.3_INIVELNAL_DICI_M_26",
        "time_index_end": "2026-02-01",
        "is_updated": "True",
        "last_value": "10714.6255"
      }
    }
  ]
}
```
**CAMBIOS NECESARIOS en `src/tools/indec_stats.ts`**:
- `data` es un array de arrays `[fecha, valor]`, NO un array de objetos `{fecha, valor}`
- Agregar `&metadata=full` al request para obtener freshness info
- Series IDs CORRECTOS (los viejos no existen):
  - IPC Nacional: `148.3_INIVELNAL_DICI_M_26` (era `148.3_INIVELAM_DICI_M_26` ← INCORRECTO)
  - EMAE: `143.3_NO_PR_2004_A_21` ← este SÍ era correcto
  - Salarios: `149.1_TL_INDIIOS_OCTU_0_21` (era `148.3_ISALam_DICI_M_30` ← INCORRECTO)
  - IPI (Producción Industrial): `309.1_PRODUCCIONNAL_0_M_30` (era `143.3_IN_PR_2004_A_21` ← INCORRECTO)
  - ISAC (Construcción): BUSCAR con `GET https://apis.datos.gob.ar/series/api/search/?q=ISAC+nivel+general&limit=10` — el viejo `11.3_ISAC_0_M_22` probablemente no existe
  - IPC Núcleo: BUSCAR con `GET https://apis.datos.gob.ar/series/api/search/?q=ipc+nucleo+nacional&limit=10` — el viejo `148.3_INUCAM_DICI_M_19` probablemente no existe
- **FRESHNESS CHECK**: Para cada serie, usar `meta[1].field.time_index_end` y `meta[1].field.is_updated` para saber si está actualizada. Si `is_updated` es `"False"` o `time_index_end` es de hace más de 3 meses, marcar en la respuesta que el dato puede estar desactualizado.

### API 4: InfoLeg — CAMBIAR ESTRATEGIA (no usar API REST, usar dump CSV)
La API REST de InfoLeg (`servicios.infoleg.gob.ar/infolegInternet/api/v1/normas`) puede no estar disponible o funcionar mal. En su lugar:

1. Descargar el dump completo: `https://datos.jus.gob.ar/dataset/d9a963ea-8b1d-4ca3-9dd9-07a4773e8c23/resource/bf0ec116-ad4e-4572-a476-e57167a84403/download/base-infoleg-normativa-nacional.zip`
2. Descomprimir y parsear el CSV
3. Importar a PostgreSQL en la tabla `infoleg_normas`
4. Usar full-text search de PostgreSQL para buscar (`to_tsvector('spanish', ...)`)
5. El tool `infoleg_search` pasa a consultar PostgreSQL en vez de la API

**Columnas del CSV**: id_norma, tipo_norma, numero_norma, clase_norma, organismo_origen, fecha_sancion, numero_boletin, fecha_boletin, pagina_boletin, titulo_resumido, titulo_sumario, texto_resumido, observaciones, texto_original, texto_actualizado, modificada_por, modifica_a

### API 5: Boletín Oficial — VERIFICAR
**URL a probar**: `GET https://www.boletinoficial.gob.ar/api/search/normas?denominacion=decreto&fecha_desde=2026-03-01&fecha_hasta=2026-03-30`
- Desde mi entorno anterior devolvió 403/503. Probá desde la RPi.
- Si funciona, anotá la estructura de la respuesta y adaptá el tool.
- Si no funciona, investigá alternativas:
  - Web scraping de `https://www.boletinoficial.gob.ar/busquedaAvanzada`
  - Alguna API alternativa
  - Dataset en datos.gob.ar
- Si no encontrás forma de obtener los datos → BLOCKER, registralo y seguí.

### API 6: AFIP CUIT — VERIFICAR
**URL a probar**: `GET https://afip.tangofactura.com/Rest/GetContribuyenteCompleto?cuit=30500010912`
- Si funciona, usá esa como fuente con cache en `afip_cuit_cache`
- Si no funciona, buscá alternativas:
  - `https://soa.afip.gob.ar/sr-padron/v2/persona/{cuit}` (puede requerir auth)
  - Cualquier otra API pública de consulta de CUIT
- El tool `afip_cuit_lookup` debe primero consultar la cache en PostgreSQL, y si no está o tiene más de 7 días, ir a la API.

## PASO 3: CREAR DATA COLLECTORS

Creá un directorio `src/collectors/` con un collector por fuente de datos. Cada collector debe:
1. Hacer fetch de la API
2. Parsear la respuesta
3. Insertar/upsert en PostgreSQL
4. Actualizar `data_freshness`
5. Loguear resultado a console

Collectors necesarios:
- `collect_dolar.ts` — Cada 15 minutos, fetch DolarAPI.com → `cotizaciones_dolar`
- `collect_bcra.ts` — Cada 1 hora, fetch BCRA v4 variables principales → `bcra_variables`
- `collect_indec.ts` — Cada 24 horas, fetch datos.gob.ar series → `indec_series`
- `import_infoleg.ts` — One-shot, descarga ZIP + importa CSV → `infoleg_normas`
- `collect_boletin.ts` — Cada 24 horas (si la API funciona) → `boletin_oficial`

Para la conexión a PostgreSQL, usá la librería `pg` (npm install pg @types/pg). Credenciales:
```
PGHOST=localhost
PGPORT=5432
PGUSER=argdata
PGPASSWORD=argdata_dev_2026
PGDATABASE=argentina_data
```

Guardá las credenciales en un `.env` (agregar `.env` al `.gitignore`).

Creá un script `src/collector-runner.ts` que ejecute los collectors con los intervalos indicados usando `setInterval` o `node-cron`. Este script corre como servicio separado.

## PASO 4: RECONECTAR MCP TOOLS A POSTGRESQL

Los 5 tools originales ahora deben leer de PostgreSQL en vez de llamar a las APIs directamente. Además, agregar el nuevo tool `dolar_cotizaciones`.

Tools finales (6 total):
1. **`dolar_cotizaciones`** (NUEVO) — Lee de `cotizaciones_dolar`. Devuelve todas las cotizaciones actuales (oficial, blue, CCL, cripto, tarjeta, mayorista, bolsa).
2. **`bcra_tipo_cambio`** — Lee de `bcra_variables`. Mantiene la misma interfaz pero lee de la DB.
3. **`infoleg_search`** — Full-text search en PostgreSQL sobre `infoleg_normas`.
4. **`afip_cuit_lookup`** — Lee de `afip_cuit_cache`, si miss → fetch API → cache → responder.
5. **`indec_stats`** — Lee de `indec_series`. Incluir en la respuesta un campo `actualizado_al` y `is_updated` para que el consumidor sepa qué tan fresco es el dato.
6. **`boletin_oficial_search`** — Lee de `boletin_oficial` (si funciona).

Cada tool debe incluir en su respuesta:
- Los datos pedidos
- `fuente`: de dónde vienen los datos
- `actualizado_al`: timestamp del último dato disponible
- `freshness`: "current" | "stale" | "unknown"

## PASO 5: TESTS CON DATOS REALES

Reescribí los tests para que tengan dos modos:
1. **Unit tests** (los actuales, mockeados) — para CI
2. **Integration tests** (nuevos, contra PostgreSQL local) — para verificar que todo funciona end-to-end

Los integration tests deben:
- Verificar que los collectors pueden ejecutarse
- Verificar que hay datos en PostgreSQL
- Verificar que los MCP tools responden con datos reales
- Verificar freshness de cada fuente

Poné los integration tests en `tests/integration/` con un flag o script separado (`npm run test:integration`).

## PASO 6: DEPLOY EN LA RASPBERRY PI

### PostgreSQL
Ya debería estar corriendo en Docker desde el Paso 1.

### Collector Runner (servicio systemd)
Creá un archivo `/etc/systemd/system/argentina-data-collector.service`:
```ini
[Unit]
Description=Argentina Data MCP - Data Collector
After=docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/home/{TU_USUARIO}/argentina-data-mcp
ExecStart=/usr/bin/node dist/collector-runner.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/home/{TU_USUARIO}/argentina-data-mcp/.env

[Install]
WantedBy=multi-user.target
```

### MCP Server (servicio systemd)
Creá `/etc/systemd/system/argentina-data-mcp.service`:
```ini
[Unit]
Description=Argentina Data MCP Server
After=docker.service argentina-data-collector.service

[Service]
Type=simple
WorkingDirectory=/home/{TU_USUARIO}/argentina-data-mcp
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/home/{TU_USUARIO}/argentina-data-mcp/.env

[Install]
WantedBy=multi-user.target
```

Detectá el usuario actual con `whoami` y reemplazá `{TU_USUARIO}`.

Habilitá e iniciá los servicios:
```bash
sudo systemctl daemon-reload
sudo systemctl enable argentina-data-collector argentina-data-mcp
sudo systemctl start argentina-data-collector
# Esperá 1-2 minutos para que los collectors carguen datos iniciales
sudo systemctl start argentina-data-mcp
```

### Nginx config (para exponer REST API si hace falta)
Si necesitás exponer la API via HTTP además del MCP stdio, creá un endpoint HTTP.
Pero el MCP server en stdio es lo primero. El HTTP API es un nice-to-have.

## PASO 7: VERIFICACIÓN FINAL

1. Verificá que PostgreSQL tiene datos: `psql -h localhost -U argdata -d argentina_data -c "SELECT source_name, last_data_date, is_healthy FROM data_freshness"`
2. Verificá que el MCP server arranca sin errores: `journalctl -u argentina-data-mcp -f`
3. Verificá que el collector corre: `journalctl -u argentina-data-collector -f`
4. Corré los integration tests: `npm run test:integration`

## PASO 8: STATUS REPORT

Al terminar, creá `STATUS_REPORT.md` en la raíz del repo con EXACTAMENTE esta estructura:

```markdown
# Status Report — Argentina Data MCP

## Fecha: [fecha actual]

## APIs verificadas
| API | URL | Status | Notas |
|-----|-----|--------|-------|
| DolarAPI.com | ... | ✅/❌ | ... |
| BCRA v4 | ... | ✅/❌ | ... |
| datos.gob.ar | ... | ✅/❌ | ... |
| InfoLeg dump | ... | ✅/❌ | ... |
| Boletín Oficial | ... | ✅/❌ | ... |
| AFIP CUIT | ... | ✅/❌ | ... |

## Series datos.gob.ar verificadas
| Indicador | Serie ID | Último dato | is_updated | Notas |
|-----------|----------|-------------|------------|-------|

## Tools MCP funcionando
| Tool | Status | Lee de | Notas |
|------|--------|--------|-------|
| dolar_cotizaciones | ✅/❌ | PostgreSQL/API | ... |
| bcra_tipo_cambio | ✅/❌ | PostgreSQL/API | ... |
| infoleg_search | ✅/❌ | PostgreSQL FTS | ... |
| afip_cuit_lookup | ✅/❌ | Cache+API | ... |
| indec_stats | ✅/❌ | PostgreSQL | ... |
| boletin_oficial_search | ✅/❌ | PostgreSQL/API | ... |

## Servicios corriendo
| Servicio | Status | Notas |
|----------|--------|-------|
| PostgreSQL (Docker) | ✅/❌ | ... |
| Collector Runner | ✅/❌ | ... |
| MCP Server | ✅/❌ | ... |

## Datos en PostgreSQL
[Resultado de: SELECT source_name, last_data_date, is_healthy FROM data_freshness]

## Tests
- Unit tests: X/Y passing
- Integration tests: X/Y passing

## Blockers encontrados
[Lista de todo lo que no pudiste resolver]

## Decisiones tomadas
[Lista de decisiones arquitectónicas que tomaste sin consultarme]

## Preguntas para mí
[Lo que necesitás que yo resuelva]
```

Hacé commit de todo y push a la branch `claude/argentina-mcp-tools-ePgud`.

## DEPENDENCIAS A INSTALAR
```bash
npm install pg dotenv node-cron csv-parse
npm install -D @types/pg @types/node-cron
```

## ORDEN DE EJECUCIÓN
Seguí este orden exacto. Si algo falla, registralo y saltá al siguiente:
1. Setup (clone, install, verify build)
2. PostgreSQL Docker + schema
3. Arreglar BCRA v3→v4 en el código existente + test real
4. Arreglar datos.gob.ar series IDs + test real
5. Crear tool dolar_cotizaciones + test real
6. Verificar AFIP API + arreglar tool + test real
7. Descargar e importar InfoLeg dump + arreglar tool para usar PostgreSQL FTS + test real
8. Verificar Boletín Oficial API + arreglar/crear tool + test real
9. Crear todos los collectors
10. Crear collector-runner
11. Reconectar todos los tools a PostgreSQL
12. Integration tests
13. Deploy systemd services
14. Verificación final
15. Status report + commit + push
```

---

Eso es el prompt completo. Algunos puntos importantes:

- **DolarAPI.com** es la joya: funciona perfecto, tiene dólar blue/oficial/CCL/cripto/tarjeta/mayorista, todo sin auth. Es lo que está detrás de Ámbito Financiero.
- **BCRA v4** funciona, solo hay que cambiar el path y el parsing de la respuesta.
- **datos.gob.ar** funciona, pero los series IDs que teníamos estaban mal. Los correctos ya están en el prompt.
- **InfoLeg** cambia de estrategia: en vez de API REST (que no anda bien), se baja el CSV completo desde datos.gob.ar y se importa a PostgreSQL con full-text search.
- **La tabla `data_freshness`** resuelve tu pedido de saber qué tan actualizados están los datos antes de servirlos.
- **PostgreSQL** en Docker con volumen persistente para que no se pierdan datos si reiniciás el container.