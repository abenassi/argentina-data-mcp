#!/usr/bin/env node

import "dotenv/config";
import { pool } from "../db/pool.js";
import { fetchJSON } from "../utils/http.js";

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

async function backfillVariable(variable: { id: number; nombre: string }, desde: string, hasta: string): Promise<number> {
  const url = `https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/${variable.id}?desde=${desde}&hasta=${hasta}`;
  const data = await fetchJSON<BCRAv4Response>(url);

  if (!data.results?.[0]?.detalle) return 0;

  let count = 0;
  for (const punto of data.results[0].detalle) {
    await pool.query(
      `INSERT INTO bcra_variables (id_variable, nombre, valor, fecha, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (id_variable, fecha) DO UPDATE SET valor=$3`,
      [variable.id, variable.nombre, punto.valor, punto.fecha]
    );
    count++;
  }
  return count;
}

async function main() {
  console.log("=== BCRA Historical Backfill ===");

  // Backfill in 3-month chunks from 2024-01-01 to today
  const startDate = new Date("2024-01-01");
  const endDate = new Date();
  let totalRecords = 0;

  for (const variable of VARIABLES) {
    let chunkStart = new Date(startDate);
    let varTotal = 0;

    while (chunkStart < endDate) {
      const chunkEnd = new Date(chunkStart);
      chunkEnd.setMonth(chunkEnd.getMonth() + 3);
      if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());

      const desde = chunkStart.toISOString().split("T")[0];
      const hasta = chunkEnd.toISOString().split("T")[0];

      try {
        const count = await backfillVariable(variable, desde, hasta);
        varTotal += count;
        process.stdout.write(`.`);
      } catch (err) {
        console.error(`\n  Error ${variable.nombre} ${desde}-${hasta}: ${err instanceof Error ? err.message : String(err)}`);
      }

      chunkStart = new Date(chunkEnd);
      chunkStart.setDate(chunkStart.getDate() + 1);
    }

    console.log(`\n  ${variable.nombre}: ${varTotal} records`);
    totalRecords += varTotal;
  }

  // Update freshness
  await pool.query(
    `INSERT INTO data_freshness (source_name, last_successful_fetch, last_data_date, is_healthy, updated_at)
     VALUES ('bcra', NOW(), CURRENT_DATE, true, NOW())
     ON CONFLICT (source_name) DO UPDATE SET last_successful_fetch=NOW(), last_data_date=CURRENT_DATE, is_healthy=true, error_message=NULL, updated_at=NOW()`
  );

  console.log(`\nDone. Total: ${totalRecords} records loaded.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
