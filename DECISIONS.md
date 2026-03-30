# Decisiones Arquitectónicas

## 001 — Uso de fetch nativo de Node.js
**Fecha**: 2026-03-30
**Decisión**: Usar `fetch` nativo de Node 22 en lugar de axios/node-fetch.
**Razón**: Node 22 incluye fetch estable. Evita dependencias externas innecesarias.

## 002 — APIs sin autenticación
**Fecha**: 2026-03-30
**Decisión**: Todas las fuentes de datos iniciales son APIs públicas sin requerir API keys.
**Razón**: Simplifica el MVP. Si alguna requiere auth, se documenta y se pide confirmación.
