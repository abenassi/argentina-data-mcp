// Legislación tributaria pre-computada — datos estructurados de impuestos argentinos
// Fuentes: ARCA (ex-AFIP), Ley 27.743 (Ganancias), RG 4003 (retenciones)
// Vigencia: primer semestre 2026 (enero-junio), actualizado por IPC 14.29%

export interface MonotributoCategoria {
  categoria: string;
  ingresos_brutos_anuales_max: number;
  impuesto_integrado_servicios: number;
  impuesto_integrado_bienes: number;
  aporte_sipa: number;
  aporte_obra_social: number;
  cuota_total_servicios: number;
  cuota_total_bienes: number;
}

export interface GananciasDeducciones {
  ganancia_no_imponible: number;
  deduccion_especial_empleados: number;
  deduccion_especial_autonomos: number;
  deduccion_especial_nuevos_profesionales: number;
  conyuge: number;
  hijo: number;
  hijo_incapacitado: number;
}

export interface GananciasTramo {
  desde: number;
  hasta: number | null;
  monto_fijo: number;
  alicuota_porcentaje: number;
}

export interface IvaAlicuota {
  tipo: string;
  porcentaje: number;
  descripcion: string;
}

// --- Monotributo: vigencia 1/02/2026 ---

const MONOTRIBUTO_CATEGORIAS: MonotributoCategoria[] = [
  { categoria: "A", ingresos_brutos_anuales_max: 10277988.13, impuesto_integrado_servicios: 4780.46, impuesto_integrado_bienes: 4780.46, aporte_sipa: 15616.17, aporte_obra_social: 21990.11, cuota_total_servicios: 42386.74, cuota_total_bienes: 42386.74 },
  { categoria: "B", ingresos_brutos_anuales_max: 15058447.71, impuesto_integrado_servicios: 9082.88, impuesto_integrado_bienes: 9082.88, aporte_sipa: 17177.79, aporte_obra_social: 21990.11, cuota_total_servicios: 48250.78, cuota_total_bienes: 48250.78 },
  { categoria: "C", ingresos_brutos_anuales_max: 21113696.52, impuesto_integrado_servicios: 15616.17, impuesto_integrado_bienes: 14341.38, aporte_sipa: 18895.57, aporte_obra_social: 21990.11, cuota_total_servicios: 56501.85, cuota_total_bienes: 55227.06 },
  { categoria: "D", ingresos_brutos_anuales_max: 26212853.42, impuesto_integrado_servicios: 25495.79, impuesto_integrado_bienes: 23742.95, aporte_sipa: 20785.13, aporte_obra_social: 26133.18, cuota_total_servicios: 72414.10, cuota_total_bienes: 70661.26 },
  { categoria: "E", ingresos_brutos_anuales_max: 30833964.37, impuesto_integrado_servicios: 47804.60, impuesto_integrado_bienes: 37924.98, aporte_sipa: 22863.64, aporte_obra_social: 31869.73, cuota_total_servicios: 102537.97, cuota_total_bienes: 92658.35 },
  { categoria: "F", ingresos_brutos_anuales_max: 38642048.36, impuesto_integrado_servicios: 67245.13, impuesto_integrado_bienes: 49398.08, aporte_sipa: 25150.00, aporte_obra_social: 36650.19, cuota_total_servicios: 129045.32, cuota_total_bienes: 111198.27 },
  { categoria: "G", ingresos_brutos_anuales_max: 46211109.37, impuesto_integrado_servicios: 122379.76, impuesto_integrado_bienes: 61189.87, aporte_sipa: 35210.00, aporte_obra_social: 39518.47, cuota_total_servicios: 197108.23, cuota_total_bienes: 135918.34 },
  { categoria: "H", ingresos_brutos_anuales_max: 70113407.33, impuesto_integrado_servicios: 350567.04, impuesto_integrado_bienes: 175283.51, aporte_sipa: 49294.00, aporte_obra_social: 47485.89, cuota_total_servicios: 447346.93, cuota_total_bienes: 272063.40 },
  { categoria: "I", ingresos_brutos_anuales_max: 78479211.62, impuesto_integrado_servicios: 697150.35, impuesto_integrado_bienes: 278860.14, aporte_sipa: 69011.60, aporte_obra_social: 58640.31, cuota_total_servicios: 824802.26, cuota_total_bienes: 406512.05 },
  { categoria: "J", ingresos_brutos_anuales_max: 89872640.30, impuesto_integrado_servicios: 836580.42, impuesto_integrado_bienes: 334632.18, aporte_sipa: 96616.24, aporte_obra_social: 65810.99, cuota_total_servicios: 999007.65, cuota_total_bienes: 497059.41 },
  { categoria: "K", ingresos_brutos_anuales_max: 108357084.05, impuesto_integrado_servicios: 1171212.59, impuesto_integrado_bienes: 390404.20, aporte_sipa: 135262.74, aporte_obra_social: 75212.57, cuota_total_servicios: 1381687.90, cuota_total_bienes: 600879.51 },
];

// --- Ganancias 4ta categoría: enero-junio 2026 ---

const GANANCIAS_DEDUCCIONES: GananciasDeducciones = {
  ganancia_no_imponible: 5151802.50,
  deduccion_especial_empleados: 24728652.02,
  deduccion_especial_autonomos: 18031308.76,
  deduccion_especial_nuevos_profesionales: 20607210.01,
  conyuge: 4851964.66,
  hijo: 2446863.48,
  hijo_incapacitado: 4893726.96,
};

const GANANCIAS_ESCALA: GananciasTramo[] = [
  { desde: 0, hasta: 2000030.09, monto_fijo: 0, alicuota_porcentaje: 5 },
  { desde: 2000030.09, hasta: 4000060.17, monto_fijo: 100001.50, alicuota_porcentaje: 9 },
  { desde: 4000060.17, hasta: 6000090.26, monto_fijo: 280004.21, alicuota_porcentaje: 12 },
  { desde: 6000090.26, hasta: 9000135.40, monto_fijo: 520007.82, alicuota_porcentaje: 15 },
  { desde: 9000135.40, hasta: 18000270.80, monto_fijo: 970014.59, alicuota_porcentaje: 19 },
  { desde: 18000270.80, hasta: 27000406.20, monto_fijo: 2680040.32, alicuota_porcentaje: 23 },
  { desde: 27000406.20, hasta: 40500609.30, monto_fijo: 4750071.46, alicuota_porcentaje: 27 },
  { desde: 40500609.30, hasta: 60750913.96, monto_fijo: 8395126.30, alicuota_porcentaje: 31 },
  { desde: 60750913.96, hasta: null, monto_fijo: 14672720.74, alicuota_porcentaje: 35 },
];

// --- IVA ---

const IVA_ALICUOTAS: IvaAlicuota[] = [
  { tipo: "general", porcentaje: 21, descripcion: "Alícuota general — aplica a la mayoría de bienes y servicios" },
  { tipo: "reducida", porcentaje: 10.5, descripcion: "Alícuota reducida — alimentos básicos, transporte, vivienda, medicina prepaga, etc." },
  { tipo: "incrementada", porcentaje: 27, descripcion: "Alícuota incrementada — telecomunicaciones, gas, electricidad y agua para uso comercial/industrial" },
  { tipo: "exento", porcentaje: 0, descripcion: "Exento — libros, educación, salud (hospitales públicos), exportaciones, alquiler de vivienda" },
];

// --- Public API ---

export type LegislacionImpuesto = "monotributo" | "ganancias" | "iva";

export interface LegislacionTributariaResult {
  impuesto: string;
  vigencia: string;
  norma_fuente: string;
  actualizado_al: string;
  datos: MonotributoData | GananciasData | IvaData;
}

interface MonotributoData {
  categorias: MonotributoCategoria[];
  total_categorias: number;
  nota: string;
}

interface GananciasData {
  deducciones_anuales: GananciasDeducciones;
  escala_alicuotas: GananciasTramo[];
  nota: string;
}

interface IvaData {
  alicuotas: IvaAlicuota[];
  nota: string;
}

export function legislacionTributaria(input: { impuesto?: string }): LegislacionTributariaResult {
  const impuesto = (input.impuesto || "monotributo").toLowerCase() as LegislacionImpuesto;

  switch (impuesto) {
    case "monotributo":
      return {
        impuesto: "monotributo",
        vigencia: "2026-02-01 a 2026-07-31",
        norma_fuente: "ARCA — Régimen Simplificado para Pequeños Contribuyentes (Ley 24.977)",
        actualizado_al: "2026-02-01",
        datos: {
          categorias: MONOTRIBUTO_CATEGORIAS,
          total_categorias: MONOTRIBUTO_CATEGORIAS.length,
          nota: "Cuotas mensuales. Categorías A-K. Servicios y venta de bienes tienen distinto impuesto integrado a partir de categoría C.",
        },
      };

    case "ganancias":
      return {
        impuesto: "ganancias",
        vigencia: "2026-01-01 a 2026-06-30",
        norma_fuente: "ARCA — Ley 27.743, Art. 71 Ley 27.743, RG 4003 (Deducciones Art. 30)",
        actualizado_al: "2026-01-01",
        datos: {
          deducciones_anuales: GANANCIAS_DEDUCCIONES,
          escala_alicuotas: GANANCIAS_ESCALA,
          nota: "Valores anuales actualizados por IPC acumulado 2do semestre 2025 (14,29%). Escala progresiva de 9 tramos (5% a 35%). Deducciones: empleados en relación de dependencia usan Apartado 2, autónomos usan Apartado 1.",
        },
      };

    case "iva":
      return {
        impuesto: "iva",
        vigencia: "permanente",
        norma_fuente: "Ley de IVA (Ley 23.349, texto ordenado 1997)",
        actualizado_al: "2026-01-01",
        datos: {
          alicuotas: IVA_ALICUOTAS,
          nota: "Las alícuotas de IVA no se actualizan por inflación. La alícuota general es 21%. Reducida 10,5% para alimentos básicos y otros. Incrementada 27% para servicios a comercios.",
        },
      };

    default:
      throw new Error(`Impuesto no reconocido: '${impuesto}'. Opciones: monotributo, ganancias, iva`);
  }
}
