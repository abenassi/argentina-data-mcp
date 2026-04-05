# Argentina Data MCP

MCP server que expone datos argentinos en tiempo real para agentes de IA: cotizaciones del dólar, variables del BCRA, estadísticas del INDEC, legislación de InfoLeg, y más.

## Conectar desde Claude.ai

Agregá este MCP server como conector HTTP en tu cuenta de Claude:

**URL**: `https://argentinadata.mymcps.dev/mcp`

**Status page**: [https://stats.uptimerobot.com/lTLP3Efkud](https://stats.uptimerobot.com/lTLP3Efkud)

## Tools disponibles

| Tool | Descripción | Estado |
|------|-------------|--------|
| `dolar_cotizaciones` | Cotizaciones actuales del dólar (oficial, blue, MEP, CCL, cripto, tarjeta, mayorista) | ✅ |
| `dolar_historico` | Evolución histórica del dólar (7 tipos, desde 2024). Fuente: Ámbito Financiero | ✅ |
| `bcra_tipo_cambio` | Variables monetarias del BCRA: dólar oficial/mayorista, reservas, BADLAR, inflación, base monetaria, ICL | ✅ |
| `indec_stats` | Indicadores INDEC: IPC, EMAE, salarios, construcción (ISAC), industria (IPI) | ✅ |
| `infoleg_search` | Búsqueda de legislación argentina (420K+ leyes, decretos, resoluciones) con full-text search | ✅ |
| `afip_cuit_lookup` | Consulta de CUIT/CUIL en AFIP — desactivada, APIs públicas discontinuadas | ❌ |
| `boletin_oficial_search` | Búsqueda en el Boletín Oficial (decretos, resoluciones, disposiciones) | ✅ |
| `data_health` | Estado de salud de todas las fuentes de datos | ✅ |

## Ejemplos de uso

### Cotizaciones del dólar
> "¿A cuánto está el dólar blue hoy?"

Usa `dolar_cotizaciones` — devuelve las 7 cotizaciones actuales con compra, venta y variación.

### Evolución del dólar blue
> "Mostrame cómo evolucionó el dólar blue en los últimos 6 meses"

Usa `dolar_historico` con `tipo: "blue"` y `fecha_desde: "2025-10-01"`.

### Variables del BCRA
> "¿Cuánto crecieron las reservas del BCRA en el último año?"

Usa `bcra_tipo_cambio` con `variable: "reservas"` y `fecha_desde: "2025-04-01"`.

### Inflación
> "¿Cuál fue la inflación de febrero 2026?"

Usa `indec_stats` con `indicador: "ipc"`.

### Legislación
> "Buscá leyes sobre monotributo"

Usa `infoleg_search` con `query: "monotributo"`. Los resultados priorizan normativa reciente.

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

## Tests

```bash
npm test                 # Unit + integration tests
npm run test:integration # Solo integration tests (requiere PostgreSQL)
```

## License

MIT
