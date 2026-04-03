import { pool } from "../db/pool.js";

export interface DolarHistoricoInput {
  tipo?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
}

export interface DolarHistoricoResult {
  tipo: string;
  datos: { fecha: string; compra: number | null; venta: number | null }[];
  registros: number;
  fuente: string;
  freshness: "current" | "stale" | "unknown";
}

const TIPOS_VALIDOS = ["blue", "oficial", "mep", "ccl", "mayorista", "cripto", "tarjeta"];

export async function dolarHistorico(input: DolarHistoricoInput): Promise<DolarHistoricoResult> {
  const tipo = input.tipo || "blue";

  if (!TIPOS_VALIDOS.includes(tipo)) {
    throw new Error(`Tipo "${tipo}" no válido. Opciones: ${TIPOS_VALIDOS.join(", ")}`);
  }

  const hoy = new Date();
  const fechaHasta = input.fecha_hasta || hoy.toISOString().split("T")[0];
  const defaultDesde = new Date(hoy);
  defaultDesde.setMonth(defaultDesde.getMonth() - 3);
  const fechaDesde = input.fecha_desde || defaultDesde.toISOString().split("T")[0];

  const result = await pool.query(
    `SELECT fecha, compra, venta FROM dolar_historico
     WHERE tipo = $1 AND fecha >= $2 AND fecha <= $3
     ORDER BY fecha ASC`,
    [tipo, fechaDesde, fechaHasta]
  );

  if (result.rows.length === 0) {
    throw new Error(
      `No hay datos históricos para dólar ${tipo} en el rango ${fechaDesde} a ${fechaHasta}. ` +
      `Ejecutá 'npm run backfill:dolar-historico' para cargar datos.`
    );
  }

  // Check freshness from data_freshness table
  const freshRow = await pool.query(
    "SELECT last_successful_fetch FROM data_freshness WHERE source_name = 'dolar_historico'"
  );
  const lastFetch = freshRow.rows[0]?.last_successful_fetch;
  const ageHours = lastFetch ? (Date.now() - new Date(lastFetch).getTime()) / 3600000 : 999;

  return {
    tipo,
    datos: result.rows.map((r: any) => ({
      fecha: r.fecha.toISOString().split("T")[0],
      compra: r.compra ? Number(r.compra) : null,
      venta: r.venta ? Number(r.venta) : null,
    })),
    registros: result.rows.length,
    fuente: "postgresql (ámbito financiero)",
    freshness: ageHours < 48 ? "current" : "stale",
  };
}
