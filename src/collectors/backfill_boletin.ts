#!/usr/bin/env node

import "dotenv/config";
import { pool } from "../db/pool.js";
import { parseAvisosFromHtml } from "./collect_boletin.js";

const BASE_URL = "https://www.boletinoficial.gob.ar";
const SECTIONS = ["primera", "segunda", "tercera"] as const;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Backfill from October 2025 to today
const START_DATE = "2025-10-01";

function formatYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

function formatISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Fetch a section page for a specific date. Returns [] on 302/error (weekend/holiday). */
async function fetchSectionForDate(section: string, dateYMD: string): Promise<ReturnType<typeof parseAvisosFromHtml>> {
  const url = `${BASE_URL}/seccion/${section}/${dateYMD}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });

  // 302 = weekend/holiday, no boletín published
  if (res.status === 302) return [];
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const html = await res.text();
  return parseAvisosFromHtml(html);
}

async function main() {
  console.log("=== Boletín Oficial Backfill ===\n");

  const start = new Date(START_DATE);
  const end = new Date();
  let totalRecords = 0;
  let daysProcessed = 0;
  let daysSkipped = 0;

  const current = new Date(start);
  while (current <= end) {
    const dow = current.getDay();
    // Skip weekends
    if (dow === 0 || dow === 6) {
      current.setDate(current.getDate() + 1);
      daysSkipped++;
      continue;
    }

    const dateYMD = formatYYYYMMDD(current);
    const dateISO = formatISO(current);
    let dayTotal = 0;

    for (const section of SECTIONS) {
      try {
        const avisos = await fetchSectionForDate(section, dateYMD);
        if (avisos.length === 0) continue;

        for (const a of avisos) {
          const fechaFormatted = `${a.fecha.substring(0, 4)}-${a.fecha.substring(4, 6)}-${a.fecha.substring(6, 8)}`;
          try {
            await pool.query(
              `INSERT INTO boletin_oficial (id_aviso, seccion, fecha, organismo, tipo_norma, url, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, NOW())
               ON CONFLICT (id_aviso, seccion) DO NOTHING`,
              [a.id_aviso, a.seccion, fechaFormatted, a.organismo, a.tipo_norma, a.url]
            );
            dayTotal++;
          } catch {
            // Skip bad records
          }
        }

        // Rate limit: 300ms between section requests
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        // 302 redirect or holiday — skip silently
        if (err instanceof Error && err.message.includes("302")) continue;
        console.error(`  Error ${section} ${dateISO}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (dayTotal > 0) {
      process.stdout.write(`  ${dateISO}: ${dayTotal} avisos\n`);
      totalRecords += dayTotal;
      daysProcessed++;
    } else {
      process.stdout.write(".");
      daysSkipped++;
    }

    current.setDate(current.getDate() + 1);

    // Extra rate limit between days (500ms)
    await new Promise((r) => setTimeout(r, 500));
  }

  // Update freshness
  try {
    await pool.query(
      `INSERT INTO data_freshness (source_name, last_successful_fetch, last_data_date, is_healthy, updated_at)
       VALUES ('boletin_oficial', NOW(), CURRENT_DATE, true, NOW())
       ON CONFLICT (source_name) DO UPDATE SET last_successful_fetch=NOW(), last_data_date=CURRENT_DATE, is_healthy=true, error_message=NULL, updated_at=NOW()`
    );
  } catch { /* ignore */ }

  console.log(`\n\nDone. ${totalRecords} records loaded from ${daysProcessed} days (${daysSkipped} days skipped).`);
  await pool.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
