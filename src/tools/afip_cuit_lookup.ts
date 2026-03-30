import { fetchJSON } from "../utils/http.js";

// AFIP CUIT lookup via public APIs

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

  // Use the public AFIP constancia endpoint via a community API
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

  return {
    cuit: cuit,
    denominacion,
    tipo_persona: p.tipoPersona || "desconocido",
    estado: p.estadoClave || "desconocido",
    actividades: (p.actividades || []).map((a) => a.descripcion),
  };
}
