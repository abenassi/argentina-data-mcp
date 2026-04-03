import { pool } from "../db/pool.js";
import { fetchJSON } from "../utils/http.js";
import type { CollectorResult } from "../types/collector.js";

// NOTE: Boletín Oficial API is currently blocked (returns 302 redirect).
// This collector is kept for when the API becomes available again.

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

export async function collectBoletin(): Promise<CollectorResult> {
  const start = Date.now();
  const errors: string[] = [];
  let recordsUpserted = 0;

  try {
    const hoy = new Date();
    const fecha = hoy.toISOString().split("T")[0];
    const url = `https://www.boletinoficial.gob.ar/api/search/normas?denominacion=&fecha_desde=${fecha}&fecha_hasta=${fecha}`;

    const data = await fetchJSON<BoletinResponse>(url);

    if (data.dataList && data.dataList.length > 0) {
      for (const item of data.dataList) {
        try {
          await pool.query(
            `INSERT INTO boletin_oficial (titulo, seccion, fecha, url, raw_json, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
              item.denominacion || item.tipo || null,
              item.nombreSeccion || null,
              item.fechaPublicacion || fecha,
              item.url || (item.id ? `https://www.boletinoficial.gob.ar/detalleAviso/${item.id}` : null),
              JSON.stringify(item),
            ]
          );
          recordsUpserted++;
        } catch (err) {
          errors.push(`Error inserting: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // Update freshness
    await pool.query(
      `INSERT INTO data_freshness (source_name, last_successful_fetch, last_data_date, is_healthy, updated_at)
       VALUES ('boletin_oficial', NOW(), CURRENT_DATE, true, NOW())
       ON CONFLICT (source_name) DO UPDATE SET last_successful_fetch=NOW(), last_data_date=CURRENT_DATE, is_healthy=true, error_message=NULL, updated_at=NOW()`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Fetch error: ${msg}`);
    try {
      await pool.query(
        `INSERT INTO data_freshness (source_name, is_healthy, error_message, updated_at)
         VALUES ('boletin_oficial', false, $1, NOW())
         ON CONFLICT (source_name) DO UPDATE SET is_healthy=false, error_message=$1, updated_at=NOW()`,
        [msg]
      );
    } catch { /* ignore */ }
  }

  return { source: "boletin_oficial", recordsUpserted, errors, durationMs: Date.now() - start };
}
