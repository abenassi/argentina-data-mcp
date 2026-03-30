import { describe, it, expect, vi, beforeEach } from "vitest";
import { bcraTipoCambio } from "../src/tools/bcra_tipo_cambio.js";

// Mock global fetch
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
  it("obtiene dólar oficial de los últimos 7 días", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [
          { fecha: "2025-03-28", valor: 1075.5 },
          { fecha: "2025-03-27", valor: 1074.0 },
        ],
      })
    );

    const results = await bcraTipoCambio({});
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      fecha: "2025-03-28",
      valor: 1075.5,
      variable: "dolar_oficial",
    });
    expect(results[1].variable).toBe("dolar_oficial");

    // Verify correct URL was called
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("api.bcra.gob.ar");
    expect(calledUrl).toContain("/Monetarias/4");
  });

  it("obtiene dólar mayorista", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [{ fecha: "2025-03-28", valor: 1055.0 }],
      })
    );

    const results = await bcraTipoCambio({ variable: "dolar_mayorista" });
    expect(results).toHaveLength(1);
    expect(results[0].variable).toBe("dolar_mayorista");
    expect(results[0].valor).toBe(1055.0);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/Monetarias/5");
  });

  it("consulta con rango de fechas específico", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [
          { fecha: "2025-01-02", valor: 1050.0 },
          { fecha: "2025-01-03", valor: 1051.0 },
        ],
      })
    );

    const results = await bcraTipoCambio({
      variable: "dolar_oficial",
      fecha_desde: "2025-01-02",
      fecha_hasta: "2025-01-10",
    });
    expect(results).toHaveLength(2);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("desde=2025-01-02");
    expect(calledUrl).toContain("hasta=2025-01-10");
  });

  it("lanza error con variable desconocida", async () => {
    await expect(
      bcraTipoCambio({ variable: "bitcoin" })
    ).rejects.toThrow("no reconocida");
  });

  it("retorna array vacío si no hay resultados", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ results: [] })
    );

    const results = await bcraTipoCambio({});
    expect(results).toEqual([]);
  });

  it("lanza error en respuesta HTTP no exitosa", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({}, 500)
    );

    await expect(bcraTipoCambio({})).rejects.toThrow("HTTP 500");
  });

  it("soporta todas las variables conocidas", async () => {
    const variables = [
      "dolar_oficial", "dolar_mayorista", "reservas",
      "tasa_politica", "badlar", "inflacion_mensual", "base_monetaria",
    ];

    for (const variable of variables) {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ results: [{ fecha: "2025-03-28", valor: 100 }] })
      );
      const results = await bcraTipoCambio({ variable });
      expect(results[0].variable).toBe(variable);
    }
  });
});
