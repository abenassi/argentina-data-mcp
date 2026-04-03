import { pool } from "../db/pool.js";
import { fetchJSON } from "../utils/http.js";
import type { CollectorResult } from "../types/collector.js";

interface BCRAv4Response {
  status: number;
  results: {
    idVariable: number;
    detalle: { fecha: string; valor: number }[];
  }[];
}

const VARIABLES: { id: number; nombre: string }[] = [
  { id: 4, nombre: "dolar_oficial" },
  { id: 5, nombre: "dolar_mayorista" },
  { id: 1, nombre: "reservas" },
  { id: 7, nombre: "badlar" },
  { id: 8, nombre: "tm20" },
  { id: 27, nombre: "inflacion_mensual" },
  { id: 28, nombre: "inflacion_interanual" },
  { id: 15, nombre: "base_monetaria" },
  { id: 16, nombre: "circulacion_monetaria" },
  { id: 40, nombre: "icl" },
];

export async function collectBcra(): Promise<CollectorResult> {
  const start = Date.now();
  const errors: string[] = [];
  let recordsUpserted = 0;

  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - 7);
  const desdeStr = desde.toISOString().split("T")[0];
  const hastaStr = hoy.toISOString().split("T")[0];

  for (const variable of VARIABLES) {
    try {
      const url = `https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/${variable.id}?desde=${desdeStr}&hasta=${hastaStr}`;
      const data = await fetchJSON<BCRAv4Response>(url);

      if (!data.results?.[0]?.detalle) continue;

      for (const punto of data.results[0].detalle) {
        try {
          await pool.query(
            `INSERT INTO bcra_variables (id_variable, nombre, valor, fecha, created_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (id_variable, fecha) DO UPDATE SET valor=$3`,
            [variable.id, variable.nombre, punto.valor, punto.fecha]
          );
          recordsUpserted++;
        } catch (err) {
          errors.push(`Error upserting ${variable.nombre} ${punto.fecha}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      errors.push(`Error fetching ${variable.nombre}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Update freshness — healthy if majority of variables succeeded
  try {
    const failedVars = errors.filter((e) => e.startsWith("Error fetching")).length;
    const healthy = failedVars <= Math.floor(VARIABLES.length / 3); // healthy if <33% failed
    await pool.query(
      `INSERT INTO data_freshness (source_name, last_successful_fetch, last_data_date, is_healthy, error_message, updated_at)
       VALUES ('bcra', NOW(), CURRENT_DATE, $1, $2, NOW())
       ON CONFLICT (source_name) DO UPDATE SET last_successful_fetch=NOW(), last_data_date=CURRENT_DATE, is_healthy=$1, error_message=$2, updated_at=NOW()`,
      [healthy, errors.length > 0 ? errors.join("; ") : null]
    );
  } catch { /* ignore */ }

  return { source: "bcra", recordsUpserted, errors, durationMs: Date.now() - start };
}
