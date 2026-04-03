#!/usr/bin/env node

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { dolarCotizaciones } from "./tools/cotizaciones_dolar.js";
import { bcraTipoCambio } from "./tools/bcra_tipo_cambio.js";
import { infolegSearch } from "./tools/infoleg_search.js";
import { afipCuitLookup } from "./tools/afip_cuit_lookup.js";
import { indecStats } from "./tools/indec_stats.js";
import { boletinOficialSearch } from "./tools/boletin_oficial_search.js";
import { dataHealth } from "./tools/data_health.js";
import { dolarHistorico } from "./tools/dolar_historico.js";

const server = new McpServer({
  name: "argentina-data-mcp",
  version: "0.2.0",
});

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

// Tool 1: dolar_cotizaciones (NEW)
server.tool(
  "dolar_cotizaciones",
  "Consulta cotizaciones actuales del dólar en Argentina: oficial, blue, bolsa, CCL, mayorista, cripto, tarjeta. Fuente: DolarAPI.com (Ámbito Financiero).",
  {},
  async () => {
    try {
      return jsonResult(await dolarCotizaciones());
    } catch (error) {
      return errorResult(error);
    }
  }
);

// Tool 2: bcra_tipo_cambio
server.tool(
  "bcra_tipo_cambio",
  "Consulta cotizaciones del dólar y variables monetarias del BCRA. Variables: dolar_oficial, dolar_mayorista, reservas, tasa_politica, badlar, inflacion_mensual, base_monetaria.",
  {
    variable: z.string().optional().describe("Variable a consultar (default: dolar_oficial)"),
    fecha_desde: z.string().optional().describe("Fecha desde (YYYY-MM-DD). Default: 7 días atrás"),
    fecha_hasta: z.string().optional().describe("Fecha hasta (YYYY-MM-DD). Default: hoy"),
  },
  async (input) => {
    try {
      return jsonResult(await bcraTipoCambio(input));
    } catch (error) {
      return errorResult(error);
    }
  }
);

// Tool 3: infoleg_search
server.tool(
  "infoleg_search",
  "Busca legislación argentina (leyes, decretos, resoluciones) en la base de InfoLeg del Ministerio de Justicia. Requiere que el dump CSV haya sido importado.",
  {
    query: z.string().describe("Texto a buscar en la legislación"),
    tipo: z.string().optional().describe("Tipo de norma: ley, decreto, resolución"),
    limit: z.number().optional().describe("Cantidad máxima de resultados (default: 10, max: 50)"),
  },
  async (input) => {
    try {
      return jsonResult(await infolegSearch(input));
    } catch (error) {
      return errorResult(error);
    }
  }
);

// Tool 4: afip_cuit_lookup
server.tool(
  "afip_cuit_lookup",
  "Consulta datos públicos asociados a un CUIT/CUIL en el padrón de AFIP. Retorna denominación, tipo de persona, estado y actividades. Usa cache en PostgreSQL.",
  {
    cuit: z.string().describe("CUIT o CUIL a consultar (11 dígitos, con o sin guiones)"),
  },
  async (input) => {
    try {
      return jsonResult(await afipCuitLookup(input));
    } catch (error) {
      return errorResult(error);
    }
  }
);

// Tool 5: indec_stats
server.tool(
  "indec_stats",
  "Consulta indicadores estadísticos del INDEC. Indicadores disponibles: ipc (Precios al Consumidor), emae (Actividad Económica), ipc_nucleo, salarios, construccion, industria.",
  {
    indicador: z.string().describe("Indicador a consultar: ipc, emae, ipc_nucleo, salarios, construccion, industria"),
    periodo: z.string().optional().describe("Período de inicio (YYYY-MM-DD). Default: último disponible"),
  },
  async (input) => {
    try {
      return jsonResult(await indecStats(input));
    } catch (error) {
      return errorResult(error);
    }
  }
);

// Tool 6: boletin_oficial_search
server.tool(
  "boletin_oficial_search",
  "Busca publicaciones en el Boletín Oficial de la República Argentina. Permite filtrar por sección y fecha.",
  {
    query: z.string().describe("Texto a buscar en el Boletín Oficial"),
    seccion: z.string().optional().describe("Sección: primera, segunda, tercera"),
    fecha: z.string().optional().describe("Fecha (YYYY-MM-DD). Default: hoy"),
  },
  async (input) => {
    try {
      return jsonResult(await boletinOficialSearch(input));
    } catch (error) {
      return errorResult(error);
    }
  }
);

// Tool 7: dolar_historico
server.tool(
  "dolar_historico",
  "Consulta la evolución histórica del dólar en Argentina. Tipos: blue, oficial, mep, ccl, mayorista, cripto, tarjeta. Datos desde 2024. Fuente: Ámbito Financiero.",
  {
    tipo: z.string().optional().describe("Tipo de dólar: blue, oficial, mep, ccl, mayorista, cripto, tarjeta (default: blue)"),
    fecha_desde: z.string().optional().describe("Fecha desde (YYYY-MM-DD). Default: 3 meses atrás"),
    fecha_hasta: z.string().optional().describe("Fecha hasta (YYYY-MM-DD). Default: hoy"),
  },
  async (input) => {
    try {
      return jsonResult(await dolarHistorico(input));
    } catch (error) {
      return errorResult(error);
    }
  }
);

// Tool 8: data_health
server.tool(
  "data_health",
  "Reporta el estado actual de cada fuente de datos del MCP: si está activa, última actualización, cantidad de registros y errores. Útil para diagnóstico rápido.",
  {},
  async () => {
    try {
      return jsonResult(await dataHealth());
    } catch (error) {
      return errorResult(error);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("argentina-data-mcp server running on stdio (v0.2.0)");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
