// Discovery tools — let agents discover available data options

export interface VariableInfo {
  nombre: string;
  descripcion: string;
  unidad: string;
  id_bcra: number;
}

export interface IndicadorInfo {
  nombre: string;
  descripcion: string;
  serie_id: string;
  frecuencia: string;
}

export interface DolarTipoInfo {
  nombre: string;
  descripcion: string;
  tiene_historico: boolean;
  tiene_cotizacion_actual: boolean;
}

// --- BCRA Variables ---

const BCRA_VARIABLES: VariableInfo[] = [
  { nombre: "dolar_oficial", descripcion: "Tipo de cambio minorista (promedio vendedor)", unidad: "ARS/USD", id_bcra: 4 },
  { nombre: "dolar_mayorista", descripcion: "Tipo de cambio mayorista de referencia", unidad: "ARS/USD", id_bcra: 5 },
  { nombre: "reservas", descripcion: "Reservas internacionales del BCRA", unidad: "millones USD", id_bcra: 1 },
  { nombre: "badlar", descripcion: "Tasa BADLAR bancos privados (30-35 días)", unidad: "% anual", id_bcra: 7 },
  { nombre: "tm20", descripcion: "Tasa TM20 bancos privados (depósitos > 20M)", unidad: "% anual", id_bcra: 8 },
  { nombre: "inflacion_mensual", descripcion: "Variación mensual del IPC", unidad: "% mensual", id_bcra: 27 },
  { nombre: "inflacion_interanual", descripcion: "Variación interanual del IPC", unidad: "% anual", id_bcra: 28 },
  { nombre: "base_monetaria", descripcion: "Base monetaria", unidad: "millones ARS", id_bcra: 15 },
  { nombre: "circulacion_monetaria", descripcion: "Circulación monetaria", unidad: "millones ARS", id_bcra: 16 },
  { nombre: "icl", descripcion: "Índice para Contratos de Locación (alquileres)", unidad: "índice", id_bcra: 40 },
];

export function listBcraVariables(): { variables: VariableInfo[]; total: number; uso: string } {
  return {
    variables: BCRA_VARIABLES,
    total: BCRA_VARIABLES.length,
    uso: "Usá el campo 'nombre' como parámetro 'variable' en bcra_tipo_cambio",
  };
}

// --- INDEC Indicadores ---

const INDEC_INDICADORES: IndicadorInfo[] = [
  { nombre: "ipc", descripcion: "Índice de Precios al Consumidor (IPC) Nacional", serie_id: "148.3_INIVELNAL_DICI_M_26", frecuencia: "mensual" },
  { nombre: "emae", descripcion: "Estimador Mensual de Actividad Económica (EMAE)", serie_id: "143.3_NO_PR_2004_A_21", frecuencia: "mensual" },
  { nombre: "ipc_nucleo", descripcion: "IPC Núcleo Nacional (excluye estacionales y regulados)", serie_id: "148.3_INUCLEONAL_DICI_M_19", frecuencia: "mensual" },
  { nombre: "salarios", descripcion: "Índice de Salarios (RIPTE)", serie_id: "149.1_TL_INDIIOS_OCTU_0_21", frecuencia: "mensual" },
  { nombre: "construccion", descripcion: "Indicador Sintético de Actividad de la Construcción (ISAC)", serie_id: "33.2_ISAC_NIVELRAL_0_M_18_63", frecuencia: "mensual" },
  { nombre: "industria", descripcion: "Índice de Producción Industrial (IPI)", serie_id: "453.1_SERIE_ORIGNAL_0_0_14_46", frecuencia: "mensual" },
];

export function listIndecIndicadores(): { indicadores: IndicadorInfo[]; total: number; uso: string } {
  return {
    indicadores: INDEC_INDICADORES,
    total: INDEC_INDICADORES.length,
    uso: "Usá el campo 'nombre' como parámetro 'indicador' en indec_stats",
  };
}

// --- Dollar Types ---

const DOLAR_TIPOS: DolarTipoInfo[] = [
  { nombre: "oficial", descripcion: "Dólar oficial (Banco Nación)", tiene_historico: true, tiene_cotizacion_actual: true },
  { nombre: "blue", descripcion: "Dólar blue (mercado informal)", tiene_historico: true, tiene_cotizacion_actual: true },
  { nombre: "bolsa", descripcion: "Dólar bolsa (MEP vía bonos AL30)", tiene_historico: false, tiene_cotizacion_actual: true },
  { nombre: "mep", descripcion: "Dólar MEP (mercado electrónico de pagos)", tiene_historico: true, tiene_cotizacion_actual: false },
  { nombre: "contadoconliqui", descripcion: "Contado con liquidación (CCL)", tiene_historico: false, tiene_cotizacion_actual: true },
  { nombre: "ccl", descripcion: "Contado con liquidación (histórico)", tiene_historico: true, tiene_cotizacion_actual: false },
  { nombre: "mayorista", descripcion: "Dólar mayorista (operaciones interbancarias)", tiene_historico: true, tiene_cotizacion_actual: true },
  { nombre: "cripto", descripcion: "Dólar cripto (USDT/ARS)", tiene_historico: true, tiene_cotizacion_actual: true },
  { nombre: "tarjeta", descripcion: "Dólar tarjeta (oficial + impuestos)", tiene_historico: true, tiene_cotizacion_actual: true },
];

export function listDolarTipos(): { tipos: DolarTipoInfo[]; total: number; uso: string } {
  return {
    tipos: DOLAR_TIPOS,
    total: DOLAR_TIPOS.length,
    uso: "Usá el campo 'nombre' como parámetro 'tipo' en dolar_historico o para interpretar dolar_cotizaciones",
  };
}
