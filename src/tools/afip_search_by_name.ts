import { pool } from "../db/pool.js";

// AFIP search by name — trigram-backed search over 6M+ padrón records

// Human-readable labels (shared with afip_cuit_lookup)
const GANANCIAS_LABELS: Record<string, string> = {
  AC: "Activo", NI: "No Inscripto", EX: "Exento", NC: "No Corresponde",
};
const IVA_LABELS: Record<string, string> = {
  AC: "Responsable Inscripto", NI: "No Inscripto", EX: "Exento",
  NA: "No Alcanzado", XN: "Exento - No Alcanzado", AN: "Activo - No Alcanzado",
};
const MONOTRIBUTO_LABELS: Record<string, string> = {
  NI: "No Inscripto", AC: "Activo (sin categoría)",
  ...(Object.fromEntries("ABCDEFGHIJK".split("").map((c) => [c, `Categoría ${c}`]))),
};

export interface AfipSearchByNameInput {
  nombre: string;
  limit?: number;
}

export interface AfipSearchByNameResult {
  resultados: {
    cuit: string;
    denominacion: string;
    tipo_persona: string;
    estado: string;
    imp_ganancias: string;
    imp_iva: string;
    monotributo: string;
    empleador: boolean;
    integrante_sociedad: boolean;
  }[];
  total: number;
  query: string;
  fuente: string;
  nota: string;
}

export async function afipSearchByName(input: AfipSearchByNameInput): Promise<AfipSearchByNameResult> {
  const nombre = input.nombre.trim();
  if (!nombre || nombre.length < 3) {
    throw new Error("El nombre debe tener al menos 3 caracteres para buscar.");
  }

  const limit = Math.min(Math.max(input.limit || 10, 1), 50);

  // Use ILIKE for partial match (backed by GIN trigram index) + similarity for ranking
  const result = await pool.query(
    `SELECT cuit, denominacion, tipo_persona, estado, imp_ganancias, imp_iva,
            monotributo, empleador, integrante_sociedad,
            similarity(denominacion, $1) AS sim
     FROM afip_cuit_cache
     WHERE denominacion ILIKE $2
     ORDER BY sim DESC, denominacion ASC
     LIMIT $3`,
    [nombre.toUpperCase(), `%${nombre}%`, limit]
  );

  return {
    resultados: result.rows.map((row) => ({
      cuit: row.cuit,
      denominacion: row.denominacion || "N/A",
      tipo_persona: row.tipo_persona || "desconocido",
      estado: row.estado || "desconocido",
      imp_ganancias: GANANCIAS_LABELS[row.imp_ganancias] || row.imp_ganancias || "desconocido",
      imp_iva: IVA_LABELS[row.imp_iva] || row.imp_iva || "desconocido",
      monotributo: MONOTRIBUTO_LABELS[row.monotributo] || row.monotributo || "desconocido",
      empleador: row.empleador ?? false,
      integrante_sociedad: row.integrante_sociedad ?? false,
    })),
    total: result.rows.length,
    query: nombre,
    fuente: "padron_afip_zip",
    nota: `Búsqueda sobre ~6 millones de contribuyentes del padrón público de ARCA. Resultados ordenados por similitud.`,
  };
}
