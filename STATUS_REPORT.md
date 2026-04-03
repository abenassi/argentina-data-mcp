# Status Report — Argentina Data MCP

## Fecha: 2026-04-03

## APIs verificadas
| API | URL | Status | Notas |
|-----|-----|--------|-------|
| DolarAPI.com | `GET https://dolarapi.com/v1/ambito/dolares` | ✅ | 7 tipos de dólar, sin auth, respuesta instantánea |
| BCRA v4 | `GET https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/{id}` | ✅ | Funciona para 6 de 7 variables. Variable 6 (tasa_politica) devuelve 400 |
| datos.gob.ar | `GET https://apis.datos.gob.ar/series/api/series/` | ✅ | 6 series activas verificadas con metadata=full |
| InfoLeg dump | `GET https://datos.jus.gob.ar/.../base-infoleg-normativa-nacional.zip` | ✅ | ZIP de 46.7MB, 423,338 normas importadas a PostgreSQL |
| Boletín Oficial | `GET https://www.boletinoficial.gob.ar/api/search/normas` | ❌ | HTTP 302 redirect a /error/show. API bloqueada para requests no-browser |
| AFIP CUIT | `GET https://afip.tangofactura.com/Rest/GetContribuyenteCompleto` | ❌ | HTTP 404 — API eliminada. AFIP SOA también 404 |

## Series datos.gob.ar verificadas
| Indicador | Serie ID | Último dato | is_updated | Notas |
|-----------|----------|-------------|------------|-------|
| IPC Nacional | `148.3_INIVELNAL_DICI_M_26` | 2026-02-01 | ✅ True | OK |
| EMAE | `143.3_NO_PR_2004_A_21` | 2026-01-01 | ✅ True | OK |
| IPC Núcleo | `148.3_INUCLEONAL_DICI_M_19` | 2026-02-01 | ✅ True | OK |
| Salarios | `149.1_TL_INDIIOS_OCTU_0_21` | 2025-12-01 | ❌ False | Serie posiblemente discontinuada |
| ISAC (Construcción) | `33.2_ISAC_NIVELRAL_0_M_18_63` | 2026-01-01 | ✅ True | OK |
| IPI (Industria) | `453.1_SERIE_ORIGNAL_0_0_14_46` | 2026-01-01 | ✅ True | OK |

## Tools MCP funcionando
| Tool | Status | Lee de | Notas |
|------|--------|--------|-------|
| dolar_cotizaciones | ✅ | PostgreSQL / API fallback | 7 cotizaciones (oficial, blue, CCL, cripto, tarjeta, mayorista, bolsa) |
| bcra_tipo_cambio | ✅ | PostgreSQL / API fallback | v4.0 API, 7 variables configuradas |
| infoleg_search | ✅ | PostgreSQL FTS | 418,736 normas, full-text search en español |
| afip_cuit_lookup | ⚠️ | Cache + API fallback | API caída, funciona solo con cache preexistente |
| indec_stats | ✅ | PostgreSQL / API fallback | 6 indicadores con freshness metadata |
| boletin_oficial_search | ⚠️ | PostgreSQL / API fallback | API bloqueada, funciona si hay datos precargados |

## Servicios corriendo
| Servicio | Status | Notas |
|----------|--------|-------|
| PostgreSQL (Docker) | ✅ | Container `argentina-data-pg`, puerto 5432, volumen persistente |
| Collector Runner | ✅ | systemd service `argentina-data-collector`, enabled + active |
| MCP Server | ✅ | Disponible como `node dist/index.js` (stdio transport, invocado por cliente MCP) |

## Datos en PostgreSQL
```
   source_name   |   last_successful_fetch    | last_data_date | is_healthy
-----------------+----------------------------+----------------+------------
 bcra            | 2026-04-03 18:23:41        | 2026-04-03     | f (1 variable falla)
 boletin_oficial |                            |                | f (API bloqueada)
 dolar           | 2026-04-03 18:23:41        | 2026-04-03     | t
 indec           | 2026-04-03 18:23:41        | 2026-04-03     | t
 infoleg         | 2026-04-03 18:22:09        | 2026-04-03     | t
```

Row counts:
| Tabla | Count |
|-------|-------|
| cotizaciones_dolar | 7 |
| bcra_variables | 15 |
| indec_series | 144 |
| infoleg_normas | 418,736 |
| boletin_oficial | 0 |
| afip_cuit_cache | 0 |

## Tests
- Unit tests: 30/30 passing (6 test files)
- Integration tests: 10/10 passing (1 test file)
- Total: 40/40 passing

## Blockers encontrados
1. **AFIP CUIT API**: Todas las APIs públicas conocidas devuelven 404. tangofactura eliminada, AFIP SOA no responde. No hay forma de consultar CUITs sin credenciales especiales.
2. **Boletín Oficial API**: Devuelve 302 redirect a página de error. Requiere sesión de browser o cookies especiales. No hay dataset alternativo encontrado en datos.gob.ar.
3. **BCRA variable 6 (tasa_politica)**: Devuelve HTTP 400 en v4.0. Las otras 6 variables funcionan correctamente.

## Decisiones tomadas
1. **InfoLeg CSV en vez de API REST**: La API REST de InfoLeg es inestable. Descargué el dump CSV completo (46.7MB, 423K normas) e importé a PostgreSQL con full-text search en español. Mucho más confiable y rápido.
2. **DolarAPI.com como fuente principal de cotizaciones**: Usa los datos de Ámbito Financiero, tiene 7 tipos de dólar, sin auth, respuesta inmediata.
3. **BCRA v3 �� v4**: El endpoint cambió de `v3.0` a `v4.0` y la estructura de respuesta cambió de `results[].fecha/valor` a `results[0].detalle[].fecha/valor`.
4. **datos.gob.ar response parsing**: Los datos vienen como array de arrays `[["2026-02-01", 10714.6]]`, no como objetos. Corregido el parsing.
5. **Series IDs actualizados**: IPC=`148.3_INIVELNAL_DICI_M_26`, IPC Núcleo=`148.3_INUCLEONAL_DICI_M_19`, Salarios=`149.1_TL_INDIIOS_OCTU_0_21`, ISAC=`33.2_ISAC_NIVELRAL_0_M_18_63`, IPI=`453.1_SERIE_ORIGNAL_0_0_14_46`.
6. **Dual-path en tools (DB primero, API fallback)**: Cada tool intenta leer de PostgreSQL primero. Si la DB está vacía o no disponible, llama a la API directamente. Esto permite que el MCP server funcione sin DB y que los unit tests sigan pasando con mocks.
7. **MCP server como stdio (no systemd)**: El MCP server usa transporte stdio, por lo que no funciona como servicio standalone. Se invoca directamente desde el cliente MCP (Claude Desktop, etc.).
8. **Collector runner como systemd service**: El collector corre como servicio persistente que recolecta datos automáticamente.

## Preguntas para mí
1. ¿Conocés alguna API pública de AFIP/ARCA que funcione para consultar CUITs? La de tangofactura murió y la oficial requiere certificados digitales.
2. ¿Querés que investigue web scraping del Boletín Oficial como alternativa?
3. ¿La variable `tasa_politica` (BCRA variable 6) la sacamos del mapa de variables o buscamos un ID alternativo en v4?
4. ¿Querés que configure el MCP server en tu claude_desktop_config.json o settings.json para que los tools estén disponibles desde Claude?
5. La serie de Salarios tiene `is_updated: False` — ¿querés que busque una serie alternativa o la dejamos?
