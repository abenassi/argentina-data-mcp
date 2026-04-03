# CLAUDE.md — Instrucciones de autonomía

## Reglas de desarrollo
- Trabajar de forma autónoma sin pedir confirmación en cada paso
- Hacer commits atómicos con mensajes descriptivos después de cada feature
- Tests deben pasar antes de cada commit
- Si una fuente de datos cambia su estructura, implementar fallback con error claro

## Decisiones arquitectónicas
- Documentar decisiones importantes en DECISIONS.md antes de proceder

## Checkpoints obligatorios (esperar confirmación)
1. Antes de agregar dependencias externas no listadas en package.json
2. Si una API pública requiere autenticación no esperada
3. Al terminar el MVP completo con todos los tools funcionando

## Stack
- TypeScript + Node.js
- @modelcontextprotocol/sdk para el server MCP
- vitest para tests
- APIs públicas argentinas (sin auth)

## Repositorio privado de estrategia
Existe un repo hermano privado en `~/repos/argentina-data-mcp-private` con estrategia, grant application, y roadmap del proyecto. Al empezar a trabajar en este repo, leer del repo privado:
- `strategy/ROADMAP.md` — para saber en qué fase estamos y cuáles son las prioridades actuales
- `grant-application/FORM-ANSWERS.md` (sección "Expected Evidence Fields / Output Schema") — para validar que las tools devuelvan los campos esperados por el grant
- `grant-application/GRANT-PROCESS.md` (sección "Requisitos técnicos") — para saber qué adaptaciones técnicas hacen falta (outputSchema, structuredContent, @ctxprotocol/sdk)
- NO leer: EMAIL-HISTORY.md, COMPETITIVE-ANALYSIS.md, PLATFORM-RESEARCH.md (no son relevantes para el desarrollo)
