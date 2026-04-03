import { pool } from "../db/pool.js";
import { fetchJSON } from "../utils/http.js";
import type { CollectorResult } from "../types/collector.js";

interface DolarApiItem {
  moneda: string;
  casa: string;
  nombre: string;
  compra: number | null;
  venta: number | null;
  fechaActualizacion: string;
  variacion: number;
}

export async function collectDolar(): Promise<CollectorResult> {
  const start = Date.now();
  const errors: string[] = [];
  let recordsUpserted = 0;

  try {
    const data = await fetchJSON<DolarApiItem[]>("https://dolarapi.com/v1/ambito/dolares");

    for (const item of data) {
      try {
        await pool.query(
          `INSERT INTO cotizaciones_dolar (fuente, tipo, compra, venta, fecha, variacion, raw_json, created_at)
           VALUES ('dolarapi', $1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (fuente, tipo, fecha) DO UPDATE SET compra=$2, venta=$3, variacion=$5, raw_json=$6`,
          [item.casa, item.compra, item.venta, item.fechaActualizacion, item.variacion, JSON.stringify(item)]
        );
        recordsUpserted++;
      } catch (err) {
        errors.push(`Error upserting ${item.casa}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Update freshness
    await pool.query(
      `INSERT INTO data_freshness (source_name, last_successful_fetch, last_data_date, is_healthy, updated_at)
       VALUES ('dolar', NOW(), CURRENT_DATE, true, NOW())
       ON CONFLICT (source_name) DO UPDATE SET last_successful_fetch=NOW(), last_data_date=CURRENT_DATE, is_healthy=true, error_message=NULL, updated_at=NOW()`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Fetch error: ${msg}`);
    try {
      await pool.query(
        `INSERT INTO data_freshness (source_name, is_healthy, error_message, updated_at)
         VALUES ('dolar', false, $1, NOW())
         ON CONFLICT (source_name) DO UPDATE SET is_healthy=false, error_message=$1, updated_at=NOW()`,
        [msg]
      );
    } catch { /* ignore freshness update failure */ }
  }

  return { source: "dolar", recordsUpserted, errors, durationMs: Date.now() - start };
}
