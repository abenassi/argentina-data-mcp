import { fetchJSON } from "../utils/http.js";

// Feriados nacionales argentinos — via api.argentinadatos.com

interface FeriadoApi {
  fecha: string;
  tipo: string;
  nombre: string;
}

export interface FeriadosInput {
  anio?: number;
  mes?: number;
}

export interface FeriadosResult {
  anio: number;
  mes: number | null;
  feriados: {
    fecha: string;
    nombre: string;
    tipo: string;
  }[];
  total: number;
  dias_habiles: number | null;
  fuente: string;
  fuente_url: string;
}

export async function feriadosNacionales(input: FeriadosInput): Promise<FeriadosResult> {
  const anio = input.anio || new Date().getFullYear();
  const mes = input.mes || null;

  if (anio < 2000 || anio > 2100) {
    throw new Error(`Año ${anio} fuera de rango. Rango válido: 2000-2100`);
  }
  if (mes !== null && (mes < 1 || mes > 12)) {
    throw new Error(`Mes ${mes} no válido. Rango: 1-12`);
  }

  const data = await fetchJSON<FeriadoApi[]>(`https://api.argentinadatos.com/v1/feriados/${anio}`);

  let feriados = data.map((f) => ({
    fecha: f.fecha,
    nombre: f.nombre,
    tipo: f.tipo,
  }));

  if (mes) {
    const mesStr = String(mes).padStart(2, "0");
    feriados = feriados.filter((f) => f.fecha.substring(5, 7) === mesStr);
  }

  // Calculate business days if a specific month is requested
  let diasHabiles: number | null = null;
  if (mes) {
    const feriadoSet = new Set(feriados.map((f) => f.fecha));
    const daysInMonth = new Date(anio, mes, 0).getDate();
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(anio, mes - 1, d);
      const dow = date.getDay();
      const dateStr = `${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (dow !== 0 && dow !== 6 && !feriadoSet.has(dateStr)) {
        count++;
      }
    }
    diasHabiles = count;
  }

  return {
    anio,
    mes,
    feriados,
    total: feriados.length,
    dias_habiles: diasHabiles,
    fuente: "Argentina Datos",
    fuente_url: "https://api.argentinadatos.com",
  };
}
