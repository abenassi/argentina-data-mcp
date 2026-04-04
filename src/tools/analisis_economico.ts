// Intelligence tool — combines multiple data sources for economic analysis
import { pool } from "../db/pool.js";
import { fetchJSON } from "../utils/http.js";

export type AnalisisMode = "poder_adquisitivo" | "brecha_cambiaria";

export interface AnalisisInput {
  analisis: string;
  meses?: number;
}

export interface AnalisisResult {
  analisis: string;
  periodo: { desde: string; hasta: string };
  datos: Record<string, unknown>;
  conclusion: string;
  confianza: "alta" | "media" | "baja";
  fuentes: string[];
}

// --- datos.gob.ar series API ---

interface SeriesApiResponse {
  data: [string, number | null][];
}

async function fetchSeriesFromApi(serieIds: string[], limit: number): Promise<Map<string, [string, number][]>> {
  const url = `https://apis.datos.gob.ar/series/api/series/?ids=${serieIds.join(",")}&limit=${limit}&sort=desc`;
  const data = await fetchJSON<SeriesApiResponse>(url);
  const result = new Map<string, [string, number][]>();
  // Multi-series response: data has arrays with [fecha, val1, val2, ...]
  for (let i = 0; i < serieIds.length; i++) {
    const points: [string, number][] = [];
    for (const row of data.data) {
      const val = (row as unknown[])[i + 1] as number | null;
      if (val !== null) points.push([row[0], val]);
    }
    result.set(serieIds[i], points.reverse()); // chronological order
  }
  return result;
}

async function fetchSeriesFromDb(serieId: string, limit: number): Promise<[string, number][]> {
  const result = await pool.query(
    `SELECT fecha, valor FROM indec_series WHERE serie_id = $1 ORDER BY fecha DESC LIMIT $2`,
    [serieId, limit]
  );
  return result.rows.map((r: any) => [
    r.fecha.toISOString().split("T")[0],
    Number(r.valor),
  ] as [string, number]).reverse();
}

async function fetchDolarHistoricoFromDb(tipo: string, meses: number): Promise<[string, number][]> {
  const result = await pool.query(
    `SELECT fecha, venta FROM dolar_historico
     WHERE tipo = $1 AND fecha >= NOW() - INTERVAL '${meses} months'
     ORDER BY fecha ASC`,
    [tipo]
  );
  return result.rows.map((r: any) => [
    r.fecha.toISOString().split("T")[0],
    Number(r.venta),
  ] as [string, number]);
}

// --- Analysis: Poder Adquisitivo ---

async function analizarPoderAdquisitivo(meses: number): Promise<AnalisisResult> {
  const IPC_ID = "148.3_INIVELNAL_DICI_M_26";
  const SALARIOS_ID = "149.1_TL_INDIIOS_OCTU_0_21";

  let ipcSeries: [string, number][];
  let salariosSeries: [string, number][];
  let fuente: string;

  try {
    [ipcSeries, salariosSeries] = await Promise.all([
      fetchSeriesFromDb(IPC_ID, meses),
      fetchSeriesFromDb(SALARIOS_ID, meses),
    ]);
    fuente = "postgresql";
  } catch {
    try {
      const apiData = await fetchSeriesFromApi([IPC_ID, SALARIOS_ID], meses);
      ipcSeries = apiData.get(IPC_ID) || [];
      salariosSeries = apiData.get(SALARIOS_ID) || [];
      fuente = "api_directa";
    } catch {
      throw new Error("No se pudieron obtener datos de IPC y salarios ni de la base de datos ni de la API de datos.gob.ar");
    }
  }

  if (ipcSeries.length < 2 || salariosSeries.length < 2) {
    throw new Error("Datos insuficientes para calcular poder adquisitivo");
  }

  // Align dates: use overlapping period
  const ipcDates = new Set(ipcSeries.map(([d]) => d));
  const aligned = salariosSeries.filter(([d]) => ipcDates.has(d));

  if (aligned.length < 2) {
    throw new Error("No hay suficientes meses con datos de IPC y salarios coincidentes");
  }

  const ipcMap = new Map(ipcSeries);

  // Calculate real wage index: (salarios / IPC) * 100, rebased to first month = 100
  const firstSalario = aligned[0][1];
  const firstIpc = ipcMap.get(aligned[0][0])!;
  const baseReal = firstSalario / firstIpc;

  const evolucion = aligned.map(([fecha, salario]) => {
    const ipc = ipcMap.get(fecha)!;
    const salarioReal = (salario / ipc) / baseReal * 100;
    return {
      fecha,
      salario_nominal_idx: Math.round(salario / firstSalario * 10000) / 100,
      ipc_idx: Math.round(ipc / firstIpc * 10000) / 100,
      salario_real_idx: Math.round(salarioReal * 100) / 100,
    };
  });

  const primero = evolucion[0];
  const ultimo = evolucion[evolucion.length - 1];
  const cambioReal = Math.round((ultimo.salario_real_idx - 100) * 100) / 100;
  const cambioNominal = Math.round((ultimo.salario_nominal_idx - 100) * 100) / 100;
  const cambioIpc = Math.round((ultimo.ipc_idx - 100) * 100) / 100;

  let conclusion: string;
  if (cambioReal > 2) {
    conclusion = `Los salarios ganaron ${cambioReal}% de poder adquisitivo real en el período. Subieron ${cambioNominal}% nominal vs ${cambioIpc}% de inflación (IPC). Los trabajadores mejoraron su capacidad de compra.`;
  } else if (cambioReal < -2) {
    conclusion = `Los salarios perdieron ${Math.abs(cambioReal)}% de poder adquisitivo real en el período. Subieron ${cambioNominal}% nominal pero la inflación fue ${cambioIpc}% (IPC). Los trabajadores perdieron capacidad de compra.`;
  } else {
    conclusion = `Los salarios mantuvieron su poder adquisitivo real (variación: ${cambioReal}%). Subieron ${cambioNominal}% nominal vs ${cambioIpc}% de inflación (IPC). Prácticamente neutro.`;
  }

  return {
    analisis: "poder_adquisitivo",
    periodo: { desde: primero.fecha, hasta: ultimo.fecha },
    datos: {
      evolucion,
      resumen: {
        variacion_salario_nominal_pct: cambioNominal,
        variacion_ipc_pct: cambioIpc,
        variacion_salario_real_pct: cambioReal,
        meses_analizados: evolucion.length,
      },
    },
    conclusion,
    confianza: fuente === "postgresql" && aligned.length >= 6 ? "alta" : "media",
    fuentes: ["INDEC — Índice de Salarios (RIPTE)", "INDEC — Índice de Precios al Consumidor (IPC)"],
  };
}

// --- Analysis: Brecha Cambiaria ---

async function analizarBrechaCambiaria(meses: number): Promise<AnalisisResult> {
  let oficialData: [string, number][];
  let blueData: [string, number][];
  let mepData: [string, number][];
  let fuente: string;

  try {
    [oficialData, blueData, mepData] = await Promise.all([
      fetchDolarHistoricoFromDb("oficial", meses),
      fetchDolarHistoricoFromDb("blue", meses),
      fetchDolarHistoricoFromDb("mep", meses),
    ]);
    fuente = "postgresql";
  } catch {
    throw new Error("Datos de dólar histórico no disponibles. Ejecutar backfill:dolar-historico primero.");
  }

  if (oficialData.length < 5 || blueData.length < 5) {
    throw new Error("Datos insuficientes para analizar brecha cambiaria");
  }

  const oficialMap = new Map(oficialData);
  const mepMap = new Map(mepData);

  // Calculate daily blue-oficial spread
  const brechaBlue = blueData
    .filter(([d]) => oficialMap.has(d))
    .map(([fecha, blue]) => {
      const oficial = oficialMap.get(fecha)!;
      const brecha = ((blue - oficial) / oficial) * 100;
      const mep = mepMap.get(fecha);
      const brechaMep = mep ? ((mep - oficial) / oficial) * 100 : null;
      return {
        fecha,
        oficial: Math.round(oficial * 100) / 100,
        blue: Math.round(blue * 100) / 100,
        brecha_blue_pct: Math.round(brecha * 100) / 100,
        mep: mep ? Math.round(mep * 100) / 100 : null,
        brecha_mep_pct: brechaMep !== null ? Math.round(brechaMep * 100) / 100 : null,
      };
    });

  if (brechaBlue.length === 0) {
    throw new Error("No hay fechas coincidentes entre dólar oficial y blue");
  }

  // Sample: take weekly points to avoid huge output
  const sampled = brechaBlue.filter((_, i) =>
    i === 0 || i === brechaBlue.length - 1 || i % 5 === 0
  );

  const brechas = brechaBlue.map((b) => b.brecha_blue_pct);
  const brechaActual = brechas[brechas.length - 1];
  const brechaMax = Math.max(...brechas);
  const brechaMin = Math.min(...brechas);
  const brechaPromedio = Math.round(brechas.reduce((a, b) => a + b, 0) / brechas.length * 100) / 100;
  const brechaInicio = brechas[0];

  let conclusion: string;
  const tendencia = brechaActual - brechaInicio;
  if (tendencia > 5) {
    conclusion = `La brecha cambiaria blue/oficial se amplió de ${brechaInicio}% a ${brechaActual}% (+${Math.round(tendencia * 100) / 100} pp). Promedio del período: ${brechaPromedio}%. Máximo: ${brechaMax}%, mínimo: ${brechaMin}%. Señal de mayor presión cambiaria.`;
  } else if (tendencia < -5) {
    conclusion = `La brecha cambiaria blue/oficial se redujo de ${brechaInicio}% a ${brechaActual}% (${Math.round(tendencia * 100) / 100} pp). Promedio del período: ${brechaPromedio}%. Máximo: ${brechaMax}%, mínimo: ${brechaMin}%. Señal de menor presión cambiaria.`;
  } else {
    conclusion = `La brecha cambiaria blue/oficial se mantuvo estable: ${brechaActual}% (inicio: ${brechaInicio}%). Promedio: ${brechaPromedio}%. Rango: ${brechaMin}%-${brechaMax}%.`;
  }

  return {
    analisis: "brecha_cambiaria",
    periodo: { desde: brechaBlue[0].fecha, hasta: brechaBlue[brechaBlue.length - 1].fecha },
    datos: {
      evolucion: sampled,
      resumen: {
        brecha_actual_blue_pct: brechaActual,
        brecha_promedio_blue_pct: brechaPromedio,
        brecha_max_blue_pct: brechaMax,
        brecha_min_blue_pct: brechaMin,
        variacion_periodo_pp: Math.round(tendencia * 100) / 100,
        dias_analizados: brechaBlue.length,
      },
    },
    conclusion,
    confianza: fuente === "postgresql" && brechaBlue.length >= 30 ? "alta" : "media",
    fuentes: ["Ámbito Financiero — Dólar oficial", "Ámbito Financiero — Dólar blue", "Ámbito Financiero — Dólar MEP"],
  };
}

// --- Public API ---

export async function analisisEconomico(input: AnalisisInput): Promise<AnalisisResult> {
  const mode = (input.analisis || "").toLowerCase();
  const meses = input.meses || 12;

  if (meses < 1 || meses > 24) {
    throw new Error("El rango de meses debe estar entre 1 y 24");
  }

  switch (mode) {
    case "poder_adquisitivo":
      return analizarPoderAdquisitivo(meses);
    case "brecha_cambiaria":
      return analizarBrechaCambiaria(meses);
    default:
      throw new Error(
        `Análisis no reconocido: '${mode}'. Opciones:\n` +
        `  - poder_adquisitivo: evolución del salario real vs inflación (IPC vs salarios INDEC)\n` +
        `  - brecha_cambiaria: spread blue/oficial/MEP histórico con tendencia`
      );
  }
}
