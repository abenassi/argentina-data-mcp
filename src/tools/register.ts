import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { dolarCotizaciones } from "./cotizaciones_dolar.js";
import { bcraTipoCambio } from "./bcra_tipo_cambio.js";
import { infolegSearch } from "./infoleg_search.js";
import { boletinOficialSearch } from "./boletin_oficial_search.js";
import { indecStats } from "./indec_stats.js";

import { dataHealth } from "./data_health.js";
import { dolarHistorico } from "./dolar_historico.js";
import { listBcraVariables, listIndecIndicadores, listDolarTipos } from "./discovery.js";
import { legislacionTributaria } from "./legislacion_tributaria.js";
import { analisisEconomico } from "./analisis_economico.js";
import { feriadosNacionales } from "./feriados_nacionales.js";
import { afipSearchByName } from "./afip_search_by_name.js";
import { logToolCall } from "../request_log.js";

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
  fuente: z.string().describe("Original data source name"),
  fuente_url: z.string().describe("URL of the original data source"),
  actualizado_al: z.string().describe("Data timestamp (ISO 8601)"),
  freshness: freshnessSchema,
};

const bcraTipoCambioOutput = {
  datos: z.array(z.object({
    fecha: z.string().describe("Date (YYYY-MM-DD)"),
    valor: z.number().describe("Variable value"),
    variable: z.string().describe("Variable name"),
  })).describe("Time series data points"),
  fuente: z.string().describe("Original data source name"),
  fuente_url: z.string().describe("URL of the original data source"),
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
  fuente: z.string().describe("Original data source name"),
  fuente_url: z.string().describe("URL of the original data source"),
  freshness: freshnessSchema,
};

const boletinOficialSearchOutput = {
  resultados: z.array(z.object({
    id_aviso: z.string().describe("Boletín Oficial aviso ID"),
    organismo: z.string().describe("Publishing organization name"),
    tipo_norma: z.string().describe("Norm type and number, e.g. 'Decreto 100/2026', 'Resolución 50/2026'"),
    seccion: z.string().describe("Section: primera, segunda, tercera"),
    fecha: z.string().describe("Publication date (YYYY-MM-DD)"),
    url: z.string().describe("URL to view the full aviso on boletinoficial.gob.ar"),
  })).describe("Search results ranked by date and relevance"),
  total: z.number().describe("Number of results returned"),
  fuente: z.string().describe("Original data source name"),
  fuente_url: z.string().describe("URL of the original data source"),
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
  fuente: z.string().describe("Original data source name"),
  fuente_url: z.string().describe("URL of the original data source"),
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
  fuente: z.string().describe("Original data source name"),
  fuente_url: z.string().describe("URL of the original data source"),
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

// --- Feriados output schema ---

const feriadosNacionalesOutput = {
  anio: z.number().describe("Year of the holidays"),
  mes: z.number().nullable().describe("Month filter (null if showing full year)"),
  feriados: z.array(z.object({
    fecha: z.string().describe("Holiday date (YYYY-MM-DD)"),
    nombre: z.string().describe("Holiday name in Spanish"),
    tipo: z.string().describe("Holiday type: inamovible, trasladable, puente"),
  })).describe("List of national holidays"),
  total: z.number().describe("Number of holidays returned"),
  dias_habiles: z.number().nullable().describe("Business days in the month (only when mes is specified)"),
  fuente: z.string().describe("Original data source name"),
  fuente_url: z.string().describe("URL of the original data source"),
};

// --- AFIP search by name output schema ---

const afipSearchByNameOutput = {
  resultados: z.array(z.object({
    cuit: z.string().describe("CUIT number (11 digits)"),
    denominacion: z.string().describe("Name or business name"),
    tipo_persona: z.string().describe("Person type: FISICA or JURIDICA"),
    estado: z.string().describe("Registration status: ACTIVO, INACTIVO"),
    imp_ganancias: z.string().describe("Income tax status"),
    imp_iva: z.string().describe("VAT status"),
    monotributo: z.string().describe("Monotributo category (A-K) or registration status"),
    empleador: z.boolean().describe("Whether registered as employer"),
    integrante_sociedad: z.boolean().describe("Whether member of a company/partnership"),
  })).describe("Matching taxpayer records sorted by similarity"),
  total: z.number().describe("Number of results returned"),
  query: z.string().describe("Original search query"),
  fuente: z.string().describe("Data source identifier"),
  nota: z.string().describe("Note about the data source and coverage"),
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

/** Wrap a tool handler with request logging. Adds <5ms overhead (fire-and-forget INSERT). */
function withLog<T>(toolName: string, handler: (input: T) => Promise<ReturnType<typeof structuredResult> | ReturnType<typeof errorResult>>): (input: T) => Promise<ReturnType<typeof structuredResult> | ReturnType<typeof errorResult>> {
  return async (input: T) => {
    const start = Date.now();
    const result = await handler(input);
    const ms = Date.now() - start;
    const isErr = result && "isError" in result && result.isError;
    logToolCall(toolName, ms, isErr ? "error" : "ok", isErr ? result.content?.[0]?.text : undefined);
    return result;
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
  }, withLog("dolar_cotizaciones", async () => {
    try {
      return structuredResult(await dolarCotizaciones());
    } catch (error) {
      return errorResult(error);
    }
  }));

  server.registerTool("bcra_tipo_cambio", {
    description: "Consulta cotizaciones del dólar y variables monetarias del BCRA. Variables: dolar_oficial, dolar_mayorista, reservas, badlar, tm20, inflacion_mensual, inflacion_interanual, base_monetaria, circulacion_monetaria, icl.",
    inputSchema: {
      variable: z.string().optional().describe("Variable a consultar (default: dolar_oficial)"),
      fecha_desde: z.string().optional().describe("Fecha desde (YYYY-MM-DD). Default: 7 días atrás"),
      fecha_hasta: z.string().optional().describe("Fecha hasta (YYYY-MM-DD). Default: hoy"),
    },
    outputSchema: bcraTipoCambioOutput,
    _meta: toolMeta({ executeUsd: "0.001" }),
  }, withLog("bcra_tipo_cambio", async (input) => {
    try {
      return structuredResult(await bcraTipoCambio(input));
    } catch (error) {
      return errorResult(error);
    }
  }));

  server.registerTool("infoleg_search", {
    description: "Busca legislación argentina (leyes, decretos, resoluciones) en la base de InfoLeg del Ministerio de Justicia. Requiere que el dump CSV haya sido importado.",
    inputSchema: {
      query: z.string().describe("Texto a buscar en la legislación"),
      tipo: z.string().optional().describe("Tipo de norma: ley, decreto, resolución"),
      limit: z.number().optional().describe("Cantidad máxima de resultados (default: 10, max: 50)"),
    },
    outputSchema: infolegSearchOutput,
    _meta: toolMeta({ executeUsd: "0.002", latencyClass: "fast" }),
  }, withLog("infoleg_search", async (input) => {
    try {
      return structuredResult(await infolegSearch(input));
    } catch (error) {
      return errorResult(error);
    }
  }));

  server.registerTool("boletin_oficial_search", {
    description: "Busca publicaciones en el Boletín Oficial de la República Argentina. Encuentra decretos, resoluciones, disposiciones y avisos por texto. Datos desde el dump diario del boletinoficial.gob.ar.",
    inputSchema: {
      query: z.string().describe("Texto a buscar (organismo, tipo de norma, tema)"),
      seccion: z.string().optional().describe("Filtrar por sección: primera, segunda, tercera"),
      fecha: z.string().optional().describe("Filtrar por fecha de publicación (YYYY-MM-DD)"),
    },
    outputSchema: boletinOficialSearchOutput,
    _meta: toolMeta({ executeUsd: "0.002", latencyClass: "fast" }),
  }, withLog("boletin_oficial_search", async (input) => {
    try {
      return structuredResult(await boletinOficialSearch(input));
    } catch (error) {
      return errorResult(error);
    }
  }));

  server.registerTool("indec_stats", {
    description: "Consulta indicadores estadísticos del INDEC. Indicadores disponibles: ipc (Precios al Consumidor), emae (Actividad Económica), ipc_nucleo, salarios, construccion, industria.",
    inputSchema: {
      indicador: z.string().describe("Indicador a consultar: ipc, emae, ipc_nucleo, salarios, construccion, industria"),
      periodo: z.string().optional().describe("Período de inicio (YYYY-MM-DD). Default: último disponible"),
    },
    outputSchema: indecStatsOutput,
    _meta: toolMeta({ executeUsd: "0.001" }),
  }, withLog("indec_stats", async (input) => {
    try {
      return structuredResult(await indecStats(input));
    } catch (error) {
      return errorResult(error);
    }
  }));

  server.registerTool("dolar_historico", {
    description: "Consulta la evolución histórica del dólar en Argentina. Tipos: blue, oficial, mep, ccl, mayorista, cripto, tarjeta. Datos desde 2024. Fuente: Ámbito Financiero.",
    inputSchema: {
      tipo: z.string().optional().describe("Tipo de dólar: blue, oficial, mep, ccl, mayorista, cripto, tarjeta (default: blue)"),
      fecha_desde: z.string().optional().describe("Fecha desde (YYYY-MM-DD). Default: 3 meses atrás"),
      fecha_hasta: z.string().optional().describe("Fecha hasta (YYYY-MM-DD). Default: hoy"),
    },
    outputSchema: dolarHistoricoOutput,
    _meta: toolMeta({ executeUsd: "0.001" }),
  }, withLog("dolar_historico", async (input) => {
    try {
      return structuredResult(await dolarHistorico(input));
    } catch (error) {
      return errorResult(error);
    }
  }));

  server.registerTool("data_health", {
    description: "Reporta el estado actual de cada fuente de datos del MCP: si está activa, última actualización, cantidad de registros y errores. Útil para diagnóstico rápido.",
    outputSchema: dataHealthOutput,
    _meta: toolMeta({ executeUsd: "0.0005" }),
  }, withLog("data_health", async () => {
    try {
      return structuredResult(await dataHealth());
    } catch (error) {
      return errorResult(error);
    }
  }));

  // --- Discovery tools ---

  server.registerTool("list_bcra_variables", {
    description: "Lista todas las variables monetarias y cambiarias del BCRA disponibles para consulta. Usá esta tool primero para descubrir qué datos podés pedir con bcra_tipo_cambio.",
    outputSchema: listBcraVariablesOutput,
    _meta: toolMeta({ executeUsd: "0.0005" }),
  }, withLog("list_bcra_variables", async () => {
    return structuredResult(listBcraVariables());
  }));

  server.registerTool("list_indec_indicadores", {
    description: "Lista todos los indicadores estadísticos del INDEC disponibles para consulta. Usá esta tool primero para descubrir qué datos podés pedir con indec_stats.",
    outputSchema: listIndecIndicadoresOutput,
    _meta: toolMeta({ executeUsd: "0.0005" }),
  }, withLog("list_indec_indicadores", async () => {
    return structuredResult(listIndecIndicadores());
  }));

  server.registerTool("list_dolar_tipos", {
    description: "Lista todos los tipos de dólar disponibles en Argentina: oficial, blue, MEP, CCL, mayorista, cripto, tarjeta. Indica cuáles tienen datos históricos y cuáles cotización actual.",
    outputSchema: listDolarTiposOutput,
    _meta: toolMeta({ executeUsd: "0.0005" }),
  }, withLog("list_dolar_tipos", async () => {
    return structuredResult(listDolarTipos());
  }));

  // --- Intelligence tools ---

  server.registerTool("legislacion_tributaria", {
    description: "Consulta datos estructurados de legislación tributaria argentina: monotributo (categorías A-K, cuotas, topes), ganancias (deducciones, escala de alícuotas), IVA (alícuotas). Datos pre-computados y actualizados.",
    inputSchema: {
      impuesto: z.string().optional().describe("Impuesto a consultar: monotributo, ganancias, iva (default: monotributo)"),
    },
    outputSchema: legislacionTributariaOutput,
    _meta: toolMeta({ executeUsd: "0.001" }),
  }, withLog("legislacion_tributaria", async (input) => {
    try {
      return structuredResult(legislacionTributaria(input));
    } catch (error) {
      return errorResult(error);
    }
  }));

  server.registerTool("analisis_economico", {
    description: "Análisis económico inteligente que combina múltiples fuentes de datos. Modos: poder_adquisitivo (salario real vs inflación, combina IPC + salarios INDEC), brecha_cambiaria (spread blue/oficial/MEP histórico con tendencia). Devuelve análisis con conclusión, no solo datos crudos.",
    inputSchema: {
      analisis: z.string().describe("Tipo de análisis: poder_adquisitivo, brecha_cambiaria"),
      meses: z.number().optional().describe("Cantidad de meses a analizar (default: 12, max: 24)"),
    },
    outputSchema: analisisEconomicoOutput,
    _meta: toolMeta({ executeUsd: "0.003", latencyClass: "fast" }),
  }, withLog("analisis_economico", async (input) => {
    try {
      return structuredResult(await analisisEconomico(input));
    } catch (error) {
      return errorResult(error);
    }
  }));

  server.registerTool("feriados_nacionales", {
    description: "Consulta feriados nacionales argentinos por año o mes. Incluye feriados inamovibles, trasladables y puentes turísticos. Calcula días hábiles del mes si se especifica. Fuente: Argentina Datos.",
    inputSchema: {
      anio: z.number().optional().describe("Año a consultar (default: año actual)"),
      mes: z.number().optional().describe("Mes a filtrar (1-12). Si se especifica, también calcula días hábiles"),
    },
    outputSchema: feriadosNacionalesOutput,
    _meta: toolMeta({ executeUsd: "0.001" }),
  }, withLog("feriados_nacionales", async (input) => {
    try {
      return structuredResult(await feriadosNacionales(input));
    } catch (error) {
      return errorResult(error);
    }
  }));

  server.registerTool("afip_search_by_name", {
    description: "Busca contribuyentes en el padrón de ARCA (ex-AFIP) por nombre o denominación. Devuelve CUIT, estado fiscal, IVA, Ganancias y Monotributo. Útil cuando se conoce el nombre pero no el CUIT. Base: ~6 millones de contribuyentes.",
    inputSchema: {
      nombre: z.string().describe("Nombre o denominación a buscar (mínimo 3 caracteres)"),
      limit: z.number().optional().describe("Cantidad máxima de resultados (default: 10, max: 50)"),
    },
    outputSchema: afipSearchByNameOutput,
    _meta: toolMeta({ executeUsd: "0.002", latencyClass: "fast" }),
  }, withLog("afip_search_by_name", async (input) => {
    try {
      return structuredResult(await afipSearchByName(input));
    } catch (error) {
      return errorResult(error);
    }
  }));
}
