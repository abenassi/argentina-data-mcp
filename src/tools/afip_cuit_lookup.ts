import { fetchJSON } from "../utils/http.js";
import { pool } from "../db/pool.js";

// AFIP CUIT lookup with PostgreSQL cache

interface AfipPersonaResponse {
  persona?: {
    tipoClave: string;
    idPersona: number;
    nombre?: string;
    apellido?: string;
    razonSocial?: string;
    tipoPersona: string;
    estadoClave: string;
    actividades?: { idActividad: number; descripcion: string }[];
  };
  success?: boolean;
  error?: string;
}

export interface AfipCuitLookupInput {
  cuit: string;
}

export interface AfipCuitLookupResult {
  cuit: string;
  denominacion: string;
  tipo_persona: string;
  estado: string;
  actividades: string[];
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

  // Check PostgreSQL cache first
  try {
    const cached = await pool.query(
      "SELECT denominacion, tipo_persona, estado, actividades, fetched_at FROM afip_cuit_cache WHERE cuit = $1",
      [cuit]
    );
    if (cached.rows.length > 0) {
      const row = cached.rows[0];
      const ageHours = (Date.now() - new Date(row.fetched_at).getTime()) / 3600000;
      return {
        cuit,
        denominacion: row.denominacion || "N/A",
        tipo_persona: row.tipo_persona || "desconocido",
        estado: row.estado || "desconocido",
        actividades: row.actividades || [],
        fuente: "cache_postgresql",
        actualizado_al: row.fetched_at.toISOString(),
        freshness: ageHours < 168 ? "current" : "stale", // 7 days
      };
    }
  } catch {
    // DB not available, fall through to API
  }

  // Try API (currently known to be down, but kept for when it comes back)
  const url = `https://afip.tangofactura.com/Rest/GetContribuyenteCompleto?cuit=${cuit}`;
  const data = await fetchJSON<AfipPersonaResponse>(url);

  if (!data.persona && data.error) {
    throw new Error(`CUIT ${cuit} no encontrado: ${data.error}`);
  }

  if (!data.persona) {
    throw new Error(`CUIT ${cuit} no encontrado en el padrón de AFIP`);
  }

  const p = data.persona;
  const denominacion = p.razonSocial || [p.apellido, p.nombre].filter(Boolean).join(", ") || "N/A";
  const actividades = (p.actividades || []).map((a) => a.descripcion);

  // Cache in PostgreSQL
  try {
    await pool.query(
      `INSERT INTO afip_cuit_cache (cuit, denominacion, tipo_persona, estado, actividades, raw_json, fetched_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (cuit) DO UPDATE SET denominacion=$2, tipo_persona=$3, estado=$4, actividades=$5, raw_json=$6, fetched_at=NOW()`,
      [cuit, denominacion, p.tipoPersona, p.estadoClave, JSON.stringify(actividades), JSON.stringify(data)]
    );
  } catch {
    // Cache write failure is non-fatal
  }

  return {
    cuit,
    denominacion,
    tipo_persona: p.tipoPersona || "desconocido",
    estado: p.estadoClave || "desconocido",
    actividades,
    fuente: "api_directa",
    actualizado_al: new Date().toISOString(),
    freshness: "current",
  };
}
