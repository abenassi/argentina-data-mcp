# argentina-data-mcp

MCP server exposing real-time Argentine legal and financial data (Infoleg, BCRA, AFIP, INDEC, Boletín Oficial) for AI agents.

## Tools

| Tool | Description |
|------|-------------|
| `bcra_tipo_cambio` | Cotizaciones del dólar y variables monetarias del BCRA |
| `infoleg_search` | Busca legislación argentina (leyes, decretos, resoluciones) |
| `afip_cuit_lookup` | Consulta datos públicos de un CUIT/CUIL en AFIP |
| `indec_stats` | Indicadores estadísticos del INDEC (IPC, EMAE, etc.) |
| `boletin_oficial_search` | Busca publicaciones en el Boletín Oficial |

## Installation

```bash
npm install
npm run build
```

## Usage

### Run directly

```bash
node dist/index.js
```

### Claude Desktop

Add this to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "argentina-data": {
      "command": "node",
      "args": ["/absolute/path/to/argentina-data-mcp/dist/index.js"]
    }
  }
}
```

### Run with npx (once published)

```bash
npx argentina-data-mcp
```

## Tool Details

### bcra_tipo_cambio

Consulta cotizaciones del dólar y variables monetarias del Banco Central.

```
variable: "dolar_oficial" | "dolar_mayorista" | "reservas" | "tasa_politica" | "badlar" | "inflacion_mensual" | "base_monetaria"
fecha_desde: "YYYY-MM-DD" (optional, default: 7 days ago)
fecha_hasta: "YYYY-MM-DD" (optional, default: today)
```

### infoleg_search

Busca legislación argentina en la base de InfoLeg.

```
query: string (required)
tipo: "ley" | "decreto" | "resolución" (optional)
limit: number (optional, default: 10, max: 50)
```

### afip_cuit_lookup

Consulta datos públicos asociados a un CUIT/CUIL.

```
cuit: string (required, 11 digits with or without dashes)
```

### indec_stats

Consulta indicadores estadísticos del INDEC.

```
indicador: "ipc" | "emae" | "ipc_nucleo" | "salarios" | "construccion" | "industria"
periodo: "YYYY-MM-DD" (optional)
```

### boletin_oficial_search

Busca publicaciones en el Boletín Oficial.

```
query: string (required)
seccion: "primera" | "segunda" | "tercera" (optional)
fecha: "YYYY-MM-DD" (optional, default: today)
```

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
