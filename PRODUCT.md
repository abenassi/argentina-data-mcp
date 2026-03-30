# Argentina Data MCP — Product Document

## Problema que resuelve
Los agentes de IA necesitan acceder a datos argentinos en tiempo real (tipo de cambio, legislación, datos impositivos) pero estas fuentes están fragmentadas en múltiples APIs gubernamentales con formatos inconsistentes. Este MCP server unifica el acceso a estos datos en una interfaz estándar que cualquier agente compatible con MCP puede consumir.

## Tools

### 1. `bcra_tipo_cambio`
Consulta cotizaciones del dólar oficial y principales variables monetarias del BCRA.
- **Input**: `{ variable?: string, fecha_desde?: string, fecha_hasta?: string }`
- **Output**: `{ fecha: string, valor: number, variable: string }[]`
- **Fuente**: API REST pública del BCRA

### 2. `infoleg_search`
Busca legislación argentina (leyes, decretos, resoluciones) en la base de InfoLeg.
- **Input**: `{ query: string, tipo?: "ley" | "decreto" | "resolución", limit?: number }`
- **Output**: `{ numero: string, tipo: string, titulo: string, fecha: string, url: string }[]`
- **Fuente**: InfoLeg (Ministerio de Justicia)

### 3. `afip_cuit_lookup`
Consulta datos públicos asociados a un CUIT/CUIL en AFIP.
- **Input**: `{ cuit: string }`
- **Output**: `{ cuit: string, denominacion: string, tipo_persona: string, estado: string, actividades: string[] }`
- **Fuente**: Padrón público AFIP

### 4. `indec_stats`
Consulta indicadores estadísticos del INDEC (IPC, actividad económica, etc.).
- **Input**: `{ indicador: string, periodo?: string }`
- **Output**: `{ indicador: string, valor: number, periodo: string, variacion?: number }`
- **Fuente**: INDEC / datos.gob.ar

### 5. `boletin_oficial_search`
Busca publicaciones recientes en el Boletín Oficial de la República Argentina.
- **Input**: `{ query: string, seccion?: "primera" | "segunda" | "tercera", fecha?: string }`
- **Output**: `{ titulo: string, seccion: string, fecha: string, url: string }[]`
- **Fuente**: Boletín Oficial

## Monetización (Context Protocol)
- Precio por llamada: $0.05 - $0.15 USD según el tool
- `bcra_tipo_cambio`: $0.05
- `infoleg_search`: $0.10
- `afip_cuit_lookup`: $0.10
- `indec_stats`: $0.10
- `boletin_oficial_search`: $0.15

## Criterios de MVP (Done)
1. Los 5 MCP tools responden correctamente con datos reales
2. Tests básicos para cada tool (al menos happy path + error handling)
3. README con instrucciones de instalación y uso
4. El server corre con `npx` sin configuración adicional
5. Compatible con Claude Desktop (testeable localmente)
