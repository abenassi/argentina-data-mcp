#!/bin/bash
# Setup script: Configura Claude Code + Ollama sub-agents globalmente
# Ejecutar en cualquier máquina donde quieras este setup
#
# Uso: bash scripts/setup-ollama-agents.sh

set -e

echo "=== Setup: Claude Code + Ollama Sub-Agents ==="
echo ""

# 1. Verificar/instalar Ollama
if ! command -v ollama &> /dev/null; then
    echo "Ollama no encontrado. Instalando..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install ollama || curl -fsSL https://ollama.com/install.sh | sh
    else
        curl -fsSL https://ollama.com/install.sh | sh
    fi
    echo "✓ Ollama instalado"
else
    echo "✓ Ollama ya instalado ($(ollama --version))"
fi

# 2. Descargar modelos recomendados
echo ""
echo "Descargando modelos..."
ollama pull qwen2.5-coder:32b  # ~20GB, principal para código
ollama pull qwen2.5-coder:7b   # ~5GB, rápido
ollama pull mistral:7b          # ~5GB, ultra-rápido
echo "✓ Modelos descargados"

# 3. Configurar MCP Server global
CLAUDE_JSON="$HOME/.claude.json"
if [ -f "$CLAUDE_JSON" ]; then
    # Verificar si ya tiene mcpServers configurado
    if grep -q '"mcpServers"' "$CLAUDE_JSON"; then
        echo "⚠ ~/.claude.json ya tiene mcpServers configurado. Verificá manualmente."
    else
        # Agregar mcpServers antes del cierre del JSON
        TMP=$(mktemp)
        python3 -c "
import json
with open('$CLAUDE_JSON') as f:
    data = json.load(f)
data['mcpServers'] = {
    'ollama': {
        'command': 'npx',
        'args': ['-y', 'ollama-mcp'],
        'env': {'OLLAMA_HOST': 'http://localhost:11434'}
    }
}
with open('$CLAUDE_JSON', 'w') as f:
    json.dump(data, f, indent=2)
"
        echo "✓ MCP server de Ollama agregado a ~/.claude.json"
    fi
else
    cat > "$CLAUDE_JSON" << 'JSONEOF'
{
  "mcpServers": {
    "ollama": {
      "command": "npx",
      "args": ["-y", "ollama-mcp"],
      "env": {
        "OLLAMA_HOST": "http://localhost:11434"
      }
    }
  }
}
JSONEOF
    echo "✓ ~/.claude.json creado con MCP server de Ollama"
fi

# 4. Crear sub-agentes globales
AGENTS_DIR="$HOME/.claude/agents"
mkdir -p "$AGENTS_DIR"

cat > "$AGENTS_DIR/local-coder.md" << 'AGENTEOF'
---
name: local-coder
description: Usa modelos locales Ollama para tareas de código simples como generar boilerplate, tests unitarios, documentación, traducciones de código, y resúmenes. Delega aquí cuando la tarea no requiere razonamiento complejo.
model: haiku
tools:
  - mcp__ollama__ollama_generate
  - mcp__ollama__ollama_chat
  - mcp__ollama__ollama_list
  - Read
  - Glob
  - Grep
---

Eres un agente que delega generación de código a modelos locales via Ollama.

## Instrucciones

1. Lee el contexto necesario del codebase (archivos relevantes, patterns existentes)
2. Formula un prompt claro y específico para el modelo local
3. Usa `ollama_generate` o `ollama_chat` con el modelo apropiado:
   - `qwen2.5-coder:32b` para generación de código compleja, refactoring
   - `qwen2.5-coder:7b` para tests, boilerplate, tareas simples
   - `mistral:7b` para resúmenes, clasificación, y tareas rápidas
4. Revisa la salida del modelo local antes de devolverla
5. Si la calidad es insuficiente, reformula el prompt y reintenta una vez

## Tips para mejores resultados

- Incluí siempre el lenguaje, framework y convenciones del proyecto en el prompt
- Para generación de código, mostrá ejemplos del código existente como referencia
- Para tests, incluí la función/clase bajo test y el framework de testing usado
- Pedí al modelo que explique su razonamiento brevemente

## Importante

- NO inventes código: siempre usa ollama_generate/ollama_chat
- Incluí contexto del codebase en el prompt al modelo local
- Si la tarea es demasiado compleja para el modelo local, decilo claramente
AGENTEOF

cat > "$AGENTS_DIR/local-reviewer.md" << 'AGENTEOF'
---
name: local-reviewer
description: Revisa código usando modelos locales Ollama. Útil para code review rápido, buscar bugs obvios, verificar estilo, y sugerir mejoras simples. Delega aquí para revisiones que no requieran entender la arquitectura completa del sistema.
model: haiku
tools:
  - mcp__ollama__ollama_chat
  - Read
  - Glob
  - Grep
---

Eres un agente que usa modelos locales para revisión de código.

## Instrucciones

1. Lee los archivos a revisar usando Read
2. Envía el código al modelo local via `ollama_chat` con modelo `qwen2.5-coder:32b`
3. En el prompt al modelo local incluí:
   - El código a revisar
   - El contexto del proyecto (lenguaje, framework, convenciones)
   - Qué tipo de review se pide (bugs, estilo, performance, seguridad)
4. Consolida y filtra los hallazgos del modelo local
5. Devuelve solo los findings relevantes y accionables

## Formato de respuesta

Para cada hallazgo reportá:
- **Archivo y línea**: dónde está el problema
- **Severidad**: alta/media/baja
- **Descripción**: qué encontró y por qué es un problema
- **Sugerencia**: cómo solucionarlo

## Importante

- Filtrá falsos positivos y hallazgos triviales
- Si el código es demasiado complejo para el modelo local, decilo
- NO modifiques archivos, solo reportá hallazgos
AGENTEOF

echo "✓ Sub-agentes creados en ~/.claude/agents/"

# 5. Verificación
echo ""
echo "=== Verificación ==="
echo "Modelos disponibles:"
ollama list
echo ""
echo "Ollama API:"
curl -s http://localhost:11434/api/tags | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d.get(\"models\",[]))} modelos disponibles')" 2>/dev/null || echo "⚠ Ollama no está corriendo. Ejecutá: ollama serve"
echo ""
echo "=== Setup completo ==="
echo "Abrí Claude Code en cualquier proyecto y los agentes local-coder y local-reviewer estarán disponibles."
