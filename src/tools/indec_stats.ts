import { fetchJSON } from "../utils/http.js";
import { pool } from "../db/pool.js";

// datos.gob.ar Series de Tiempo API
// Response: { data: [["2026-02-01", 10714.6255], ...], meta: [...] }

interface DatosGobSerieResponse {
  data: [string, number | null][];
  count: number;
  meta: [
    { frequency: string; start_date: string; end_date: string },
    {
      field: {
        id: string;
        time_index_end: string;
        is_updated: string;
        last_value: string;
      };
      [key: string]: unknown;
    },
  ];
}

const INDICADORES: Record<string, { serieId: string; descripcion: string }> = {
  ipc: { serieId: "148.3_INIVELNAL_DICI_M_26", descripcion: "Índice de Precios al Consumidor (IPC) Nacional" },
  emae: { serieId: "143.3_NO_PR_2004_A_21", descripcion: "Estimador Mensual de Actividad Económica (EMAE)" },
  ipc_nucleo: { serieId: "148.3_INUCLEONAL_DICI_M_19", descripcion: "IPC Núcleo Nacional" },
  salarios: { serieId: "149.1_TL_INDIIOS_OCTU_0_21", descripcion: "Índice de Salarios" },
  construccion: { serieId: "33.2_ISAC_NIVELRAL_0_M_18_63", descripcion: "Indicador Sintético de Actividad de la Construcción (ISAC)" },
  industria: { serieId: "453.1_SERIE_ORIGNAL_0_0_14_46", descripcion: "Índice de Producción Industrial (IPI)" },
};

export interface IndecStatsInput {
  indicador: string;
  periodo?: string;
  ultimos?: number;
}

export interface IndecStatsResult {
  indicador: string;
  descripcion: string;
  valor: number;
  periodo: string;
  variacion?: number;
  actualizado_al: string;
  is_updated: boolean;
  fuente: string;
  fuente_url: string;
  freshness: "current" | "stale" | "unknown";
  datos?: Array<{ fecha: string; valor: number }>;
}

export async function indecStats(input: IndecStatsInput): Promise<IndecStatsResult> {
  const indicadorKey = input.indicador.toLowerCase();
  const indicador = INDICADORES[indicadorKey];

  if (!indicador) {
    const disponibles = Object.entries(INDICADORES)
      .map(([k, v]) => `${k}: ${v.descripcion}`)
      .join("\n  ");
    throw new Error(`Indicador "${input.indicador}" no reconocido. Disponibles:\n  ${disponibles}`);
  }

  const ultimos = Math.min(Math.max(input.ultimos || 1, 1), 24);
  const dbLimit = Math.max(2, ultimos); // Always fetch at least 2 for MoM variation

  // Try PostgreSQL first
  try {
    const dbResult = await pool.query(
      `SELECT valor, fecha, is_updated, metadata FROM indec_series
       WHERE serie_id = $1
       ORDER BY fecha DESC LIMIT $2`,
      [indicador.serieId, dbLimit]
    );
    if (dbResult.rows.length > 0) {
      const latest = dbResult.rows[0];
      const previous = dbResult.rows.length > 1 ? dbResult.rows[1] : null;
      const variacion = previous && Number(previous.valor) !== 0
        ? ((Number(latest.valor) - Number(previous.valor)) / Number(previous.valor)) * 100
        : undefined;
      const fechaStr = latest.fecha.toISOString().split("T")[0];
      const ageMonths = (Date.now() - new Date(fechaStr).getTime()) / (30 * 24 * 3600000);
      const result: IndecStatsResult = {
        indicador: indicadorKey,
        descripcion: indicador.descripcion,
        valor: Number(latest.valor),
        periodo: fechaStr,
        variacion: variacion !== undefined ? Math.round(variacion * 100) / 100 : undefined,
        actualizado_al: fechaStr,
        is_updated: latest.is_updated,
        fuente: "INDEC - Series de Tiempo",
        fuente_url: "https://datos.gob.ar/series/api/",
        freshness: ageMonths < 3 ? "current" : "stale",
      };
      if (ultimos > 1) {
        result.datos = dbResult.rows.slice(0, ultimos)
          .map((r: any) => ({ fecha: r.fecha.toISOString().split("T")[0], valor: Number(r.valor) }))
          .reverse(); // chronological order (oldest first)
      }
      return result;
    }
  } catch {
    // DB not available, fall through to API
  }

  // Fallback: direct API call
  const params = new URLSearchParams({
    ids: indicador.serieId,
    limit: String(dbLimit),
    sort: "desc",
    metadata: "full",
  });

  if (input.periodo) {
    params.set("start_date", input.periodo);
  }

  const url = `https://apis.datos.gob.ar/series/api/series/?${params}`;
  const data = await fetchJSON<DatosGobSerieResponse>(url);

  if (!data.data || data.data.length === 0) {
    throw new Error(`No hay datos disponibles para ${indicador.descripcion}`);
  }

  // data is array of arrays: [["2026-02-01", 10714.6255], ...]
  const latest = data.data[0];
  const previous = data.data.length > 1 ? data.data[1] : null;

  const latestValor = latest[1];
  const previousValor = previous ? previous[1] : null;

  if (latestValor === null) {
    throw new Error(`Valor nulo para ${indicador.descripcion}`);
  }

  const variacion = previousValor !== null && previousValor !== 0
    ? ((latestValor - previousValor) / previousValor) * 100
    : undefined;

  // Extract freshness from metadata
  const fieldMeta = data.meta && data.meta.length > 1 ? data.meta[1].field : null;
  const timeIndexEnd = fieldMeta?.time_index_end || latest[0];
  const isUpdated = fieldMeta?.is_updated !== "False";

  const result: IndecStatsResult = {
    indicador: indicadorKey,
    descripcion: indicador.descripcion,
    valor: latestValor,
    periodo: latest[0],
    variacion: variacion !== undefined ? Math.round(variacion * 100) / 100 : undefined,
    actualizado_al: timeIndexEnd,
    is_updated: isUpdated,
    fuente: "INDEC - Series de Tiempo",
    fuente_url: "https://datos.gob.ar/series/api/",
    freshness: isUpdated ? "current" : "stale",
  };
  if (ultimos > 1) {
    result.datos = data.data.slice(0, ultimos)
      .filter((d): d is [string, number] => d[1] !== null)
      .map(d => ({ fecha: d[0], valor: d[1] }))
      .reverse(); // chronological order
  }
  return result;
}
