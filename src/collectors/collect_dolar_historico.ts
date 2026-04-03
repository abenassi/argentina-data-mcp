import { pool } from "../db/pool.js";
import type { CollectorResult } from "../types/collector.js";

const AMBITO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.ambito.com/",
  Origin: "https://www.ambito.com",
};

interface Endpoint {
  tipo: string;
  path: string;
  format: "historico" | "grafico";
}

const ENDPOINTS: Endpoint[] = [
  { tipo: "blue", path: "dolar/informal/historico-general", format: "historico" },
  { tipo: "oficial", path: "dolar/oficial/historico-general", format: "historico" },
  { tipo: "mep", path: "dolarrava/mep/grafico", format: "grafico" },
  { tipo: "ccl", path: "dolarrava/cl/grafico", format: "grafico" },
  { tipo: "mayorista", path: "dolar/mayorista/historico-general", format: "historico" },
  { tipo: "cripto", path: "dolar/cripto/historico-general", format: "historico" },
  { tipo: "tarjeta", path: "dolar/tarjeta/historico-general", format: "historico" },
];

function parseDate(dateStr: string): string {
  const [d, m, y] = dateStr.split("/");
  return `${y}-${m}-${d}`;
}

function parseNumber(str: string): number | null {
  if (!str || str === "No Cotiza" || str === "-") return null;
  return Number(str.replace(/\./g, "").replace(",", "."));
}

export async function collectDolarHistorico(): Promise<CollectorResult> {
  const start = Date.now();
  const errors: string[] = [];
  let recordsUpserted = 0;

  // Fetch last 7 days to catch any gaps
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const fromStr = from.toISOString().split("T")[0];
  const toStr = to.toISOString().split("T")[0];

  for (const ep of ENDPOINTS) {
    try {
      const url = `https://mercados.ambito.com//${ep.path}/${fromStr}/${toStr}`;
      const response = await fetch(url, {
        headers: AMBITO_HEADERS,
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        errors.push(`${ep.tipo}: HTTP ${response.status}`);
        continue;
      }

      const data = (await response.json()) as any[];
      if (!data || data.length <= 1) continue;

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        try {
          let fecha: string;
          let compra: number | null;
          let venta: number | null;

          if (ep.format === "historico") {
            fecha = parseDate(row[0]);
            compra = parseNumber(row[1]);
            venta = parseNumber(row[2]);
          } else {
            fecha = parseDate(row[0]);
            compra = null;
            venta = typeof row[1] === "number" ? row[1] : parseNumber(String(row[1]));
          }

          await pool.query(
            `INSERT INTO dolar_historico (tipo, fecha, compra, venta, created_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (tipo, fecha) DO UPDATE SET compra=COALESCE($3, dolar_historico.compra), venta=COALESCE($4, dolar_historico.venta)`,
            [ep.tipo, fecha, compra, venta]
          );
          recordsUpserted++;
        } catch {
          // Skip bad rows
        }
      }
    } catch (err) {
      errors.push(`${ep.tipo}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Rate limiting
    await new Promise((r) => setTimeout(r, 300));
  }

  // Update freshness
  try {
    await pool.query(
      `INSERT INTO data_freshness (source_name, last_successful_fetch, last_data_date, is_healthy, updated_at)
       VALUES ('dolar_historico', NOW(), CURRENT_DATE, $1, NOW())
       ON CONFLICT (source_name) DO UPDATE SET last_successful_fetch=NOW(), last_data_date=CURRENT_DATE, is_healthy=$1, error_message=$2, updated_at=NOW()`,
      [errors.length === 0, errors.length > 0 ? errors.join("; ") : null]
    );
  } catch { /* ignore freshness update failure */ }

  return { source: "dolar_historico", recordsUpserted, errors, durationMs: Date.now() - start };
}
