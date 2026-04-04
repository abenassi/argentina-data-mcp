import { pool } from "../db/pool.js";

// AFIP CUIT lookup from padrón ZIP data in PostgreSQL

export interface AfipCuitLookupInput {
  cuit: string;
}

// Human-readable labels for tax status codes
const GANANCIAS_LABELS: Record<string, string> = {
  AC: "Activo",
  NI: "No Inscripto",
  EX: "Exento",
  NC: "No Corresponde",
};

const IVA_LABELS: Record<string, string> = {
  AC: "Responsable Inscripto",
  NI: "No Inscripto",
  EX: "Exento",
  NA: "No Alcanzado",
  XN: "Exento - No Alcanzado",
  AN: "Activo - No Alcanzado",
};

const MONOTRIBUTO_LABELS: Record<string, string> = {
  NI: "No Inscripto",
  AC: "Activo (sin categoría)",
  ...(Object.fromEntries("ABCDEFGHIJK".split("").map((c) => [c, `Categoría ${c}`]))),
};

const ACTIVIDAD_MONOTRIBUTO_LABELS: Record<string, string> = {
  "00": "No registrada",
  "01": "Comercial",
  "02": "Profesional",
  "03": "Servicios",
  "04": "Industrial",
  "05": "Agropecuaria",
  "06": "Otras",
  "07": "Transitoria",
  "08": "Servicios/Locación",
  "09": "Otras actividades",
  "10": "Venta",
  "11": "Agricultura familiar",
};

export interface AfipCuitLookupResult {
  cuit: string;
  denominacion: string;
  tipo_persona: string;
  estado: string;
  imp_ganancias: string;
  imp_iva: string;
  monotributo: string;
  actividad_monotributo: string;
  empleador: boolean;
  integrante_sociedad: boolean;
  fuente: string;
  actualizado_al: string;
  freshness: "current" | "stale" | "unknown";
}

function validateCuit(cuit: string): string {
  const cleaned = cuit.replace(/[-\s]/g, "");
  if (!/^\d{11}$/.test(cleaned)) {
    throw new Error(`CUIT inválido: "${cuit}". Debe tener 11 dígitos.`);
  }
  return cleaned;
}

export async function afipCuitLookup(input: AfipCuitLookupInput): Promise<AfipCuitLookupResult> {
  const cuit = validateCuit(input.cuit);

  const result = await pool.query(
    `SELECT denominacion, tipo_persona, estado, imp_ganancias, imp_iva, monotributo,
            actividad_monotributo, empleador, integrante_sociedad, fetched_at
     FROM afip_cuit_cache WHERE cuit = $1`,
    [cuit]
  );

  if (result.rows.length === 0) {
    throw new Error(
      `CUIT ${cuit} no encontrado en el padrón de AFIP. ` +
      `El padrón contiene ~6 millones de contribuyentes registrados. ` +
      `Si el CUIT es válido, puede no estar registrado o haber sido dado de baja.`
    );
  }

  const row = result.rows[0];
  const ageHours = (Date.now() - new Date(row.fetched_at).getTime()) / 3600000;
  const ageDays = ageHours / 24;

  return {
    cuit,
    denominacion: row.denominacion || "N/A",
    tipo_persona: row.tipo_persona || "desconocido",
    estado: row.estado || "desconocido",
    imp_ganancias: GANANCIAS_LABELS[row.imp_ganancias] || row.imp_ganancias || "desconocido",
    imp_iva: IVA_LABELS[row.imp_iva] || row.imp_iva || "desconocido",
    monotributo: MONOTRIBUTO_LABELS[row.monotributo] || row.monotributo || "desconocido",
    actividad_monotributo: ACTIVIDAD_MONOTRIBUTO_LABELS[row.actividad_monotributo] || row.actividad_monotributo || "desconocido",
    empleador: row.empleador ?? false,
    integrante_sociedad: row.integrante_sociedad ?? false,
    fuente: "padron_afip_zip",
    actualizado_al: row.fetched_at.toISOString(),
    freshness: ageDays < 14 ? "current" : "stale",
  };
}
