import { pool } from "../db/pool.js";

export interface DataHealthResult {
  fuentes: {
    nombre: string;
    estado: "healthy" | "degraded" | "down" | "disabled";
    ultima_actualizacion: string | null;
    ultimo_dato: string | null;
    registros: number;
    error: string | null;
  }[];
  resumen: string;
}

const TABLE_COUNTS: Record<string, string> = {
  dolar: "cotizaciones_dolar",
  dolar_historico: "dolar_historico",
  bcra: "bcra_variables",
  indec: "indec_series",
  infoleg: "infoleg_normas",
  boletin_oficial: "boletin_oficial",
  afip: "afip_cuit_cache",
};

const DISABLED_SOURCES: Record<string, string> = {};

export async function dataHealth(): Promise<DataHealthResult> {
  const fuentes: DataHealthResult["fuentes"] = [];

  // Get freshness data
  const freshness = await pool.query(
    "SELECT source_name, last_successful_fetch, last_data_date, is_healthy, error_message FROM data_freshness ORDER BY source_name"
  );

  const freshnessMap = new Map(
    freshness.rows.map((r: any) => [r.source_name, r])
  );

  // Get row counts for each table
  for (const [source, table] of Object.entries(TABLE_COUNTS)) {
    let count = 0;
    try {
      const countResult = await pool.query(`SELECT COUNT(*) as cnt FROM ${table}`);
      count = Number(countResult.rows[0].cnt);
    } catch {
      // Table may not exist or be inaccessible
      fuentes.push({
        nombre: source, estado: "down",
        ultima_actualizacion: null, ultimo_dato: null,
        registros: 0, error: `Table ${table} not accessible`,
      });
      continue;
    }
    const fresh = freshnessMap.get(source);

    let estado: "healthy" | "degraded" | "down";
    let smokeError: string | null = null;

    if (fresh?.is_healthy && count > 0) {
      estado = "healthy";
    } else if (count > 0) {
      estado = "degraded";
    } else {
      estado = "down";
    }

    // Smoke test for InfoLeg: verify FTS query actually works
    if (source === "infoleg" && count > 0) {
      try {
        await pool.query(
          `SELECT id_norma FROM (
            SELECT id_norma, ts_rank(to_tsvector('spanish', COALESCE(titulo_sumario,'') || ' ' || COALESCE(titulo_resumido,'') || ' ' || COALESCE(texto_resumido,'')),
                    plainto_tsquery('spanish', 'ley')) AS fts_rank
            FROM infoleg_normas
            WHERE to_tsvector('spanish', COALESCE(titulo_sumario,'') || ' ' || COALESCE(titulo_resumido,'') || ' ' || COALESCE(texto_resumido,''))
                  @@ plainto_tsquery('spanish', 'ley')
          ) sub ORDER BY fts_rank DESC LIMIT 1`
        );
      } catch (err) {
        estado = "degraded";
        smokeError = `FTS search failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    fuentes.push({
      nombre: source,
      estado,
      ultima_actualizacion: fresh?.last_successful_fetch?.toISOString() || null,
      ultimo_dato: fresh?.last_data_date?.toISOString()?.split("T")[0] || null,
      registros: count,
      error: smokeError || fresh?.error_message || null,
    });
  }

  // Add disabled sources
  for (const [source, reason] of Object.entries(DISABLED_SOURCES)) {
    fuentes.push({
      nombre: source,
      estado: "disabled",
      ultima_actualizacion: null,
      ultimo_dato: null,
      registros: 0,
      error: reason,
    });
  }

  const healthy = fuentes.filter((f) => f.estado === "healthy").length;
  const active = fuentes.filter((f) => f.estado !== "disabled").length;
  const disabled = fuentes.filter((f) => f.estado === "disabled").length;
  const down = fuentes.filter(f => f.estado === "down").map(f => f.nombre).join(", ");
  const resumen = `${healthy}/${active} fuentes activas healthy. ${down || "Ninguna"} caída(s). ${disabled} desactivada(s).`;

  return { fuentes, resumen };
}
