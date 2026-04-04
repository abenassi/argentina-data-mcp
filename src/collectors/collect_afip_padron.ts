import { pool } from "../db/pool.js";
import type { CollectorResult } from "../types/collector.js";
import { createWriteStream, createReadStream } from "node:fs";
import { unlink, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";

const PADRON_URL = "https://www.afip.gob.ar/genericos/cInscripcion/archivos/apellidoNombreDenominacion.zip";
const TMP_ZIP = "/tmp/afip_padron.zip";
const TMP_TXT = "/tmp/afip_padron.txt";
const BATCH_SIZE = 5000; // 5000 × 10 params = 50000 < PostgreSQL's 65535 limit

interface PadronRecord {
  cuit: string;
  denominacion: string;
  tipo_persona: string;
  estado: string;
  imp_ganancias: string;
  imp_iva: string;
  monotributo: string;
  integrante_sociedad: boolean;
  empleador: boolean;
  actividad_monotributo: string;
}

// CUIT prefix → person type
function tipoPerson(cuit: string): string {
  const prefix = cuit.substring(0, 2);
  if (["30", "33", "34"].includes(prefix)) return "JURIDICA";
  return "FISICA";
}

// Derive estado from tax flags: if any active registration, ACTIVO
function deriveEstado(rec: PadronRecord): string {
  if (rec.imp_ganancias === "AC" || rec.imp_iva === "AC") return "ACTIVO";
  if (rec.monotributo.match(/^[A-K]$/)) return "ACTIVO";
  if (rec.imp_ganancias === "EX" || rec.imp_iva === "EX") return "EXENTO";
  return "INACTIVO";
}

function parseLine(line: string): PadronRecord | null {
  if (line.length < 49) return null;
  const cuit = line.substring(0, 11).trim();
  if (!/^\d{11}$/.test(cuit)) return null;

  const denominacion = line.substring(11, 41).trim();
  const impGanancias = line.substring(41, 43).trim();
  const impIva = line.substring(43, 45).trim();
  const monotributo = line.substring(45, 47).trim();
  const integranteSoc = line.length > 47 ? line[47] : "N";
  const empleador = line.length > 48 ? line[48] : "N";
  const actMonotributo = line.length > 50 ? line.substring(49, 51).trim() : "00";

  const rec: PadronRecord = {
    cuit,
    denominacion: denominacion || "N/A",
    tipo_persona: tipoPerson(cuit),
    estado: "", // derived below
    imp_ganancias: impGanancias,
    imp_iva: impIva,
    monotributo,
    integrante_sociedad: integranteSoc === "S",
    empleador: empleador === "S",
    actividad_monotributo: actMonotributo,
  };
  rec.estado = deriveEstado(rec);
  return rec;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url, {
    headers: { "User-Agent": "argentina-data-mcp/0.1.0" },
    signal: AbortSignal.timeout(600000), // 10 min timeout for large file
  });
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error("Download failed: no response body");
  }
  const fileStream = createWriteStream(dest);
  // @ts-ignore: Node.js ReadableStream is compatible with pipeline
  await pipeline(response.body, fileStream);
}

async function extractZip(zipPath: string, txtPath: string): Promise<void> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);
  // Use unzip CLI which handles ZIP format properly
  await execAsync(`unzip -o -p "${zipPath}" > "${txtPath}"`);
}

async function upsertBatch(records: PadronRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  // Build multi-row VALUES clause
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let idx = 1;

  for (const rec of records) {
    placeholders.push(
      `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7}, $${idx + 8}, $${idx + 9}, NOW())`
    );
    values.push(
      rec.cuit, rec.denominacion, rec.tipo_persona, rec.estado,
      rec.imp_ganancias, rec.imp_iva, rec.monotributo,
      rec.integrante_sociedad, rec.empleador, rec.actividad_monotributo
    );
    idx += 10;
  }

  const sql = `
    INSERT INTO afip_cuit_cache (cuit, denominacion, tipo_persona, estado, imp_ganancias, imp_iva, monotributo, integrante_sociedad, empleador, actividad_monotributo, fetched_at)
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (cuit) DO UPDATE SET
      denominacion = EXCLUDED.denominacion,
      tipo_persona = EXCLUDED.tipo_persona,
      estado = EXCLUDED.estado,
      imp_ganancias = EXCLUDED.imp_ganancias,
      imp_iva = EXCLUDED.imp_iva,
      monotributo = EXCLUDED.monotributo,
      integrante_sociedad = EXCLUDED.integrante_sociedad,
      empleador = EXCLUDED.empleador,
      actividad_monotributo = EXCLUDED.actividad_monotributo,
      fetched_at = NOW()
  `;
  await pool.query(sql, values);
  return records.length;
}

export async function collectAfipPadron(): Promise<CollectorResult> {
  const start = Date.now();
  const errors: string[] = [];
  let recordsUpserted = 0;

  try {
    // Step 1: Download ZIP
    console.log("[afip_padron] Downloading padrón ZIP...");
    await downloadFile(PADRON_URL, TMP_ZIP);
    const zipStat = await stat(TMP_ZIP);
    console.log(`[afip_padron] Downloaded: ${(zipStat.size / 1048576).toFixed(1)} MB`);

    // Step 2: Extract
    console.log("[afip_padron] Extracting...");
    await extractZip(TMP_ZIP, TMP_TXT);
    const txtStat = await stat(TMP_TXT);
    console.log(`[afip_padron] Extracted: ${(txtStat.size / 1048576).toFixed(1)} MB`);

    // Step 3: Parse and import in batches
    console.log("[afip_padron] Importing records...");
    const rl = createInterface({
      input: createReadStream(TMP_TXT, { encoding: "latin1" }),
      crlfDelay: Infinity,
    });

    let batch: PadronRecord[] = [];
    let lineCount = 0;
    let parseErrors = 0;

    for await (const line of rl) {
      lineCount++;
      const record = parseLine(line);
      if (!record) {
        parseErrors++;
        continue;
      }
      batch.push(record);

      if (batch.length >= BATCH_SIZE) {
        try {
          recordsUpserted += await upsertBatch(batch);
        } catch (err) {
          errors.push(`Batch error at line ${lineCount}: ${err instanceof Error ? err.message : String(err)}`);
        }
        batch = [];
        if (lineCount % 500000 < BATCH_SIZE) {
          console.log(`[afip_padron] ${recordsUpserted.toLocaleString()} records imported (line ${lineCount.toLocaleString()})...`);
        }
      }
    }

    // Flush remaining
    if (batch.length > 0) {
      try {
        recordsUpserted += await upsertBatch(batch);
      } catch (err) {
        errors.push(`Final batch error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    console.log(`[afip_padron] Import complete: ${recordsUpserted.toLocaleString()} records, ${parseErrors} parse errors`);
    if (parseErrors > 0) {
      errors.push(`${parseErrors} lines could not be parsed`);
    }

    // Step 4: Update freshness
    await pool.query(
      `INSERT INTO data_freshness (source_name, last_successful_fetch, last_data_date, is_healthy, updated_at)
       VALUES ('afip', NOW(), CURRENT_DATE, true, NOW())
       ON CONFLICT (source_name) DO UPDATE SET last_successful_fetch=NOW(), last_data_date=CURRENT_DATE, is_healthy=true, error_message=NULL, updated_at=NOW()`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Fatal: ${msg}`);
    try {
      await pool.query(
        `INSERT INTO data_freshness (source_name, is_healthy, error_message, updated_at)
         VALUES ('afip', false, $1, NOW())
         ON CONFLICT (source_name) DO UPDATE SET is_healthy=false, error_message=$1, updated_at=NOW()`,
        [msg]
      );
    } catch { /* ignore */ }
  } finally {
    // Cleanup temp files
    try { await unlink(TMP_ZIP); } catch { /* ignore */ }
    try { await unlink(TMP_TXT); } catch { /* ignore */ }
  }

  return { source: "afip_padron", recordsUpserted, errors, durationMs: Date.now() - start };
}
