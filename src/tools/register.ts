import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { dolarCotizaciones } from "./cotizaciones_dolar.js";
import { bcraTipoCambio } from "./bcra_tipo_cambio.js";
import { infolegSearch } from "./infoleg_search.js";
import { afipCuitLookup } from "./afip_cuit_lookup.js";
import { indecStats } from "./indec_stats.js";
import { boletinOficialSearch } from "./boletin_oficial_search.js";
import { dataHealth } from "./data_health.js";
import { dolarHistorico } from "./dolar_historico.js";

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

const afipCuitLookupOutput = {
  cuit: z.string().describe("CUIT/CUIL number (11 digits, no separators)"),
  denominacion: z.string().describe("Legal name or business name"),
  tipo_persona: z.string().describe("Person type: FISICA or JURIDICA"),
  estado: z.string().describe("Tax registration status: ACTIVO, INACTIVO, etc."),
  actividades: z.array(z.string()).describe("Registered economic activities"),
  fuente: z.string().describe("Data source: cache_postgresql, api_directa"),
  actualizado_al: z.string().describe("Cache timestamp (ISO 8601)"),
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

const boletinOficialSearchOutput = {
  resultados: z.array(z.object({
    titulo: z.string().describe("Publication title"),
    seccion: z.string().describe("Section: primera, segunda, tercera"),
    fecha: z.string().describe("Publication date (YYYY-MM-DD)"),
    url: z.string().describe("URL to the official publication"),
  })).describe("Search results from the Boletín Oficial"),
  fuente: z.string().describe("Data source: postgresql, api_directa, or no_disponible"),
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
    estado: z.enum(["healthy", "degraded", "down"]).describe("Source health status"),
    ultima_actualizacion: z.string().nullable().describe("Last successful collector run (ISO 8601)"),
    ultimo_dato: z.string().nullable().describe("Most recent data date (YYYY-MM-DD)"),
    registros: z.number().describe("Total records in the database table"),
    error: z.string().nullable().describe("Error message if any"),
  })).describe("Health status for each data source"),
  resumen: z.string().describe("Summary line, e.g. '5/7 fuentes healthy'"),
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

  server.registerTool("afip_cuit_lookup", {
    description: "Consulta datos públicos asociados a un CUIT/CUIL en el padrón de AFIP. Retorna denominación, tipo de persona, estado y actividades. Usa cache en PostgreSQL.",
    inputSchema: {
      cuit: z.string().describe("CUIT o CUIL a consultar (11 dígitos, con o sin guiones)"),
    },
    outputSchema: afipCuitLookupOutput,
    _meta: toolMeta({ executeUsd: "0.001", latencyClass: "fast" }),
  }, async (input) => {
    try {
      return structuredResult(await afipCuitLookup(input));
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

  server.registerTool("boletin_oficial_search", {
    description: "Busca publicaciones en el Boletín Oficial de la República Argentina. Permite filtrar por sección y fecha.",
    inputSchema: {
      query: z.string().describe("Texto a buscar en el Boletín Oficial"),
      seccion: z.string().optional().describe("Sección: primera, segunda, tercera"),
      fecha: z.string().optional().describe("Fecha (YYYY-MM-DD). Default: hoy"),
    },
    outputSchema: boletinOficialSearchOutput,
    _meta: toolMeta({ executeUsd: "0.001", latencyClass: "fast" }),
  }, async (input) => {
    try {
      return structuredResult(await boletinOficialSearch(input));
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
}
