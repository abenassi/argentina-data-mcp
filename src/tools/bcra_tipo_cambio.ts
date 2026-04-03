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
  dolar_oficial: 4,
  dolar_mayorista: 5,
  reservas: 1,
  tasa_politica: 6,
  badlar: 7,
  inflacion_mensual: 27,
  base_monetaria: 15,
};

export interface BcraTipoCambioInput {
  variable?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
}

export interface BcraTipoCambioResult {
  datos: { fecha: string; valor: number; variable: string }[];
  fuente: string;
  actualizado_al: string;
  freshness: "current" | "stale" | "unknown";
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
      return {
        datos: dbResult.rows.map((r: any) => ({
          fecha: r.fecha.toISOString().split("T")[0],
          valor: Number(r.valor),
          variable: variableName,
        })),
        fuente: "postgresql",
        actualizado_al: maxFecha.toISOString().split("T")[0],
        freshness: ageHours < 24 ? "current" : "stale",
      };
    }
  } catch {
    // DB not available, fall through to API
  }

  // Fallback: direct API call (BCRA v4.0)
  const url = `https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/${idVariable}?desde=${fechaDesde}&hasta=${fechaHasta}`;
  const data = await fetchJSON<BCRAv4Response>(url);

  if (!data.results || data.results.length === 0 || !data.results[0].detalle || data.results[0].detalle.length === 0) {
    return { datos: [], fuente: "api_directa", actualizado_al: fechaHasta, freshness: "unknown" };
  }

  const detalle = data.results[0].detalle;
  return {
    datos: detalle.map((r) => ({
      fecha: r.fecha,
      valor: r.valor,
      variable: variableName,
    })),
    fuente: "api_directa",
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
