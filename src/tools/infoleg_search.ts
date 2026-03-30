import { fetchJSON } from "../utils/http.js";

// InfoLeg API: http://servicios.infoleg.gob.ar/infolegInternet/api/
// Search endpoint for Argentine legislation

interface InfolegResult {
  idNorma: number;
  tipo: string;
  numero: string;
  fecha: string;
  tituloSumario?: string;
  tituloResumido?: string;
}

interface InfolegResponse {
  results: InfolegResult[];
  metadata?: {
    resultCount: number;
  };
}

export interface InfolegSearchInput {
  query: string;
  tipo?: string;
  limit?: number;
}

export interface InfolegSearchResult {
  numero: string;
  tipo: string;
  titulo: string;
  fecha: string;
  url: string;
}

export async function infolegSearch(input: InfolegSearchInput): Promise<InfolegSearchResult[]> {
  if (!input.query || input.query.trim().length === 0) {
    throw new Error("El parámetro 'query' es requerido y no puede estar vacío");
  }

  const limit = Math.min(input.limit || 10, 50);
  const params = new URLSearchParams({
    texto: input.query,
    limit: String(limit),
  });

  if (input.tipo) {
    params.set("tipo", input.tipo);
  }

  const url = `http://servicios.infoleg.gob.ar/infolegInternet/api/v1/normas?${params}`;
  const data = await fetchJSON<InfolegResponse>(url);

  if (!data.results || data.results.length === 0) {
    return [];
  }

  return data.results.map((r) => ({
    numero: r.numero || String(r.idNorma),
    tipo: r.tipo || "desconocido",
    titulo: r.tituloSumario || r.tituloResumido || "(sin título)",
    fecha: r.fecha || "",
    url: `http://servicios.infoleg.gob.ar/infolegInternet/verNorma.do?id=${r.idNorma}`,
  }));
}
