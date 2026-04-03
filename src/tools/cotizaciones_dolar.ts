import { fetchJSON } from "../utils/http.js";
import { pool } from "../db/pool.js";

// DolarAPI.com — Cotizaciones del dólar (Ámbito Financiero)

interface DolarApiItem {
  moneda: string;
  casa: string;
  nombre: string;
  compra: number | null;
  venta: number | null;
  fechaActualizacion: string;
  variacion: number;
}

export interface DolarCotizacion {
  tipo: string;
  nombre: string;
  compra: number | null;
  venta: number | null;
  fecha_actualizacion: string;
  variacion: number;
  spread_vs_oficial: number | null;
}

export interface DolarCotizacionesResult {
  cotizaciones: DolarCotizacion[];
  fuente: string;
  actualizado_al: string;
  freshness: "current" | "stale" | "unknown";
}

function addSpread(cotizaciones: DolarCotizacion[]): DolarCotizacion[] {
  const oficial = cotizaciones.find((c) => c.tipo === "oficial");
  const oficialVenta = oficial?.venta;
  return cotizaciones.map((c) => ({
    ...c,
    spread_vs_oficial:
      c.tipo === "oficial"
        ? 0
        : oficialVenta && c.venta
          ? Math.round(((c.venta - oficialVenta) / oficialVenta) * 10000) / 100
          : null,
  }));
}

export async function dolarCotizaciones(): Promise<DolarCotizacionesResult> {
  // Try PostgreSQL first
  try {
    const dbResult = await pool.query(
      `SELECT DISTINCT ON (tipo) tipo, compra, venta, fecha, variacion, fuente, created_at
       FROM cotizaciones_dolar
       WHERE fuente = 'dolarapi'
       ORDER BY tipo, created_at DESC`
    );
    if (dbResult.rows.length > 0) {
      // Use created_at (when collector saved it) for freshness, not fecha (market timestamp)
      // This way, data from Friday is still "current" on Saturday if collector ran recently
      const maxCreatedAt = dbResult.rows.reduce((max: Date, r: any) =>
        r.created_at > max ? r.created_at : max, new Date(0));
      const collectorAgeMinutes = (Date.now() - maxCreatedAt.getTime()) / 60000;

      // Market data timestamp for display
      const maxFecha = dbResult.rows.reduce((max: Date, r: any) =>
        r.fecha > max ? r.fecha : max, new Date(0));

      return {
        cotizaciones: addSpread(dbResult.rows.map((r: any) => ({
          tipo: r.tipo,
          nombre: NOMBRES[r.tipo] || r.tipo,
          compra: r.compra ? Number(r.compra) : null,
          venta: r.venta ? Number(r.venta) : null,
          fecha_actualizacion: r.fecha.toISOString(),
          variacion: r.variacion ? Number(r.variacion) : 0,
          spread_vs_oficial: null,
        }))),
        fuente: "postgresql",
        actualizado_al: maxFecha.toISOString(),
        freshness: collectorAgeMinutes < 60 ? "current" : "stale",
      };
    }
  } catch {
    // DB not available, fall through to API
  }

  // Fallback: direct API call
  const data = await fetchJSON<DolarApiItem[]>("https://dolarapi.com/v1/ambito/dolares");
  const now = new Date().toISOString();
  return {
    cotizaciones: addSpread(data.map((item) => ({
      tipo: item.casa,
      nombre: item.nombre,
      compra: item.compra,
      venta: item.venta,
      fecha_actualizacion: item.fechaActualizacion,
      variacion: item.variacion,
      spread_vs_oficial: null,
    }))),
    fuente: "api_directa",
    actualizado_al: now,
    freshness: "current",
  };
}

const NOMBRES: Record<string, string> = {
  oficial: "Oficial",
  blue: "Blue",
  bolsa: "Bolsa",
  contadoconliqui: "Contado con liquidación",
  mayorista: "Mayorista",
  cripto: "Cripto",
  tarjeta: "Tarjeta",
};
