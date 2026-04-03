import { pool } from "../db/pool.js";

export interface DataHealthResult {
  fuentes: {
    nombre: string;
    estado: "healthy" | "degraded" | "down";
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
    const countResult = await pool.query(`SELECT COUNT(*) as cnt FROM ${table}`);
    const count = Number(countResult.rows[0].cnt);
    const fresh = freshnessMap.get(source);

    let estado: "healthy" | "degraded" | "down";
    if (fresh?.is_healthy && count > 0) {
      estado = "healthy";
    } else if (count > 0) {
      estado = "degraded";
    } else {
      estado = "down";
    }

    fuentes.push({
      nombre: source,
      estado,
      ultima_actualizacion: fresh?.last_successful_fetch?.toISOString() || null,
      ultimo_dato: fresh?.last_data_date?.toISOString()?.split("T")[0] || null,
      registros: count,
      error: fresh?.error_message || null,
    });
  }

  const healthy = fuentes.filter((f) => f.estado === "healthy").length;
  const total = fuentes.length;
  const resumen = `${healthy}/${total} fuentes healthy. ${fuentes.filter(f => f.estado === "down").map(f => f.nombre).join(", ") || "Ninguna"} caída(s).`;

  return { fuentes, resumen };
}
