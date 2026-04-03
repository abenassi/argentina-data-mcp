import { pool } from "../db/pool.js";

// InfoLeg — Search via PostgreSQL full-text search on imported CSV dump

export interface InfolegSearchInput {
  query: string;
  tipo?: string;
  limit?: number;
}

export interface InfolegSearchResult {
  resultados: {
    id_norma: number;
    numero: string;
    tipo: string;
    titulo: string;
    fecha: string;
    url: string;
  }[];
  total: number;
  fuente: string;
  freshness: "current" | "stale" | "unknown";
}

export async function infolegSearch(input: InfolegSearchInput): Promise<InfolegSearchResult> {
  if (!input.query || input.query.trim().length === 0) {
    throw new Error("El parámetro 'query' es requerido y no puede estar vacío");
  }

  const limit = Math.min(input.limit || 10, 50);

  try {
    let query: string;
    const params: (string | number)[] = [input.query, limit];

    if (input.tipo) {
      query = `
        SELECT id_norma, numero_norma, tipo_norma, titulo_sumario, titulo_resumido, fecha_sancion, fts_rank FROM (
          SELECT id_norma, numero_norma, tipo_norma, titulo_sumario, titulo_resumido, fecha_sancion,
                 ts_rank(to_tsvector('spanish', COALESCE(titulo_sumario,'') || ' ' || COALESCE(titulo_resumido,'') || ' ' || COALESCE(texto_resumido,'')),
                          plainto_tsquery('spanish', $1)) AS fts_rank
          FROM infoleg_normas
          WHERE to_tsvector('spanish', COALESCE(titulo_sumario,'') || ' ' || COALESCE(titulo_resumido,'') || ' ' || COALESCE(texto_resumido,''))
                @@ plainto_tsquery('spanish', $1)
            AND LOWER(tipo_norma) = LOWER($3)
        ) sub
        ORDER BY fts_rank * (1.0 + 1.0 / (1.0 + EXTRACT(EPOCH FROM NOW() - COALESCE(fecha_sancion, '1900-01-01'::date)) / 86400.0 / 365.0)) DESC
        LIMIT $2
      `;
      params.push(input.tipo);
    } else {
      query = `
        SELECT id_norma, numero_norma, tipo_norma, titulo_sumario, titulo_resumido, fecha_sancion, fts_rank FROM (
          SELECT id_norma, numero_norma, tipo_norma, titulo_sumario, titulo_resumido, fecha_sancion,
                 ts_rank(to_tsvector('spanish', COALESCE(titulo_sumario,'') || ' ' || COALESCE(titulo_resumido,'') || ' ' || COALESCE(texto_resumido,'')),
                          plainto_tsquery('spanish', $1)) AS fts_rank
          FROM infoleg_normas
          WHERE to_tsvector('spanish', COALESCE(titulo_sumario,'') || ' ' || COALESCE(titulo_resumido,'') || ' ' || COALESCE(texto_resumido,''))
                @@ plainto_tsquery('spanish', $1)
        ) sub
        ORDER BY fts_rank * (1.0 + 1.0 / (1.0 + EXTRACT(EPOCH FROM NOW() - COALESCE(fecha_sancion, '1900-01-01'::date)) / 86400.0 / 365.0)) DESC
        LIMIT $2
      `;
    }

    const result = await pool.query(query, params);

    // Check if table has data
    const countResult = await pool.query("SELECT COUNT(*) as cnt FROM infoleg_normas");
    const totalInDb = Number(countResult.rows[0].cnt);

    if (totalInDb === 0) {
      throw new Error("InfoLeg data not yet imported. Run: npm run import:infoleg");
    }

    return {
      resultados: result.rows.map((r: any) => ({
        id_norma: r.id_norma,
        numero: r.numero_norma || String(r.id_norma),
        tipo: r.tipo_norma || "desconocido",
        titulo: r.titulo_sumario || r.titulo_resumido || "(sin título)",
        fecha: r.fecha_sancion ? r.fecha_sancion.toISOString().split("T")[0] : "",
        url: `http://servicios.infoleg.gob.ar/infolegInternet/verNorma.do?id=${r.id_norma}`,
      })),
      total: result.rowCount || 0,
      fuente: "postgresql_fts",
      freshness: totalInDb > 0 ? "current" : "unknown",
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("not yet imported")) {
      throw error;
    }
    throw new Error(`Error buscando en InfoLeg: ${error instanceof Error ? error.message : String(error)}`);
  }
}
