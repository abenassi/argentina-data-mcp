import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

vi.stubGlobal("fetch", vi.fn());

import { analisisEconomico } from "../src/tools/analisis_economico.js";
import { pool } from "../src/db/pool.js";

const mockQuery = pool.query as ReturnType<typeof vi.fn>;
const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockQuery.mockReset();
  mockFetch.mockReset();
});

function makeDbRows(serieId: string, values: [string, number][]) {
  return {
    rows: values.map(([fecha, valor]) => ({
      fecha: new Date(fecha),
      valor,
    })),
  };
}

function makeDolarDbRows(values: [string, number][]) {
  return {
    rows: values.map(([fecha, venta]) => ({
      fecha: new Date(fecha),
      venta,
    })),
  };
}

describe("analisis_economico — poder_adquisitivo", () => {
  it("calcula poder adquisitivo combinando IPC y salarios", async () => {
    // IPC series (DESC order — newest first, as DB returns)
    mockQuery.mockResolvedValueOnce(makeDbRows("ipc", [
      ["2025-12-01", 1080],
      ["2025-11-01", 1040],
      ["2025-10-01", 1000],
      ["2025-09-01", 964],
      ["2025-08-01", 936],
      ["2025-07-01", 900],
    ]));
    // Salarios series (DESC order, lagging behind IPC)
    mockQuery.mockResolvedValueOnce(makeDbRows("salarios", [
      ["2025-12-01", 960],
      ["2025-11-01", 920],
      ["2025-10-01", 880],
      ["2025-09-01", 848],
      ["2025-08-01", 824],
      ["2025-07-01", 800],
    ]));

    const result = await analisisEconomico({ analisis: "poder_adquisitivo", meses: 6 });
    expect(result.analisis).toBe("poder_adquisitivo");
    expect(result.fuentes).toHaveLength(2);
    expect(result.confianza).toBe("alta");
    expect(result.conclusion).toBeTruthy();
    const resumen = (result.datos as any).resumen;
    expect(resumen.meses_analizados).toBe(6);
    expect(resumen.variacion_ipc_pct).toBeGreaterThan(0);
    expect(resumen.variacion_salario_nominal_pct).toBeGreaterThan(0);
    expect(typeof resumen.variacion_salario_real_pct).toBe("number");
  });

  it("detecta pérdida de poder adquisitivo", async () => {
    // IPC sube 20%, salarios solo 10% (DESC order)
    mockQuery.mockResolvedValueOnce(makeDbRows("ipc", [
      ["2025-12-01", 1200], ["2025-07-01", 1000],
    ]));
    mockQuery.mockResolvedValueOnce(makeDbRows("salarios", [
      ["2025-12-01", 1100], ["2025-07-01", 1000],
    ]));

    const result = await analisisEconomico({ analisis: "poder_adquisitivo", meses: 6 });
    const resumen = (result.datos as any).resumen;
    expect(resumen.variacion_salario_real_pct).toBeLessThan(0);
    expect(result.conclusion).toContain("perdieron");
  });
});

describe("analisis_economico — brecha_cambiaria", () => {
  it("calcula brecha blue/oficial/MEP", async () => {
    mockQuery.mockResolvedValueOnce(makeDolarDbRows([
      ["2025-10-01", 1000], ["2025-11-01", 1050], ["2025-12-01", 1100],
      ["2026-01-01", 1150], ["2026-02-01", 1200], ["2026-03-01", 1250],
    ]));
    mockQuery.mockResolvedValueOnce(makeDolarDbRows([
      ["2025-10-01", 1200], ["2025-11-01", 1260], ["2025-12-01", 1320],
      ["2026-01-01", 1350], ["2026-02-01", 1400], ["2026-03-01", 1450],
    ]));
    mockQuery.mockResolvedValueOnce(makeDolarDbRows([
      ["2025-10-01", 1150], ["2025-11-01", 1200], ["2025-12-01", 1260],
      ["2026-01-01", 1300], ["2026-02-01", 1350], ["2026-03-01", 1400],
    ]));

    const result = await analisisEconomico({ analisis: "brecha_cambiaria", meses: 6 });
    expect(result.analisis).toBe("brecha_cambiaria");
    expect(result.fuentes.length).toBeGreaterThanOrEqual(2);
    const resumen = (result.datos as any).resumen;
    expect(resumen.brecha_actual_blue_pct).toBeGreaterThan(0);
    expect(resumen.dias_analizados).toBe(6);
    expect(result.conclusion).toBeTruthy();
  });
});

describe("analisis_economico — validation", () => {
  it("lanza error con análisis no reconocido", async () => {
    await expect(analisisEconomico({ analisis: "inexistente" }))
      .rejects.toThrow("Análisis no reconocido");
  });

  it("lanza error con meses fuera de rango", async () => {
    await expect(analisisEconomico({ analisis: "poder_adquisitivo", meses: 30 }))
      .rejects.toThrow("rango de meses");
  });
});
