#!/usr/bin/env node

import "dotenv/config";
import cron from "node-cron";
import { collectDolar } from "./collect_dolar.js";
import { collectBcra } from "./collect_bcra.js";
import { collectIndec } from "./collect_indec.js";
import { collectBoletin } from "./collect_boletin.js";
import { collectDolarHistorico } from "./collect_dolar_historico.js";
import { pool } from "../db/pool.js";
import type { CollectorResult } from "../types/collector.js";

function logResult(result: CollectorResult) {
  const status = result.errors.length === 0 ? "OK" : "ERRORS";
  console.log(
    `[${new Date().toISOString()}] ${result.source}: ${status} — ${result.recordsUpserted} records in ${result.durationMs}ms`
  );
  for (const err of result.errors) {
    console.error(`  [${result.source}] ${err}`);
  }
}

async function runCollector(name: string, fn: () => Promise<CollectorResult>) {
  try {
    const result = await fn();
    logResult(result);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ${name}: FATAL — ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] Argentina Data Collector Runner starting...`);

  // Run all collectors once on startup
  console.log("Running initial collection...");
  await runCollector("dolar", collectDolar);
  await runCollector("bcra", collectBcra);
  await runCollector("indec", collectIndec);
  await runCollector("boletin", collectBoletin);
  await runCollector("dolar_historico", collectDolarHistorico);
  console.log("Initial collection complete.\n");

  // Schedule recurring collections
  // Dolar: every 15 minutes
  cron.schedule("*/15 * * * *", () => runCollector("dolar", collectDolar));

  // BCRA: every hour
  cron.schedule("0 * * * *", () => runCollector("bcra", collectBcra));

  // INDEC: daily at 3 AM
  cron.schedule("0 3 * * *", () => runCollector("indec", collectIndec));

  // Dólar Histórico: daily at 6 AM (fetches last 7 days from Ámbito)
  cron.schedule("0 6 * * *", () => runCollector("dolar_historico", collectDolarHistorico));

  // Boletín Oficial: weekdays at 8 AM (scrapes daily section pages)
  cron.schedule("0 8 * * 1-5", () => runCollector("boletin", collectBoletin));

  console.log("Scheduled collectors:");
  console.log("  dolar:           every 15 minutes");
  console.log("  bcra:            every hour");
  console.log("  indec:           daily at 03:00");
  console.log("  dolar_historico: daily at 06:00");
  console.log("  boletin:         weekdays at 08:00");
  console.log("\nCollector runner is active. Press Ctrl+C to stop.");
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("\nReceived SIGTERM, shutting down...");
  await pool.end();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("\nReceived SIGINT, shutting down...");
  await pool.end();
  process.exit(0);
});

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
