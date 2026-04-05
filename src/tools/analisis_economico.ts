// Intelligence tool — combines multiple data sources for economic analysis
import { pool } from "../db/pool.js";
import { fetchJSON } from "../utils/http.js";

export type AnalisisMode = "poder_adquisitivo" | "brecha_cambiaria" | "inflacion_tendencia" | "reservas_tendencia";

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
  const absReal = Math.abs(cambioReal);
  if (cambioReal > 5) {
    conclusion = `Los salarios ganaron ${cambioReal}% de poder adquisitivo real. Subieron ${cambioNominal}% nominal vs ${cambioIpc}% de inflación. Mejora significativa del poder de compra.`;
  } else if (cambioReal > 1) {
    conclusion = `Los salarios ganaron levemente ${cambioReal}% de poder adquisitivo real. Subieron ${cambioNominal}% nominal vs ${cambioIpc}% de inflación. Leve mejora.`;
  } else if (cambioReal >= -1) {
    conclusion = `Los salarios prácticamente mantuvieron su poder adquisitivo (${cambioReal > 0 ? "+" : ""}${cambioReal}%). Subieron ${cambioNominal}% nominal vs ${cambioIpc}% de inflación. Variación marginal.`;
  } else if (cambioReal >= -5) {
    conclusion = `Los salarios perdieron levemente ${absReal}% de poder adquisitivo real. Subieron ${cambioNominal}% nominal pero la inflación fue ${cambioIpc}%. Deterioro leve del poder de compra.`;
  } else {
    conclusion = `Los salarios perdieron ${absReal}% de poder adquisitivo real. Subieron ${cambioNominal}% nominal pero la inflación fue ${cambioIpc}%. Deterioro significativo del poder de compra.`;
  }

  // Note data coverage if less than requested
  if (evolucion.length < meses) {
    conclusion += ` (Nota: datos disponibles solo para ${evolucion.length} meses de los ${meses} solicitados — INDEC publica con rezago.)`;
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

// --- Analysis: Inflación Tendencia ---

async function analizarInflacionTendencia(meses: number): Promise<AnalisisResult> {
  const IPC_ID = "148.3_INIVELNAL_DICI_M_26";

  let ipcSeries: [string, number][];
  let fuente: string;

  try {
    ipcSeries = await fetchSeriesFromDb(IPC_ID, meses + 1); // +1 for MoM calc
    fuente = "postgresql";
  } catch {
    try {
      const apiData = await fetchSeriesFromApi([IPC_ID], meses + 1);
      ipcSeries = apiData.get(IPC_ID) || [];
      fuente = "api_directa";
    } catch {
      throw new Error("No se pudieron obtener datos de IPC");
    }
  }

  if (ipcSeries.length < 3) {
    throw new Error("Datos insuficientes para calcular tendencia de inflación");
  }

  // Calculate MoM and annualized rates
  const evolucion = [];
  for (let i = 1; i < ipcSeries.length; i++) {
    const [fecha, valor] = ipcSeries[i];
    const [, valorAnterior] = ipcSeries[i - 1];
    const mom = ((valor - valorAnterior) / valorAnterior) * 100;
    const anualizada = (Math.pow(1 + mom / 100, 12) - 1) * 100;
    evolucion.push({
      fecha,
      ipc: Math.round(valor * 100) / 100,
      variacion_mensual_pct: Math.round(mom * 100) / 100,
      tasa_anualizada_pct: Math.round(anualizada * 100) / 100,
    });
  }

  const tasas = evolucion.map(e => e.variacion_mensual_pct);
  const promedio = Math.round(tasas.reduce((a, b) => a + b, 0) / tasas.length * 100) / 100;
  const ultima = tasas[tasas.length - 1];
  const primera = tasas[0];
  const tendencia = Math.round((ultima - primera) * 100) / 100;
  const anualizadaActual = evolucion[evolucion.length - 1].tasa_anualizada_pct;

  let conclusion: string;
  if (tendencia < -0.5) {
    conclusion = `La inflación muestra tendencia descendente. Última medición: ${ultima}% mensual (${anualizadaActual}% anualizada). Promedio del período: ${promedio}% mensual. La tasa bajó ${Math.abs(tendencia)} pp desde el inicio del período.`;
  } else if (tendencia > 0.5) {
    conclusion = `La inflación muestra tendencia ascendente. Última medición: ${ultima}% mensual (${anualizadaActual}% anualizada). Promedio del período: ${promedio}% mensual. La tasa subió ${tendencia} pp desde el inicio.`;
  } else {
    conclusion = `La inflación se mantiene relativamente estable. Última medición: ${ultima}% mensual (${anualizadaActual}% anualizada). Promedio del período: ${promedio}% mensual.`;
  }

  return {
    analisis: "inflacion_tendencia",
    periodo: { desde: evolucion[0].fecha, hasta: evolucion[evolucion.length - 1].fecha },
    datos: {
      evolucion,
      resumen: {
        inflacion_mensual_actual_pct: ultima,
        inflacion_anualizada_actual_pct: anualizadaActual,
        inflacion_mensual_promedio_pct: promedio,
        tendencia_pp: tendencia,
        meses_analizados: evolucion.length,
      },
    },
    conclusion,
    confianza: fuente === "postgresql" && evolucion.length >= 6 ? "alta" : "media",
    fuentes: ["INDEC — Índice de Precios al Consumidor (IPC)"],
  };
}

// --- Analysis: Reservas Tendencia ---

async function fetchBcraFromDb(idVariable: number, meses: number): Promise<[string, number][]> {
  const result = await pool.query(
    `SELECT fecha, valor FROM bcra_variables
     WHERE id_variable = $1 AND fecha >= NOW() - INTERVAL '${meses} months'
     ORDER BY fecha ASC`,
    [idVariable]
  );
  return result.rows.map((r: any) => [
    r.fecha.toISOString().split("T")[0],
    Number(r.valor),
  ] as [string, number]);
}

async function analizarReservasTendencia(meses: number): Promise<AnalisisResult> {
  let reservas: [string, number][];

  try {
    reservas = await fetchBcraFromDb(1, meses); // variable 1 = reservas
  } catch {
    throw new Error("Datos de reservas BCRA no disponibles");
  }

  if (reservas.length < 5) {
    throw new Error("Datos insuficientes para analizar tendencia de reservas");
  }

  // Sample weekly to reduce output
  const sampled = reservas.filter((_, i) =>
    i === 0 || i === reservas.length - 1 || i % 5 === 0
  );

  const evolucion = sampled.map(([fecha, valor]) => ({
    fecha,
    reservas_musd: Math.round(valor),
  }));

  const primera = reservas[0][1];
  const ultima = reservas[reservas.length - 1][1];
  const variacion = Math.round(ultima - primera);
  const variacionPct = Math.round(((ultima - primera) / primera) * 10000) / 100;
  const maxVal = Math.max(...reservas.map(([, v]) => v));
  const minVal = Math.min(...reservas.map(([, v]) => v));

  let conclusion: string;
  if (variacionPct > 5) {
    conclusion = `Las reservas internacionales del BCRA crecieron de USD ${Math.round(primera)}M a USD ${Math.round(ultima)}M (+${variacionPct}%, +USD ${variacion}M). Máximo: USD ${Math.round(maxVal)}M. Tendencia positiva.`;
  } else if (variacionPct < -5) {
    conclusion = `Las reservas internacionales del BCRA cayeron de USD ${Math.round(primera)}M a USD ${Math.round(ultima)}M (${variacionPct}%, USD ${variacion}M). Mínimo: USD ${Math.round(minVal)}M. Tendencia negativa.`;
  } else {
    conclusion = `Las reservas internacionales del BCRA se mantuvieron estables: USD ${Math.round(ultima)}M (variación: ${variacionPct}%). Rango: USD ${Math.round(minVal)}M — USD ${Math.round(maxVal)}M.`;
  }

  return {
    analisis: "reservas_tendencia",
    periodo: { desde: reservas[0][0], hasta: reservas[reservas.length - 1][0] },
    datos: {
      evolucion,
      resumen: {
        reservas_actual_musd: Math.round(ultima),
        reservas_inicio_musd: Math.round(primera),
        variacion_musd: variacion,
        variacion_pct: variacionPct,
        maximo_musd: Math.round(maxVal),
        minimo_musd: Math.round(minVal),
        dias_analizados: reservas.length,
      },
    },
    conclusion,
    confianza: reservas.length >= 30 ? "alta" : "media",
    fuentes: ["BCRA — Reservas Internacionales"],
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
    case "inflacion_tendencia":
      return analizarInflacionTendencia(meses);
    case "reservas_tendencia":
      return analizarReservasTendencia(meses);
    default:
      throw new Error(
        `Análisis no reconocido: '${mode}'. Opciones:\n` +
        `  - poder_adquisitivo: evolución del salario real vs inflación (IPC vs salarios INDEC)\n` +
        `  - brecha_cambiaria: spread blue/oficial/MEP histórico con tendencia\n` +
        `  - inflacion_tendencia: evolución mensual del IPC con tasa anualizada\n` +
        `  - reservas_tendencia: evolución de reservas internacionales BCRA con variación`
      );
  }
}
