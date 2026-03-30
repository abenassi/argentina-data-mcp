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
