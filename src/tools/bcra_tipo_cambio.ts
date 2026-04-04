import { fetchJSON } from "../utils/http.js";
import { pool } from "../db/pool.js";

// BCRA API v4.0: https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias

interface BCRAv4Response {
  status: number;
  metadata: { resultset: { count: number; offset: number; limit: number } };
  results: {
    idVariable: number;
    detalle: { fecha: string; valor: number }[];
  }[];
}

// Variables más comunes del BCRA
const VARIABLES_CONOCIDAS: Record<string, number> = {
  dolar_oficial: 4,       // Tipo de cambio minorista (promedio vendedor)
  dolar_mayorista: 5,     // Tipo de cambio mayorista de referencia
  reservas: 1,            // Reservas internacionales
  badlar: 7,              // Tasa BADLAR bancos privados
  tm20: 8,                // Tasa TM20 bancos privados
  inflacion_mensual: 27,  // Variación mensual del IPC
  inflacion_interanual: 28, // Variación interanual del IPC
  base_monetaria: 15,     // Base monetaria
  circulacion_monetaria: 16, // Circulación monetaria
  icl: 40,                // Índice para Contratos de Locación
};

export interface BcraTipoCambioInput {
  variable?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
}

export interface BcraTipoCambioResult {
  datos: { fecha: string; valor: number; variable: string }[];
  fuente: string;
  fuente_url: string;
  actualizado_al: string;
  freshness: "current" | "stale" | "unknown";
}

const INDEC_VARS = new Set(["inflacion_mensual", "inflacion_interanual"]);

function fuenteForVariable(variable: string): { fuente: string; fuente_url: string } {
  if (INDEC_VARS.has(variable)) {
    return { fuente: "INDEC - IPC", fuente_url: "https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-5-31" };
  }
  return { fuente: "BCRA - Principales variables", fuente_url: "https://www.bcra.gob.ar/PublicacionesEstadisticas/Principales_variables.asp" };
}

export async function bcraTipoCambio(input: BcraTipoCambioInput): Promise<BcraTipoCambioResult> {
  const variableName = input.variable || "dolar_oficial";
  const idVariable = VARIABLES_CONOCIDAS[variableName];

  if (!idVariable) {
    const disponibles = Object.keys(VARIABLES_CONOCIDAS).join(", ");
    throw new Error(`Variable "${variableName}" no reconocida. Disponibles: ${disponibles}`);
  }

  const hoy = new Date();
  const fechaHasta = input.fecha_hasta || formatDate(hoy);
  const fechaDesde = input.fecha_desde || formatDate(daysAgo(hoy, 7));

  // Try PostgreSQL first
  try {
    const dbResult = await pool.query(
      `SELECT nombre, valor, fecha FROM bcra_variables
       WHERE id_variable = $1 AND fecha >= $2 AND fecha <= $3
       ORDER BY fecha DESC`,
      [idVariable, fechaDesde, fechaHasta]
    );
    if (dbResult.rows.length > 0) {
      const maxFecha = dbResult.rows[0].fecha;
      const ageHours = (Date.now() - new Date(maxFecha).getTime()) / 3600000;
      // BCRA data is daily and doesn't update on weekends/holidays
      // 72 hours covers Friday→Monday and long weekends
      return {
        datos: dbResult.rows.map((r: any) => ({
          fecha: r.fecha.toISOString().split("T")[0],
          valor: Number(r.valor),
          variable: variableName,
        })),
        ...fuenteForVariable(variableName),
        actualizado_al: maxFecha.toISOString().split("T")[0],
        freshness: ageHours < 72 ? "current" : "stale",
      };
    }
  } catch {
    // DB not available, fall through to API
  }

  // Fallback: direct API call (BCRA v4.0)
  const url = `https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/${idVariable}?desde=${fechaDesde}&hasta=${fechaHasta}`;
  const data = await fetchJSON<BCRAv4Response>(url);

  if (!data.results || data.results.length === 0 || !data.results[0].detalle || data.results[0].detalle.length === 0) {
    return { datos: [], ...fuenteForVariable(variableName), actualizado_al: fechaHasta, freshness: "unknown" };
  }

  const detalle = data.results[0].detalle;
  return {
    datos: detalle.map((r) => ({
      fecha: r.fecha,
      valor: r.valor,
      variable: variableName,
    })),
    ...fuenteForVariable(variableName),
    actualizado_al: detalle[0].fecha,
    freshness: "current",
  };
}

export async function listarVariablesBcra(): Promise<{ id: number; descripcion: string }[]> {
  const url = "https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias";
  const data = await fetchJSON<{ results: { idVariable: number; descripcion: string }[] }>(url);
  return data.results.map((r) => ({ id: r.idVariable, descripcion: r.descripcion }));
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysAgo(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return d;
}
