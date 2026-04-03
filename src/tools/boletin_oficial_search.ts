import { fetchJSON } from "../utils/http.js";
import { pool } from "../db/pool.js";

// Boletín Oficial de la República Argentina

interface BoletinItem {
  id?: string;
  denominacion?: string;
  nombreSeccion?: string;
  fechaPublicacion?: string;
  nroNorma?: string;
  tipo?: string;
  url?: string;
}

interface BoletinResponse {
  dataList?: BoletinItem[];
}

const SECCIONES: Record<string, string> = {
  primera: "primera",
  segunda: "segunda",
  tercera: "tercera",
};

export interface BoletinOficialSearchInput {
  query: string;
  seccion?: string;
  fecha?: string;
}

export interface BoletinOficialSearchResult {
  resultados: {
    titulo: string;
    seccion: string;
    fecha: string;
    url: string;
  }[];
  fuente: string;
  freshness: "current" | "stale" | "unknown";
}

export async function boletinOficialSearch(input: BoletinOficialSearchInput): Promise<BoletinOficialSearchResult> {
  if (!input.query || input.query.trim().length === 0) {
    throw new Error("El parámetro 'query' es requerido y no puede estar vacío");
  }

  if (input.seccion && !SECCIONES[input.seccion]) {
    throw new Error(`Sección "${input.seccion}" no válida. Opciones: primera, segunda, tercera`);
  }

  // Try PostgreSQL first
  try {
    let query: string;
    const params: (string | number)[] = [`%${input.query}%`, 20];

    if (input.seccion && input.fecha) {
      query = `SELECT titulo, seccion, fecha, url FROM boletin_oficial
               WHERE titulo ILIKE $1 AND seccion = $3 AND fecha = $4
               ORDER BY fecha DESC LIMIT $2`;
      params.push(input.seccion, input.fecha);
    } else if (input.seccion) {
      query = `SELECT titulo, seccion, fecha, url FROM boletin_oficial
               WHERE titulo ILIKE $1 AND seccion = $3
               ORDER BY fecha DESC LIMIT $2`;
      params.push(input.seccion);
    } else if (input.fecha) {
      query = `SELECT titulo, seccion, fecha, url FROM boletin_oficial
               WHERE titulo ILIKE $1 AND fecha = $3
               ORDER BY fecha DESC LIMIT $2`;
      params.push(input.fecha);
    } else {
      query = `SELECT titulo, seccion, fecha, url FROM boletin_oficial
               WHERE titulo ILIKE $1
               ORDER BY fecha DESC LIMIT $2`;
    }

    const result = await pool.query(query, params);
    if (result.rows.length > 0) {
      return {
        resultados: result.rows.map((r: any) => ({
          titulo: r.titulo || "(sin título)",
          seccion: r.seccion || "desconocida",
          fecha: r.fecha ? r.fecha.toISOString().split("T")[0] : "",
          url: r.url || "",
        })),
        fuente: "postgresql",
        freshness: "current",
      };
    }
  } catch {
    // DB not available, fall through to API
  }

  // Fallback: direct API call (may fail - API is known to be blocked)
  const fecha = input.fecha || formatDate(new Date());
  const params = new URLSearchParams({
    denominacion: input.query,
    fecha_desde: fecha,
    fecha_hasta: fecha,
  });

  if (input.seccion) {
    params.set("seccion", input.seccion);
  }

  const url = `https://www.boletinoficial.gob.ar/api/search/normas?${params}`;
  const data = await fetchJSON<BoletinResponse>(url);

  if (!data.dataList || data.dataList.length === 0) {
    return { resultados: [], fuente: "api_directa", freshness: "unknown" };
  }

  return {
    resultados: data.dataList.map((item) => ({
      titulo: item.denominacion || item.tipo || "(sin título)",
      seccion: item.nombreSeccion || "desconocida",
      fecha: item.fechaPublicacion || fecha,
      url: item.url || `https://www.boletinoficial.gob.ar/detalleAviso/${item.id}`,
    })),
    fuente: "api_directa",
    freshness: "current",
  };
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}
