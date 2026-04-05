import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db pool before importing the tool
vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn().mockRejectedValue(new Error("no db in test")) },
}));

import { bcraTipoCambio } from "../src/tools/bcra_tipo_cambio.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(data),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("bcra_tipo_cambio", () => {
  it("obtiene dólar oficial de los últimos 7 días (BCRA v4)", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        results: [{ idVariable: 4, detalle: [
          { fecha: "2025-03-28", valor: 1075.5 },
          { fecha: "2025-03-27", valor: 1074.0 },
        ]}],
      })
    );

    const result = await bcraTipoCambio({});
    expect(result.datos).toHaveLength(2);
    expect(result.datos[0]).toMatchObject({ fecha: "2025-03-28", valor: 1075.5, variable: "dolar_oficial" });
    expect(result.fuente).toBe("BCRA - Principales variables");

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("api.bcra.gob.ar");
    expect(calledUrl).toContain("v4.0/Monetarias/4");
  });

  it("obtiene dólar mayorista", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        results: [{ idVariable: 5, detalle: [{ fecha: "2025-03-28", valor: 1055.0 }] }],
      })
    );

    const result = await bcraTipoCambio({ variable: "dolar_mayorista" });
    expect(result.datos).toHaveLength(1);
    expect(result.datos[0].variable).toBe("dolar_mayorista");
    expect(result.datos[0].valor).toBe(1055.0);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/Monetarias/5");
  });

  it("consulta con rango de fechas específico", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        results: [{ idVariable: 4, detalle: [
          { fecha: "2025-01-02", valor: 1050.0 },
          { fecha: "2025-01-03", valor: 1051.0 },
        ]}],
      })
    );

    const result = await bcraTipoCambio({
      variable: "dolar_oficial",
      fecha_desde: "2025-01-02",
      fecha_hasta: "2025-01-10",
    });
    expect(result.datos).toHaveLength(2);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("desde=2025-01-02");
    expect(calledUrl).toContain("hasta=2025-01-10");
  });

  it("retorna resultado vacío con variable desconocida", async () => {
    const result = await bcraTipoCambio({ variable: "bitcoin" });
    expect(result.datos).toEqual([]);
    expect(result.freshness).toBe("unknown");
  });

  it("retorna datos vacíos si no hay resultados", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 200, results: [] })
    );

    const result = await bcraTipoCambio({});
    expect(result.datos).toEqual([]);
  });

  it("lanza error en respuesta HTTP no exitosa", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 500));
    await expect(bcraTipoCambio({})).rejects.toThrow("HTTP 500");
  });

  it("soporta todas las variables conocidas", async () => {
    const variables = [
      "dolar_oficial", "dolar_mayorista", "reservas",
      "badlar", "tm20", "inflacion_mensual", "inflacion_interanual",
      "base_monetaria", "circulacion_monetaria", "icl",
    ];

    for (const variable of variables) {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 200,
          results: [{ idVariable: 1, detalle: [{ fecha: "2025-03-28", valor: 100 }] }],
        })
      );
      const result = await bcraTipoCambio({ variable });
      expect(result.datos[0].variable).toBe(variable);
    }
  });
});
