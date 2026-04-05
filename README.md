# Argentina Data MCP

MCP server que expone datos argentinos en tiempo real para agentes de IA: cotizaciones del dólar, variables del BCRA, estadísticas del INDEC, legislación de InfoLeg, datos de AFIP, legislación tributaria, feriados nacionales, y más.

## Conectar desde Claude.ai

Agregá este MCP server como conector HTTP en tu cuenta de Claude:

**URL**: `https://argentinadata.mymcps.dev/mcp`

**Status page**: [https://stats.uptimerobot.com/lTLP3Efkud](https://stats.uptimerobot.com/lTLP3Efkud)

## Tools disponibles

### Datos financieros

| Tool | Descripción | Estado |
|------|-------------|--------|
| `dolar_cotizaciones` | Cotizaciones actuales del dólar (oficial, blue, MEP, CCL, cripto, tarjeta, mayorista) | ✅ Stable |
| `dolar_historico` | Evolución histórica del dólar (7 tipos, desde 2024). Fuente: Ámbito Financiero | ✅ Stable |
| `bcra_tipo_cambio` | Variables monetarias del BCRA: dólar oficial/mayorista, reservas, BADLAR, TM20, inflación mensual/interanual, base monetaria, circulación monetaria, ICL | ✅ Stable |
| `indec_stats` | Indicadores INDEC: IPC, IPC núcleo, EMAE, salarios, construcción (ISAC), industria (IPI) | ✅ Stable |

### Legislación y datos fiscales

| Tool | Descripción | Estado |
|------|-------------|--------|
| `infoleg_search` | Búsqueda full-text en 420K+ normas de InfoLeg (leyes, decretos, resoluciones) | ✅ Stable |
| `boletin_oficial_search` | Búsqueda en el Boletín Oficial (decretos, resoluciones, disposiciones por sección y fecha) | ✅ Stable |
| `legislacion_tributaria` | Datos estructurados de legislación tributaria: monotributo (categorías A-K), ganancias (deducciones, escalas), IVA (alícuotas) | ✅ Stable |
| `afip_search_by_name` | Búsqueda en el padrón de AFIP (~6M contribuyentes) por nombre o razón social. Devuelve CUIT, estado, categorías impositivas | ✅ Stable |

### Utilidades

| Tool | Descripción | Estado |
|------|-------------|--------|
| `feriados_nacionales` | Feriados nacionales por año/mes, incluyendo inamovibles, trasladables y puentes. Calcula días hábiles | ✅ Stable |
| `data_health` | Estado de salud de todas las fuentes de datos con última actualización y smoke tests | ✅ Stable |

### Discovery

| Tool | Descripción | Estado |
|------|-------------|--------|
| `list_dolar_tipos` | Lista los tipos de dólar disponibles y qué tools los soportan | ✅ Stable |
| `list_bcra_variables` | Lista todas las variables BCRA con unidades y descripciones | ✅ Stable |
| `list_indec_indicadores` | Lista los indicadores INDEC disponibles con IDs de serie | ✅ Stable |

## Ejemplos de uso

### Cotizaciones del dólar
> "¿A cuánto está el dólar blue hoy?"

Usa `dolar_cotizaciones` — devuelve las 7 cotizaciones actuales con compra, venta y variación.

### Evolución del dólar blue
> "Mostrame cómo evolucionó el dólar blue en los últimos 6 meses"

Usa `dolar_historico` con `tipo: "blue"` y `fecha_desde`.

### Variables del BCRA
> "¿Cuánto crecieron las reservas del BCRA en el último año?"

Usa `bcra_tipo_cambio` con `variable: "reservas"` y `fecha_desde`.

### Inflación
> "¿Cuál fue la inflación de febrero 2026?"

Usa `indec_stats` con `indicador: "ipc"`.

### Legislación
> "Buscá leyes sobre monotributo"

Usa `infoleg_search` con `query: "monotributo"`. Los resultados priorizan normativa reciente.

### Datos tributarios
> "¿Cuáles son las categorías del monotributo?"

Usa `legislacion_tributaria` con `tipo: "monotributo"` — devuelve categorías A-K con límites y cuotas.

### Búsqueda de contribuyentes
> "Buscá empresas con el nombre Mercado Libre en AFIP"

Usa `afip_search_by_name` con `nombre: "Mercado Libre"` — busca por similitud en el padrón.

### Feriados
> "¿Cuántos días hábiles tiene abril 2026?"

Usa `feriados_nacionales` con `year: 2026` y `month: 4`.

### Diagnóstico
> "¿Están funcionando todas las fuentes de datos?"

Usa `data_health` — reporta estado, última actualización y registros de cada fuente.

## Instalación local

### Requisitos
- Node.js 20+
- PostgreSQL 16 (puede correr en Docker)

### Setup

```bash
git clone https://github.com/abenassi/argentina-data-mcp.git
cd argentina-data-mcp
npm install
npm run build

# Levantar PostgreSQL
docker run -d --name argentina-data-pg --restart unless-stopped \
  -e POSTGRES_USER=argdata -e POSTGRES_PASSWORD=argdata_dev_2026 \
  -e POSTGRES_DB=argentina_data -p 5432:5432 \
  -v argentina-data-pgdata:/var/lib/postgresql/data postgres:16-bookworm

# Crear tablas
psql -h localhost -U argdata -d argentina_data -f sql/001_create_tables.sql

# Configurar .env
cp .env.example .env

# Cargar datos iniciales
npm run collector        # Corre collectors una vez y queda escuchando
npm run import:infoleg   # Importa 420K+ normas (una sola vez)
npm run backfill:bcra    # Carga 2+ años de historia BCRA
npm run backfill:dolar-historico  # Carga 2+ años de cotizaciones históricas
```

### Ejecutar

```bash
# MCP server (stdio, para Claude Desktop / Claude Code)
npm start

# MCP server (HTTP, para Claude.ai web/mobile)
npm run start:http
```

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "argentina-data": {
      "command": "node",
      "args": ["/path/to/argentina-data-mcp/dist/index.js"],
      "env": {
        "PGHOST": "localhost",
        "PGPORT": "5432",
        "PGUSER": "argdata",
        "PGPASSWORD": "your_password",
        "PGDATABASE": "argentina_data"
      }
    }
  }
}
```

## Fuentes de datos

| Fuente | Datos | Frecuencia |
|--------|-------|------------|
| [DolarAPI.com](https://dolarapi.com) | Cotizaciones actuales (7 tipos) | Cada 15 min |
| [Ámbito Financiero](https://www.ambito.com) | Cotizaciones históricas (7 tipos, 2+ años) | Diario |
| [BCRA API v4](https://api.bcra.gob.ar) | Variables monetarias (10 variables, 2+ años) | Cada hora |
| [datos.gob.ar](https://apis.datos.gob.ar/series/) | Series INDEC (IPC, EMAE, salarios, etc.) | Diario |
| [InfoLeg](https://datos.jus.gob.ar) | Normativa nacional (420K+ normas) | Dump CSV |
| [Boletín Oficial](https://www.boletinoficial.gob.ar) | Publicaciones oficiales (decretos, resoluciones) | Diario (L-V) |
| [AFIP Padrón](https://www.afip.gob.ar) | Padrón de contribuyentes (~6M registros) | Periódico |

## Tests

```bash
npm test                 # Unit + integration tests
npm run test:integration # Solo integration tests (requiere PostgreSQL)
```

## License

PolyForm Noncommercial 1.0.0 — ver [LICENSE](LICENSE).

Uso personal, educativo y de investigación permitido. Uso comercial requiere autorización previa del autor.
