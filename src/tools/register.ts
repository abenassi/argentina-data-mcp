import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { dolarCotizaciones } from "./cotizaciones_dolar.js";
import { bcraTipoCambio } from "./bcra_tipo_cambio.js";
import { infolegSearch } from "./infoleg_search.js";
import { indecStats } from "./indec_stats.js";

import { dataHealth } from "./data_health.js";
import { dolarHistorico } from "./dolar_historico.js";
import { listBcraVariables, listIndecIndicadores, listDolarTipos } from "./discovery.js";
import { legislacionTributaria } from "./legislacion_tributaria.js";
import { analisisEconomico } from "./analisis_economico.js";

// Shared freshness enum used across all tools
const freshnessSchema = z.enum(["current", "stale", "unknown"]).describe("Data freshness indicator: current (recently updated), stale (outdated), unknown");

// --- Output Schemas ---

const dolarCotizacionesOutput = {
  cotizaciones: z.array(z.object({
    tipo: z.string().describe("Dollar type identifier: oficial, blue, bolsa, contadoconliqui, mayorista, cripto, tarjeta"),
    nombre: z.string().describe("Human-readable name in Spanish"),
    compra: z.number().nullable().describe("Buy price in ARS"),
    venta: z.number().nullable().describe("Sell price in ARS"),
    fecha_actualizacion: z.string().describe("Last update timestamp (ISO 8601)"),
    variacion: z.number().describe("Daily change percentage"),
    spread_vs_oficial: z.number().nullable().describe("Spread vs official rate in percentage points"),
  })).describe("Array of dollar exchange rates"),
  fuente: z.string().describe("Data source: postgresql or api_directa"),
  actualizado_al: z.string().describe("Data timestamp (ISO 8601)"),
  freshness: freshnessSchema,
};

const bcraTipoCambioOutput = {
  datos: z.array(z.object({
    fecha: z.string().describe("Date (YYYY-MM-DD)"),
    valor: z.number().describe("Variable value"),
    variable: z.string().describe("Variable name"),
  })).describe("Time series data points"),
  fuente: z.string().describe("Data source: postgresql or api_directa"),
  actualizado_al: z.string().describe("Most recent data date (YYYY-MM-DD)"),
  freshness: freshnessSchema,
};

const infolegSearchOutput = {
  resultados: z.array(z.object({
    id_norma: z.number().describe("InfoLeg internal norm ID"),
    numero: z.string().describe("Norm number"),
    tipo: z.string().describe("Norm type: ley, decreto, resolución, etc."),
    titulo: z.string().describe("Norm title or summary"),
    fecha: z.string().describe("Enactment date (YYYY-MM-DD)"),
    url: z.string().describe("InfoLeg URL to view the full norm text"),
  })).describe("Search results ranked by relevance and recency"),
  total: z.number().describe("Number of results returned"),
  fuente: z.string().describe("Data source: postgresql_fts"),
  freshness: freshnessSchema,
};

const indecStatsOutput = {
  indicador: z.string().describe("Indicator key: ipc, emae, ipc_nucleo, salarios, construccion, industria"),
  descripcion: z.string().describe("Full indicator description in Spanish"),
  valor: z.number().describe("Latest value of the indicator (index number)"),
  periodo: z.string().describe("Period of the latest value (YYYY-MM-DD)"),
  variacion: z.number().optional().describe("Month-over-month change in percentage"),
  actualizado_al: z.string().describe("Data coverage end date (YYYY-MM-DD)"),
  is_updated: z.boolean().describe("Whether the series is up-to-date per datos.gob.ar"),
  fuente: z.string().describe("Data source: postgresql or api_directa"),
  freshness: freshnessSchema,
};


const dolarHistoricoOutput = {
  tipo: z.string().describe("Dollar type: blue, oficial, mep, ccl, mayorista, cripto, tarjeta"),
  datos: z.array(z.object({
    fecha: z.string().describe("Date (YYYY-MM-DD)"),
    compra: z.number().nullable().describe("Buy price in ARS"),
    venta: z.number().nullable().describe("Sell price in ARS"),
  })).describe("Historical daily exchange rates sorted chronologically"),
  registros: z.number().describe("Number of data points returned"),
  fuente: z.string().describe("Data source: postgresql (ámbito financiero)"),
  freshness: freshnessSchema,
};

const dataHealthOutput = {
  fuentes: z.array(z.object({
    nombre: z.string().describe("Data source name: dolar, bcra, indec, infoleg, etc."),
    estado: z.enum(["healthy", "degraded", "down", "disabled"]).describe("Source health status"),
    ultima_actualizacion: z.string().nullable().describe("Last successful collector run (ISO 8601)"),
    ultimo_dato: z.string().nullable().describe("Most recent data date (YYYY-MM-DD)"),
    registros: z.number().describe("Total records in the database table"),
    error: z.string().nullable().describe("Error message if any"),
  })).describe("Health status for each data source"),
  resumen: z.string().describe("Summary line, e.g. '5/7 fuentes healthy'"),
};

// --- Discovery output schemas ---

const listBcraVariablesOutput = {
  variables: z.array(z.object({
    nombre: z.string().describe("Variable key to use as 'variable' parameter in bcra_tipo_cambio"),
    descripcion: z.string().describe("Human-readable description in Spanish"),
    unidad: z.string().describe("Unit of measurement (ARS/USD, %, millones, índice)"),
    id_bcra: z.number().describe("BCRA API internal variable ID"),
  })).describe("All available BCRA variables"),
  total: z.number().describe("Total number of available variables"),
  uso: z.string().describe("Usage instructions for the agent"),
};

const listIndecIndicadoresOutput = {
  indicadores: z.array(z.object({
    nombre: z.string().describe("Indicator key to use as 'indicador' parameter in indec_stats"),
    descripcion: z.string().describe("Full indicator name in Spanish"),
    serie_id: z.string().describe("datos.gob.ar series ID"),
    frecuencia: z.string().describe("Update frequency (mensual)"),
  })).describe("All available INDEC indicators"),
  total: z.number().describe("Total number of available indicators"),
  uso: z.string().describe("Usage instructions for the agent"),
};

const listDolarTiposOutput = {
  tipos: z.array(z.object({
    nombre: z.string().describe("Dollar type key"),
    descripcion: z.string().describe("Human-readable description in Spanish"),
    tiene_historico: z.boolean().describe("Available in dolar_historico tool"),
    tiene_cotizacion_actual: z.boolean().describe("Available in dolar_cotizaciones tool"),
  })).describe("All available dollar types"),
  total: z.number().describe("Total number of dollar types"),
  uso: z.string().describe("Usage instructions for the agent"),
};

// --- Legislación tributaria output schema ---

const legislacionTributariaOutput = {
  impuesto: z.string().describe("Tax type: monotributo, ganancias, iva"),
  vigencia: z.string().describe("Validity period of the data"),
  norma_fuente: z.string().describe("Source law/regulation"),
  actualizado_al: z.string().describe("Date of last data update (YYYY-MM-DD)"),
  datos: z.object({}).passthrough().describe("Structured tax data — schema varies by impuesto type"),
};

// --- Intelligence tool output schema ---

const analisisEconomicoOutput = {
  analisis: z.string().describe("Analysis type: poder_adquisitivo, brecha_cambiaria"),
  periodo: z.object({
    desde: z.string().describe("Start date (YYYY-MM-DD)"),
    hasta: z.string().describe("End date (YYYY-MM-DD)"),
  }).describe("Analysis time period"),
  datos: z.object({}).passthrough().describe("Detailed analysis data with evolution and summary"),
  conclusion: z.string().describe("Human-readable conclusion in Spanish"),
  confianza: z.enum(["alta", "media", "baja"]).describe("Confidence level based on data quality"),
  fuentes: z.array(z.string()).describe("Data sources used for the analysis"),
};

// --- Helper functions ---

function structuredResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

// --- _meta: marketplace visibility, pricing, rate limits ---

const defaultRateLimit = {
  maxRequestsPerMinute: 60,
  cooldownMs: 1000,
  maxConcurrency: 5,
};

function toolMeta(overrides: { executeUsd: string; latencyClass?: string }) {
  return {
    surface: "both",
    queryEligible: true,
    latencyClass: overrides.latencyClass || "instant",
    pricing: { executeUsd: overrides.executeUsd },
    rateLimit: defaultRateLimit,
  };
}

// --- Register all tools on a server instance ---

export function registerTools(server: McpServer): void {
  server.registerTool("dolar_cotizaciones", {
    description: "Consulta cotizaciones actuales del dólar en Argentina: oficial, blue, bolsa, CCL, mayorista, cripto, tarjeta. Fuente: DolarAPI.com (Ámbito Financiero).",
    outputSchema: dolarCotizacionesOutput,
    _meta: toolMeta({ executeUsd: "0.001" }),
  }, async () => {
    try {
      return structuredResult(await dolarCotizaciones());
    } catch (error) {
      return errorResult(error);
    }
  });

  server.registerTool("bcra_tipo_cambio", {
    description: "Consulta cotizaciones del dólar y variables monetarias del BCRA. Variables: dolar_oficial, dolar_mayorista, reservas, badlar, tm20, inflacion_mensual, inflacion_interanual, base_monetaria, circulacion_monetaria, icl.",
    inputSchema: {
      variable: z.string().optional().describe("Variable a consultar (default: dolar_oficial)"),
      fecha_desde: z.string().optional().describe("Fecha desde (YYYY-MM-DD). Default: 7 días atrás"),
      fecha_hasta: z.string().optional().describe("Fecha hasta (YYYY-MM-DD). Default: hoy"),
    },
    outputSchema: bcraTipoCambioOutput,
    _meta: toolMeta({ executeUsd: "0.001" }),
  }, async (input) => {
    try {
      return structuredResult(await bcraTipoCambio(input));
    } catch (error) {
      return errorResult(error);
    }
  });

  server.registerTool("infoleg_search", {
    description: "Busca legislación argentina (leyes, decretos, resoluciones) en la base de InfoLeg del Ministerio de Justicia. Requiere que el dump CSV haya sido importado.",
    inputSchema: {
      query: z.string().describe("Texto a buscar en la legislación"),
      tipo: z.string().optional().describe("Tipo de norma: ley, decreto, resolución"),
      limit: z.number().optional().describe("Cantidad máxima de resultados (default: 10, max: 50)"),
    },
    outputSchema: infolegSearchOutput,
    _meta: toolMeta({ executeUsd: "0.002", latencyClass: "fast" }),
  }, async (input) => {
    try {
      return structuredResult(await infolegSearch(input));
    } catch (error) {
      return errorResult(error);
    }
  });

  server.registerTool("indec_stats", {
    description: "Consulta indicadores estadísticos del INDEC. Indicadores disponibles: ipc (Precios al Consumidor), emae (Actividad Económica), ipc_nucleo, salarios, construccion, industria.",
    inputSchema: {
      indicador: z.string().describe("Indicador a consultar: ipc, emae, ipc_nucleo, salarios, construccion, industria"),
      periodo: z.string().optional().describe("Período de inicio (YYYY-MM-DD). Default: último disponible"),
    },
    outputSchema: indecStatsOutput,
    _meta: toolMeta({ executeUsd: "0.001" }),
  }, async (input) => {
    try {
      return structuredResult(await indecStats(input));
    } catch (error) {
      return errorResult(error);
    }
  });

  server.registerTool("dolar_historico", {
    description: "Consulta la evolución histórica del dólar en Argentina. Tipos: blue, oficial, mep, ccl, mayorista, cripto, tarjeta. Datos desde 2024. Fuente: Ámbito Financiero.",
    inputSchema: {
      tipo: z.string().optional().describe("Tipo de dólar: blue, oficial, mep, ccl, mayorista, cripto, tarjeta (default: blue)"),
      fecha_desde: z.string().optional().describe("Fecha desde (YYYY-MM-DD). Default: 3 meses atrás"),
      fecha_hasta: z.string().optional().describe("Fecha hasta (YYYY-MM-DD). Default: hoy"),
    },
    outputSchema: dolarHistoricoOutput,
    _meta: toolMeta({ executeUsd: "0.001" }),
  }, async (input) => {
    try {
      return structuredResult(await dolarHistorico(input));
    } catch (error) {
      return errorResult(error);
    }
  });

  server.registerTool("data_health", {
    description: "Reporta el estado actual de cada fuente de datos del MCP: si está activa, última actualización, cantidad de registros y errores. Útil para diagnóstico rápido.",
    outputSchema: dataHealthOutput,
    _meta: toolMeta({ executeUsd: "0.0005" }),
  }, async () => {
    try {
      return structuredResult(await dataHealth());
    } catch (error) {
      return errorResult(error);
    }
  });

  // --- Discovery tools ---

  server.registerTool("list_bcra_variables", {
    description: "Lista todas las variables monetarias y cambiarias del BCRA disponibles para consulta. Usá esta tool primero para descubrir qué datos podés pedir con bcra_tipo_cambio.",
    outputSchema: listBcraVariablesOutput,
    _meta: toolMeta({ executeUsd: "0.0005" }),
  }, async () => {
    return structuredResult(listBcraVariables());
  });

  server.registerTool("list_indec_indicadores", {
    description: "Lista todos los indicadores estadísticos del INDEC disponibles para consulta. Usá esta tool primero para descubrir qué datos podés pedir con indec_stats.",
    outputSchema: listIndecIndicadoresOutput,
    _meta: toolMeta({ executeUsd: "0.0005" }),
  }, async () => {
    return structuredResult(listIndecIndicadores());
  });

  server.registerTool("list_dolar_tipos", {
    description: "Lista todos los tipos de dólar disponibles en Argentina: oficial, blue, MEP, CCL, mayorista, cripto, tarjeta. Indica cuáles tienen datos históricos y cuáles cotización actual.",
    outputSchema: listDolarTiposOutput,
    _meta: toolMeta({ executeUsd: "0.0005" }),
  }, async () => {
    return structuredResult(listDolarTipos());
  });

  // --- Intelligence tools ---

  server.registerTool("legislacion_tributaria", {
    description: "Consulta datos estructurados de legislación tributaria argentina: monotributo (categorías A-K, cuotas, topes), ganancias (deducciones, escala de alícuotas), IVA (alícuotas). Datos pre-computados y actualizados.",
    inputSchema: {
      impuesto: z.string().optional().describe("Impuesto a consultar: monotributo, ganancias, iva (default: monotributo)"),
    },
    outputSchema: legislacionTributariaOutput,
    _meta: toolMeta({ executeUsd: "0.001" }),
  }, async (input) => {
    try {
      return structuredResult(legislacionTributaria(input));
    } catch (error) {
      return errorResult(error);
    }
  });

  server.registerTool("analisis_economico", {
    description: "Análisis económico inteligente que combina múltiples fuentes de datos. Modos: poder_adquisitivo (salario real vs inflación, combina IPC + salarios INDEC), brecha_cambiaria (spread blue/oficial/MEP histórico con tendencia). Devuelve análisis con conclusión, no solo datos crudos.",
    inputSchema: {
      analisis: z.string().describe("Tipo de análisis: poder_adquisitivo, brecha_cambiaria"),
      meses: z.number().optional().describe("Cantidad de meses a analizar (default: 12, max: 24)"),
    },
    outputSchema: analisisEconomicoOutput,
    _meta: toolMeta({ executeUsd: "0.003", latencyClass: "fast" }),
  }, async (input) => {
    try {
      return structuredResult(await analisisEconomico(input));
    } catch (error) {
      return errorResult(error);
    }
  });
}
