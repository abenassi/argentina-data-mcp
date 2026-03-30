#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { bcraTipoCambio } from "./tools/bcra_tipo_cambio.js";

const server = new McpServer({
  name: "argentina-data-mcp",
  version: "0.1.0",
});

// Tool 1: bcra_tipo_cambio
server.tool(
  "bcra_tipo_cambio",
  "Consulta cotizaciones del dólar y variables monetarias del BCRA (Banco Central de la República Argentina). Variables disponibles: dolar_oficial, dolar_mayorista, reservas, tasa_politica, badlar, inflacion_mensual, base_monetaria.",
  {
    variable: z.string().optional().describe("Variable a consultar (default: dolar_oficial). Opciones: dolar_oficial, dolar_mayorista, reservas, tasa_politica, badlar, inflacion_mensual, base_monetaria"),
    fecha_desde: z.string().optional().describe("Fecha desde (YYYY-MM-DD). Default: 7 días atrás"),
    fecha_hasta: z.string().optional().describe("Fecha hasta (YYYY-MM-DD). Default: hoy"),
  },
  async (input) => {
    try {
      const results = await bcraTipoCambio(input);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("argentina-data-mcp server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
