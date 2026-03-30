import { fetchJSON } from "../utils/http.js";

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
  titulo: string;
  seccion: string;
  fecha: string;
  url: string;
}

export async function boletinOficialSearch(input: BoletinOficialSearchInput): Promise<BoletinOficialSearchResult[]> {
  if (!input.query || input.query.trim().length === 0) {
    throw new Error("El parámetro 'query' es requerido y no puede estar vacío");
  }

  if (input.seccion && !SECCIONES[input.seccion]) {
    throw new Error(
      `Sección "${input.seccion}" no válida. Opciones: primera, segunda, tercera`
    );
  }

  const fecha = input.fecha || formatDate(new Date());

  // Use the Boletín Oficial search API
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
    return [];
  }

  return data.dataList.map((item) => ({
    titulo: item.denominacion || item.tipo || "(sin título)",
    seccion: item.nombreSeccion || "desconocida",
    fecha: item.fechaPublicacion || fecha,
    url: item.url || `https://www.boletinoficial.gob.ar/detalleAviso/${item.id}`,
  }));
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}
