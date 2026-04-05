import { pool } from "../db/pool.js";
import { fetchJSON } from "../utils/http.js";
import type { CollectorResult } from "../types/collector.js";

interface DatosGobResponse {
  data: [string, number | null][];
  count: number;
  meta: [
    { frequency: string },
    { field: { id: string; time_index_end: string; is_updated: string } },
  ];
}

const SERIES: { id: string; nombre: string }[] = [
  { id: "148.3_INIVELNAL_DICI_M_26", nombre: "IPC Nacional" },
  { id: "143.3_NO_PR_2004_A_21", nombre: "EMAE" },
  { id: "148.3_INUCLEONAL_DICI_M_19", nombre: "IPC Núcleo" },
  { id: "149.1_TL_INDIIOS_OCTU_0_21", nombre: "Salarios" },
  { id: "33.2_ISAC_NIVELRAL_0_M_18_63", nombre: "ISAC (Construcción)" },
  { id: "453.1_SERIE_ORIGNAL_0_0_14_46", nombre: "IPI (Industria)" },
];

export async function collectIndec(): Promise<CollectorResult> {
  const start = Date.now();
  const errors: string[] = [];
  let recordsUpserted = 0;

  for (const serie of SERIES) {
    try {
      const url = `https://apis.datos.gob.ar/series/api/series/?ids=${serie.id}&limit=24&sort=desc&metadata=full`;
      const data = await fetchJSON<DatosGobResponse>(url, {
        signal: AbortSignal.timeout(30000), // datos.gob.ar can be slow
      });

      if (!data.data || data.data.length === 0) continue;

      const fieldMeta = data.meta?.[1]?.field;
      const frecuencia = data.meta?.[0]?.frequency || null;
      const isUpdated = fieldMeta?.is_updated !== "False";

      for (const punto of data.data) {
        if (punto[1] === null) continue;
        try {
          await pool.query(
            `INSERT INTO indec_series (serie_id, nombre, valor, fecha, frecuencia, is_updated, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT (serie_id, fecha) DO UPDATE SET valor=$3, is_updated=$6`,
            [serie.id, serie.nombre, punto[1], punto[0], frecuencia, isUpdated, fieldMeta ? JSON.stringify(fieldMeta) : null]
          );
          recordsUpserted++;
        } catch (err) {
          errors.push(`Error upserting ${serie.nombre} ${punto[0]}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      errors.push(`Error fetching ${serie.nombre}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Update freshness
  try {
    const healthy = errors.length < SERIES.length / 3; // healthy if <33% fail (same as BCRA)
    await pool.query(
      `INSERT INTO data_freshness (source_name, last_successful_fetch, last_data_date, is_healthy, error_message, updated_at)
       VALUES ('indec', NOW(), CURRENT_DATE, $1, $2, NOW())
       ON CONFLICT (source_name) DO UPDATE SET last_successful_fetch=NOW(), last_data_date=CURRENT_DATE, is_healthy=$1, error_message=$2, updated_at=NOW()`,
      [healthy, errors.length > 0 ? errors.join("; ") : null]
    );
  } catch { /* ignore */ }

  return { source: "indec", recordsUpserted, errors, durationMs: Date.now() - start };
}
