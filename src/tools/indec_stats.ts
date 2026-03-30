import { fetchJSON } from "../utils/http.js";

// INDEC / datos.gob.ar API for Argentine statistics

interface DatosGobSerieResponse {
  data: {
    fecha: string;
    valor: number;
  }[];
  meta?: {
    frequency: string;
    title: string;
  };
}

// Series IDs from datos.gob.ar time series API
const INDICADORES: Record<string, { serieId: string; descripcion: string }> = {
  ipc: { serieId: "148.3_INIVELAM_DICI_M_26", descripcion: "Índice de Precios al Consumidor (IPC)" },
  emae: { serieId: "143.3_NO_PR_2004_A_21", descripcion: "Estimador Mensual de Actividad Económica (EMAE)" },
  ipc_nucleo: { serieId: "148.3_INUCAM_DICI_M_19", descripcion: "IPC Núcleo" },
  salarios: { serieId: "148.3_ISALam_DICI_M_30", descripcion: "Índice de Salarios" },
  construccion: { serieId: "11.3_ISAC_0_M_22", descripcion: "Indicador Sintético de Actividad de la Construcción (ISAC)" },
  industria: { serieId: "143.3_IN_PR_2004_A_21", descripcion: "Índice de Producción Industrial (IPI)" },
};

export interface IndecStatsInput {
  indicador: string;
  periodo?: string;
}

export interface IndecStatsResult {
  indicador: string;
  descripcion: string;
  valor: number;
  periodo: string;
  variacion?: number;
}

export async function indecStats(input: IndecStatsInput): Promise<IndecStatsResult> {
  const indicadorKey = input.indicador.toLowerCase();
  const indicador = INDICADORES[indicadorKey];

  if (!indicador) {
    const disponibles = Object.entries(INDICADORES)
      .map(([k, v]) => `${k}: ${v.descripcion}`)
      .join("\n  ");
    throw new Error(
      `Indicador "${input.indicador}" no reconocido. Disponibles:\n  ${disponibles}`
    );
  }

  const params = new URLSearchParams({
    ids: indicador.serieId,
    limit: "2",
    sort: "desc",
  });

  if (input.periodo) {
    params.set("start_date", input.periodo);
    params.set("limit", "2");
  }

  const url = `https://apis.datos.gob.ar/series/api/series/?${params}`;
  const data = await fetchJSON<DatosGobSerieResponse>(url);

  if (!data.data || data.data.length === 0) {
    throw new Error(`No hay datos disponibles para ${indicador.descripcion}`);
  }

  const latest = data.data[0];
  const previous = data.data.length > 1 ? data.data[1] : null;

  const variacion = previous && previous.valor !== 0
    ? ((latest.valor - previous.valor) / previous.valor) * 100
    : undefined;

  return {
    indicador: indicadorKey,
    descripcion: indicador.descripcion,
    valor: latest.valor,
    periodo: latest.fecha,
    variacion: variacion !== undefined ? Math.round(variacion * 100) / 100 : undefined,
  };
}
