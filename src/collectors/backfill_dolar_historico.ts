#!/usr/bin/env node

import "dotenv/config";
import { pool } from "../db/pool.js";

const AMBITO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.ambito.com/",
  Origin: "https://www.ambito.com",
};

// Two response formats from Ámbito:
// historico-general: [['Fecha','Compra','Venta'], ['31/03/2026','1390,00','1410,00'], ...]
// grafico: [['fecha','DOLAR MEP'], ['02/03/2026', 1413.54], ...]

interface AmbitoEndpoint {
  tipo: string;
  path: string;
  format: "historico" | "grafico";
}

const ENDPOINTS: AmbitoEndpoint[] = [
  { tipo: "blue", path: "dolar/informal/historico-general", format: "historico" },
  { tipo: "oficial", path: "dolar/oficial/historico-general", format: "historico" },
  { tipo: "mep", path: "dolarrava/mep/grafico", format: "grafico" },
  { tipo: "ccl", path: "dolarrava/cl/grafico", format: "grafico" },
  { tipo: "mayorista", path: "dolar/mayorista/historico-general", format: "historico" },
  { tipo: "cripto", path: "dolar/cripto/historico-general", format: "historico" },
  { tipo: "tarjeta", path: "dolar/tarjeta/historico-general", format: "historico" },
];

function parseDate(dateStr: string): string {
  // "31/03/2026" → "2026-03-31"
  const [d, m, y] = dateStr.split("/");
  return `${y}-${m}-${d}`;
}

function parseNumber(str: string): number | null {
  if (!str || str === "No Cotiza" || str === "-") return null;
  return Number(str.replace(/\./g, "").replace(",", "."));
}

async function fetchAmbito(path: string, from: string, to: string): Promise<any[]> {
  const url = `https://mercados.ambito.com//${path}/${from}/${to}`;
  const response = await fetch(url, {
    headers: AMBITO_HEADERS,
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<any[]>;
}

async function backfillEndpoint(ep: AmbitoEndpoint, from: string, to: string): Promise<number> {
  const data = await fetchAmbito(ep.path, from, to);
  if (!data || data.length <= 1) return 0; // Only header row

  let count = 0;
  // Skip header row (index 0)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    try {
      let fecha: string;
      let compra: number | null;
      let venta: number | null;

      if (ep.format === "historico") {
        // ['31/03/2026', '1390,00', '1410,00']
        fecha = parseDate(row[0]);
        compra = parseNumber(row[1]);
        venta = parseNumber(row[2]);
      } else {
        // ['02/03/2026', 1413.54]
        fecha = parseDate(row[0]);
        compra = null; // grafico format only has one value
        venta = typeof row[1] === "number" ? row[1] : parseNumber(String(row[1]));
      }

      await pool.query(
        `INSERT INTO dolar_historico (tipo, fecha, compra, venta, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (tipo, fecha) DO UPDATE SET compra=COALESCE($3, dolar_historico.compra), venta=COALESCE($4, dolar_historico.venta)`,
        [ep.tipo, fecha, compra, venta]
      );
      count++;
    } catch (err) {
      // Skip bad rows
    }
  }
  return count;
}

async function main() {
  console.log("=== Dólar Histórico Backfill (Ámbito Financiero) ===\n");

  // Load 2 years of data in 6-month chunks (Ámbito might limit response size)
  const endDate = new Date();
  const startDate = new Date("2024-01-01");
  let totalRecords = 0;

  for (const ep of ENDPOINTS) {
    let chunkStart = new Date(startDate);
    let epTotal = 0;

    while (chunkStart < endDate) {
      const chunkEnd = new Date(chunkStart);
      chunkEnd.setMonth(chunkEnd.getMonth() + 6);
      if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());

      const from = chunkStart.toISOString().split("T")[0];
      const to = chunkEnd.toISOString().split("T")[0];

      try {
        const count = await backfillEndpoint(ep, from, to);
        epTotal += count;
        process.stdout.write(".");
      } catch (err) {
        console.error(`\n  Error ${ep.tipo} ${from}-${to}: ${err instanceof Error ? err.message : String(err)}`);
      }

      chunkStart = new Date(chunkEnd);
      chunkStart.setDate(chunkStart.getDate() + 1);

      // Rate limiting — be polite to Ámbito's servers
      await new Promise((r) => setTimeout(r, 500));
    }

    console.log(`\n  ${ep.tipo}: ${epTotal} records`);
    totalRecords += epTotal;
  }

  // Update freshness
  await pool.query(
    `INSERT INTO data_freshness (source_name, last_successful_fetch, last_data_date, is_healthy, updated_at)
     VALUES ('dolar_historico', NOW(), CURRENT_DATE, true, NOW())
     ON CONFLICT (source_name) DO UPDATE SET last_successful_fetch=NOW(), last_data_date=CURRENT_DATE, is_healthy=true, error_message=NULL, updated_at=NOW()`
  );

  console.log(`\nDone. Total: ${totalRecords} records loaded.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
