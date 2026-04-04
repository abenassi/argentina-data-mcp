import { pool } from "../db/pool.js";
import { searchBoletin } from "../collectors/collect_boletin.js";

// Boletín Oficial search — FTS on PostgreSQL, API fallback for recent dates

const SECCIONES: Record<string, string> = {
  primera: "primera",
  segunda: "segunda",
  tercera: "tercera",
};

export interface BoletinOficialSearchInput {
  query: string;
  seccion?: string;
  fecha?: string; // YYYY-MM-DD
}

export interface BoletinOficialSearchResult {
  resultados: {
    id_aviso: string;
    organismo: string;
    tipo_norma: string;
    seccion: string;
    fecha: string;
    url: string;
  }[];
  total: number;
  fuente: string;
  fuente_url: string;
  freshness: "current" | "stale" | "unknown";
}

export async function boletinOficialSearch(input: BoletinOficialSearchInput): Promise<BoletinOficialSearchResult> {
  if (!input.query || input.query.trim().length === 0) {
    throw new Error("El parámetro 'query' es requerido y no puede estar vacío");
  }

  if (input.seccion && !SECCIONES[input.seccion]) {
    throw new Error(`Sección "${input.seccion}" no válida. Opciones: primera, segunda, tercera`);
  }

  // Try PostgreSQL FTS first
  try {
    const conditions = [
      `to_tsvector('spanish', COALESCE(organismo, '') || ' ' || COALESCE(tipo_norma, '')) @@ plainto_tsquery('spanish', $1)`,
    ];
    const params: (string | number)[] = [input.query];
    let paramIdx = 2;

    if (input.seccion) {
      conditions.push(`seccion = $${paramIdx}`);
      params.push(input.seccion);
      paramIdx++;
    }

    if (input.fecha) {
      conditions.push(`fecha = $${paramIdx}`);
      params.push(input.fecha);
      paramIdx++;
    }

    const query = `
      SELECT id_aviso, organismo, tipo_norma, seccion, fecha, url,
             ts_rank(to_tsvector('spanish', COALESCE(organismo, '') || ' ' || COALESCE(tipo_norma, '')),
                     plainto_tsquery('spanish', $1)) AS fts_rank
      FROM boletin_oficial
      WHERE ${conditions.join(" AND ")}
      ORDER BY fecha DESC, fts_rank DESC
      LIMIT 20
    `;

    const result = await pool.query(query, params);
    if (result.rows.length > 0) {
      return {
        resultados: result.rows.map((r: any) => ({
          id_aviso: r.id_aviso,
          organismo: r.organismo,
          tipo_norma: r.tipo_norma || "",
          seccion: r.seccion,
          fecha: r.fecha instanceof Date ? r.fecha.toISOString().split("T")[0] : String(r.fecha),
          url: r.url,
        })),
        total: result.rows.length,
        fuente: "Boletín Oficial de la República Argentina",
        fuente_url: "https://www.boletinoficial.gob.ar",
        freshness: "current",
      };
    }
  } catch {
    // DB not available, fall through to API
  }

  // Fallback: search API
  try {
    const fechaApi = input.fecha
      ? input.fecha.replace(/-/g, "")
      : new Date().toISOString().split("T")[0].replace(/-/g, "");

    const avisos = await searchBoletin(input.query, fechaApi);

    const filtered = input.seccion
      ? avisos.filter((a) => a.seccion === input.seccion)
      : avisos;

    return {
      resultados: filtered.map((a) => ({
        id_aviso: a.id_aviso,
        organismo: a.organismo,
        tipo_norma: a.tipo_norma,
        seccion: a.seccion,
        fecha: `${a.fecha.substring(0, 4)}-${a.fecha.substring(4, 6)}-${a.fecha.substring(6, 8)}`,
        url: a.url,
      })),
      total: filtered.length,
      fuente: "Boletín Oficial de la República Argentina",
      fuente_url: "https://www.boletinoficial.gob.ar",
      freshness: "current",
    };
  } catch {
    return {
      resultados: [],
      total: 0,
      fuente: "Boletín Oficial de la República Argentina",
      fuente_url: "https://www.boletinoficial.gob.ar",
      freshness: "unknown",
    };
  }
}
