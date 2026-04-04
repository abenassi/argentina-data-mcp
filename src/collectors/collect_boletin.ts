import { pool } from "../db/pool.js";
import type { CollectorResult } from "../types/collector.js";

// Boletín Oficial collector — scrapes daily section pages (no auth needed)
// Each section page (primera/segunda/tercera) lists all avisos for the current day.

const BASE_URL = "https://www.boletinoficial.gob.ar";
const SECTIONS = ["primera", "segunda", "tercera"] as const;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface BoletinAviso {
  id_aviso: string;
  seccion: string;
  fecha: string; // YYYYMMDD
  organismo: string;
  tipo_norma: string;
  url: string;
}

/** Parse avisos from a section HTML page */
export function parseAvisosFromHtml(html: string): BoletinAviso[] {
  const avisos: BoletinAviso[] = [];
  const regex = /<a\s+[^>]*href="\/detalleAviso\/(\w+)\/([\w]+)\/(\d+)(?:\?[^"]*)?"[^>]*>[\s\S]*?<p\s+class="item">\s*([^<]+?)\s*<\/p>(?:[\s\S]*?<p\s+class="item-detalle">\s*<small>\s*([^<]*?)\s*<\/small>)?/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    avisos.push({
      seccion: match[1],
      id_aviso: match[2],
      fecha: match[3],
      organismo: match[4].trim(),
      tipo_norma: (match[5] || "").trim(),
      url: `${BASE_URL}/detalleAviso/${match[1]}/${match[2]}/${match[3]}`,
    });
  }
  return avisos;
}

/** Fetch a section page and parse avisos */
async function fetchSection(section: string): Promise<BoletinAviso[]> {
  const res = await fetch(`${BASE_URL}/seccion/${section}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching /seccion/${section}`);
  const html = await res.text();
  return parseAvisosFromHtml(html);
}

/** Search API — used for backfill and tool fallback */
export async function searchBoletin(texto: string, fecha: string): Promise<BoletinAviso[]> {
  // Step 1: Get session cookie
  const homeRes = await fetch(`${BASE_URL}/`, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  const cookies = homeRes.headers.getSetCookie?.() || [];
  const cookie = cookies.map((c: string) => c.split(";")[0]).join("; ");

  // Step 2: Quick search
  const params = JSON.stringify({
    texto,
    tipoBusqueda: "Rapida",
    seccion: "all",
    fecha,
    numeroPagina: 1,
    hayMasResultadosBusqueda: true,
    ejecutandoLlamadaAsincronicaBusqueda: false,
    busquedaOriginal: true,
    rubros: [],
  });

  const res = await fetch(`${BASE_URL}/busquedaAvanzada/realizarBusqueda`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
      "Cookie": cookie,
    },
    body: `params=${encodeURIComponent(params)}&array_volver=${encodeURIComponent("[]")}`,
    signal: AbortSignal.timeout(30000),
  });

  const data = await res.json() as { error: number; content?: { html?: string } };
  if (data.error !== 0 || !data.content?.html) return [];
  return parseAvisosFromHtml(data.content.html);
}

/** Upsert avisos into PostgreSQL */
async function upsertAvisos(avisos: BoletinAviso[]): Promise<number> {
  let upserted = 0;
  for (const a of avisos) {
    const fechaFormatted = `${a.fecha.substring(0, 4)}-${a.fecha.substring(4, 6)}-${a.fecha.substring(6, 8)}`;
    try {
      await pool.query(
        `INSERT INTO boletin_oficial (id_aviso, seccion, fecha, organismo, tipo_norma, url, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (id_aviso, seccion) DO NOTHING`,
        [a.id_aviso, a.seccion, fechaFormatted, a.organismo, a.tipo_norma, a.url]
      );
      upserted++;
    } catch (err) {
      // Ignore individual insert errors (dups, etc)
    }
  }
  return upserted;
}

/** Daily collector — fetches all 3 section pages */
export async function collectBoletin(): Promise<CollectorResult> {
  const start = Date.now();
  const errors: string[] = [];
  let recordsUpserted = 0;

  try {
    for (const section of SECTIONS) {
      try {
        const avisos = await fetchSection(section);
        const upserted = await upsertAvisos(avisos);
        recordsUpserted += upserted;
      } catch (err) {
        errors.push(`${section}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const isHealthy = errors.length < SECTIONS.length; // healthy if at least 1 section worked
    await pool.query(
      `INSERT INTO data_freshness (source_name, last_successful_fetch, last_data_date, is_healthy, error_message, updated_at)
       VALUES ('boletin_oficial', NOW(), CURRENT_DATE, $1, $2, NOW())
       ON CONFLICT (source_name) DO UPDATE SET last_successful_fetch=NOW(), last_data_date=CURRENT_DATE, is_healthy=$1, error_message=$2, updated_at=NOW()`,
      [isHealthy, errors.length > 0 ? errors.join("; ") : null]
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Fatal: ${msg}`);
    try {
      await pool.query(
        `INSERT INTO data_freshness (source_name, is_healthy, error_message, updated_at)
         VALUES ('boletin_oficial', false, $1, NOW())
         ON CONFLICT (source_name) DO UPDATE SET is_healthy=false, error_message=$1, updated_at=NOW()`,
        [msg]
      );
    } catch { /* ignore */ }
  }

  return { source: "boletin_oficial", recordsUpserted, errors, durationMs: Date.now() - start };
}
