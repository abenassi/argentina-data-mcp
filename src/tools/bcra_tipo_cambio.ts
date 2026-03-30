import { fetchJSON } from "../utils/http.js";

// BCRA API: https://api.bcra.gob.ar/
// Principales variables: https://api.bcra.gob.ar/estadisticas/v3.0/Monetarias

interface BCRADatoResponse {
  results: {
    fecha: string;
    valor: number;
  }[];
}

interface BCRAVariablesResponse {
  results: {
    idVariable: number;
    descripcion: string;
  }[];
}

// Variables más comunes del BCRA
const VARIABLES_CONOCIDAS: Record<string, number> = {
  "dolar_oficial": 4,       // Tipo de cambio minorista ($ por USD) - Comunicación B 9791
  "dolar_mayorista": 5,     // Tipo de cambio mayorista ($ por USD)
  "reservas": 1,            // Reservas internacionales del BCRA
  "tasa_politica": 6,       // Tasa de política monetaria
  "badlar": 7,              // BADLAR en pesos de bancos privados
  "inflacion_mensual": 27,  // Inflación mensual (CER)
  "base_monetaria": 15,     // Base monetaria
};

export interface BcraTipoCambioInput {
  variable?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
}

export interface BcraTipoCambioResult {
  fecha: string;
  valor: number;
  variable: string;
}

export async function bcraTipoCambio(input: BcraTipoCambioInput): Promise<BcraTipoCambioResult[]> {
  const variableName = input.variable || "dolar_oficial";
  const idVariable = VARIABLES_CONOCIDAS[variableName];

  if (!idVariable) {
    const disponibles = Object.keys(VARIABLES_CONOCIDAS).join(", ");
    throw new Error(
      `Variable "${variableName}" no reconocida. Disponibles: ${disponibles}`
    );
  }

  const hoy = new Date();
  const fechaHasta = input.fecha_hasta || formatDate(hoy);
  const fechaDesde = input.fecha_desde || formatDate(daysAgo(hoy, 7));

  const url = `https://api.bcra.gob.ar/estadisticas/v3.0/Monetarias/${idVariable}?desde=${fechaDesde}&hasta=${fechaHasta}`;

  const data = await fetchJSON<BCRADatoResponse>(url);

  if (!data.results || data.results.length === 0) {
    return [];
  }

  return data.results.map((r) => ({
    fecha: r.fecha,
    valor: r.valor,
    variable: variableName,
  }));
}

export async function listarVariablesBcra(): Promise<{ id: number; descripcion: string }[]> {
  const url = "https://api.bcra.gob.ar/estadisticas/v3.0/Monetarias";
  const data = await fetchJSON<BCRAVariablesResponse>(url);
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
