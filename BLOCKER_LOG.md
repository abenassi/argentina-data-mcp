# Blocker Log — Argentina Data MCP

## BLOCKER 1: AFIP CUIT API unavailable
- **Date**: 2026-04-03
- **Description**: All known AFIP/ARCA CUIT lookup APIs are down or return 404:
  - `https://afip.tangofactura.com/Rest/GetContribuyenteCompleto` → 404 (resource not found)
  - `https://soa.afip.gob.ar/sr-padron/v2/persona/{cuit}` → 404
  - `https://soa.afip.gob.ar/sr-padron/v2/personas/{cuit}` → 404
  - `https://soa.arca.gob.ar/sr-padron/v2/persona/{cuit}` → timeout/empty
  - `https://datos.afip.gob.ar/contribuyentes-puc-json/v1/padron-puc/{cuit}` → timeout/empty
- **Impact**: `afip_cuit_lookup` tool cannot fetch live data. Tool will be kept as-is but will always fail on API call. Cache (if populated) would still work.
- **Needs**: User to find a working AFIP CUIT API endpoint or provide auth credentials for the official AFIP webservice.

## BLOCKER 2: Boletín Oficial API blocked
- **Date**: 2026-04-03
- **Description**: The Boletín Oficial API at `https://www.boletinoficial.gob.ar/api/search/normas` returns HTTP 302 redirect to `/error/show`. The API appears to be blocked for non-browser requests or requires session cookies.
- **Impact**: `boletin_oficial_search` tool and collector cannot fetch data.
- **Needs**: User to investigate web scraping approach, find alternative data source, or determine if there's an auth requirement.
