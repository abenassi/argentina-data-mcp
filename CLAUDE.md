# CLAUDE.md — Argentina Data MCP

## Para agentes de desarrollo

Este es el repositorio público con el código del MCP server. Las instrucciones completas para agentes (roles, contexto, workflow, decisiones técnicas) están en el **repositorio privado**:

```
~/repos/argentina-data-mcp-private
```

Antes de empezar a trabajar, leé el `CLAUDE.md` de ese repo. Ahí se define tu rol (desarrollador o product owner), qué archivos leer, y cómo operar.

Si no tenés acceso al repo privado, estas son las reglas mínimas:
- Trabajar de forma autónoma sin pedir confirmación en cada paso
- Hacer commits atómicos con mensajes descriptivos
- Tests deben pasar antes de cada commit (`npm test`)
- Commit directo a `master`, sin feature branches
- Si una fuente de datos cambia su estructura, implementar fallback con error claro

## Stack
- TypeScript + Node.js
- @modelcontextprotocol/sdk para el server MCP
- PostgreSQL (Docker) para almacenamiento
- vitest para tests
- APIs públicas argentinas (sin auth)
