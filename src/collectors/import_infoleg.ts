#!/usr/bin/env node

import "dotenv/config";
import { pool } from "../db/pool.js";
import { parse } from "csv-parse";
import { createWriteStream, createReadStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { unlink, stat } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const CSV_URL = "https://datos.jus.gob.ar/dataset/d9a963ea-8b1d-4ca3-9dd9-07a4773e8c23/resource/bf0ec116-ad4e-4572-a476-e57167a84403/download/base-infoleg-normativa-nacional.zip";
const ZIP_PATH = "/tmp/infoleg-dump.zip";
const EXTRACT_DIR = "/tmp/infoleg-dump";
const BATCH_SIZE = 1000;

async function downloadFile(url: string, dest: string): Promise<void> {
  console.log(`Downloading InfoLeg dump from ${url}...`);
  const response = await fetch(url, {
    headers: { "User-Agent": "argentina-data-mcp/0.2.0" },
    signal: AbortSignal.timeout(300000), // 5 min timeout
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const fileStream = createWriteStream(dest);
  await pipeline(Readable.fromWeb(response.body as any), fileStream);
  const stats = await stat(dest);
  console.log(`Downloaded ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
}

async function extractZip(zipPath: string, destDir: string): Promise<string> {
  console.log("Extracting ZIP...");
  await execAsync(`mkdir -p ${destDir} && unzip -o ${zipPath} -d ${destDir}`);
  const { stdout } = await execAsync(`find ${destDir} -name "*.csv" | head -1`);
  const csvPath = stdout.trim();
  if (!csvPath) throw new Error("No CSV file found in ZIP");
  console.log(`Found CSV: ${csvPath}`);
  return csvPath;
}

async function importCsv(csvPath: string): Promise<number> {
  console.log("Importing CSV to PostgreSQL...");

  // Clear existing data for fresh import
  await pool.query("TRUNCATE infoleg_normas RESTART IDENTITY");

  const parser = createReadStream(csvPath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    })
  );

  let batch: any[][] = [];
  let totalImported = 0;
  let skipped = 0;

  for await (const record of parser) {
    const idNorma = parseInt(record.id_norma);
    if (isNaN(idNorma)) {
      skipped++;
      continue;
    }

    batch.push([
      idNorma,
      record.tipo_norma || null,
      record.numero_norma || null,
      record.clase_norma || null,
      record.organismo_origen || null,
      record.fecha_sancion || null,
      record.numero_boletin || null,
      record.fecha_boletin || null,
      record.titulo_resumido || null,
      record.titulo_sumario || null,
      record.texto_resumido || null,
      record.observaciones || null,
      record.texto_original || null,
      record.texto_actualizado || null,
    ]);

    if (batch.length >= BATCH_SIZE) {
      await insertBatch(batch);
      totalImported += batch.length;
      if (totalImported % 10000 === 0) {
        console.log(`  Imported ${totalImported} records...`);
      }
      batch = [];
    }
  }

  if (batch.length > 0) {
    await insertBatch(batch);
    totalImported += batch.length;
  }

  console.log(`Import complete: ${totalImported} records imported, ${skipped} skipped`);
  return totalImported;
}

async function insertBatch(rows: any[][]): Promise<void> {
  const placeholders = rows.map((_, i) => {
    const base = i * 14;
    return `(${Array.from({ length: 14 }, (_, j) => `$${base + j + 1}`).join(",")})`;
  }).join(",");

  const values = rows.flat();

  await pool.query(
    `INSERT INTO infoleg_normas
     (id_norma, tipo_norma, numero_norma, clase_norma, organismo_origen,
      fecha_sancion, numero_boletin, fecha_boletin, titulo_resumido,
      titulo_sumario, texto_resumido, observaciones, texto_original, texto_actualizado)
     VALUES ${placeholders}
     ON CONFLICT (id_norma) DO NOTHING`,
    values
  );
}

async function main() {
  console.log("=== InfoLeg CSV Import ===");
  const start = Date.now();

  try {
    await downloadFile(CSV_URL, ZIP_PATH);
    const csvPath = await extractZip(ZIP_PATH, EXTRACT_DIR);
    const count = await importCsv(csvPath);

    // Update freshness
    await pool.query(
      `INSERT INTO data_freshness (source_name, last_successful_fetch, last_data_date, is_healthy, updated_at)
       VALUES ('infoleg', NOW(), CURRENT_DATE, true, NOW())
       ON CONFLICT (source_name) DO UPDATE SET last_successful_fetch=NOW(), last_data_date=CURRENT_DATE, is_healthy=true, error_message=NULL, updated_at=NOW()`
    );

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nDone in ${elapsed}s. ${count} normas imported.`);
  } catch (err) {
    console.error("Import failed:", err);
    try {
      await pool.query(
        `INSERT INTO data_freshness (source_name, is_healthy, error_message, updated_at)
         VALUES ('infoleg', false, $1, NOW())
         ON CONFLICT (source_name) DO UPDATE SET is_healthy=false, error_message=$1, updated_at=NOW()`,
        [err instanceof Error ? err.message : String(err)]
      );
    } catch { /* ignore */ }
    process.exit(1);
  } finally {
    // Cleanup temp files
    try { await unlink(ZIP_PATH); } catch { /* ignore */ }
    try { await execAsync(`rm -rf ${EXTRACT_DIR}`); } catch { /* ignore */ }
    await pool.end();
  }
}

main();
