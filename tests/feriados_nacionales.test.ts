import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { feriadosNacionales } from "../src/tools/feriados_nacionales.js";

function mockResponse(data: unknown) {
  return { ok: true, json: async () => data, status: 200 } as Response;
}

const SAMPLE_FERIADOS = [
  { fecha: "2026-01-01", tipo: "inamovible", nombre: "Año nuevo" },
  { fecha: "2026-02-16", tipo: "inamovible", nombre: "Carnaval" },
  { fecha: "2026-02-17", tipo: "inamovible", nombre: "Carnaval" },
  { fecha: "2026-03-24", tipo: "inamovible", nombre: "Día Nacional de la Memoria" },
  { fecha: "2026-04-02", tipo: "inamovible", nombre: "Día del Veterano y de los Caídos en Malvinas" },
  { fecha: "2026-04-03", tipo: "inamovible", nombre: "Viernes Santo" },
  { fecha: "2026-05-01", tipo: "inamovible", nombre: "Día del Trabajador" },
  { fecha: "2026-05-25", tipo: "inamovible", nombre: "Día de la Revolución de Mayo" },
  { fecha: "2026-07-09", tipo: "inamovible", nombre: "Día de la Independencia" },
  { fecha: "2026-07-10", tipo: "puente", nombre: "Puente turístico" },
];

beforeEach(() => {
  mockFetch.mockReset();
});

describe("feriados_nacionales", () => {
  it("devuelve feriados del año completo", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(SAMPLE_FERIADOS));

    const result = await feriadosNacionales({ anio: 2026 });
    expect(result.anio).toBe(2026);
    expect(result.mes).toBeNull();
    expect(result.feriados).toHaveLength(10);
    expect(result.total).toBe(10);
    expect(result.dias_habiles).toBeNull();
    expect(result.fuente).toBe("Argentina Datos");
    expect(result.fuente_url).toBe("https://api.argentinadatos.com");
  });

  it("filtra por mes y calcula días hábiles", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(SAMPLE_FERIADOS));

    const result = await feriadosNacionales({ anio: 2026, mes: 4 });
    expect(result.mes).toBe(4);
    expect(result.feriados).toHaveLength(2);
    expect(result.feriados[0].nombre).toContain("Veterano");
    expect(result.feriados[1].nombre).toContain("Viernes Santo");
    expect(result.dias_habiles).toBeDefined();
    expect(result.dias_habiles).toBeGreaterThan(0);
    // April 2026: 30 days, 8 weekend days (4 Sat + 4 Sun), 2 feriados on weekdays = 20 business days
    expect(result.dias_habiles).toBe(20);
  });

  it("usa año actual por defecto", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([]));

    const result = await feriadosNacionales({});
    expect(result.anio).toBe(new Date().getFullYear());
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain(String(new Date().getFullYear()));
  });

  it("lanza error con año fuera de rango", async () => {
    await expect(feriadosNacionales({ anio: 1999 })).rejects.toThrow("fuera de rango");
  });

  it("lanza error con mes inválido", async () => {
    await expect(feriadosNacionales({ anio: 2026, mes: 13 })).rejects.toThrow("no válido");
  });

  it("devuelve lista vacía para mes sin feriados", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(SAMPLE_FERIADOS));

    const result = await feriadosNacionales({ anio: 2026, mes: 6 });
    expect(result.feriados).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.dias_habiles).toBeDefined();
  });
});
