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
}

export interface DolarCotizacionesResult {
  cotizaciones: DolarCotizacion[];
  fuente: string;
  actualizado_al: string;
  freshness: "current" | "stale" | "unknown";
}

export async function dolarCotizaciones(): Promise<DolarCotizacionesResult> {
  // Try PostgreSQL first
  try {
    const dbResult = await pool.query(
      `SELECT DISTINCT ON (tipo) tipo, compra, venta, fecha, variacion, fuente
       FROM cotizaciones_dolar
       WHERE fuente = 'dolarapi'
       ORDER BY tipo, created_at DESC`
    );
    if (dbResult.rows.length > 0) {
      const maxFecha = dbResult.rows.reduce((max: string, r: any) =>
        r.fecha > max ? r.fecha.toISOString() : max, "");
      const ageMinutes = (Date.now() - new Date(maxFecha).getTime()) / 60000;
      return {
        cotizaciones: dbResult.rows.map((r: any) => ({
          tipo: r.tipo,
          nombre: NOMBRES[r.tipo] || r.tipo,
          compra: r.compra ? Number(r.compra) : null,
          venta: r.venta ? Number(r.venta) : null,
          fecha_actualizacion: r.fecha.toISOString(),
          variacion: r.variacion ? Number(r.variacion) : 0,
        })),
        fuente: "postgresql",
        actualizado_al: maxFecha,
        freshness: ageMinutes < 30 ? "current" : "stale",
      };
    }
  } catch {
    // DB not available, fall through to API
  }

  // Fallback: direct API call
  const data = await fetchJSON<DolarApiItem[]>("https://dolarapi.com/v1/ambito/dolares");
  const now = new Date().toISOString();
  return {
    cotizaciones: data.map((item) => ({
      tipo: item.casa,
      nombre: item.nombre,
      compra: item.compra,
      venta: item.venta,
      fecha_actualizacion: item.fechaActualizacion,
      variacion: item.variacion,
    })),
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
