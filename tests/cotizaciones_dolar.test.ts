import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn().mockRejectedValue(new Error("no db in test")) },
}));

import { dolarCotizaciones } from "../src/tools/cotizaciones_dolar.js";

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

beforeEach(() => mockFetch.mockReset());

describe("dolar_cotizaciones", () => {
  it("obtiene todas las cotizaciones del dólar", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse([
        { moneda: "USD", casa: "oficial", nombre: "Oficial", compra: 1365.21, venta: 1415.79, fechaActualizacion: "2026-04-01T16:31:00.000Z", variacion: 0.45 },
        { moneda: "USD", casa: "blue", nombre: "Blue", compra: 1385, venta: 1405, fechaActualizacion: "2026-04-01T14:00:00.000Z", variacion: -0.35 },
      ])
    );

    const result = await dolarCotizaciones();
    expect(result.cotizaciones).toHaveLength(2);
    expect(result.cotizaciones[0].tipo).toBe("oficial");
    expect(result.cotizaciones[0].compra).toBe(1365.21);
    expect(result.cotizaciones[0].venta).toBe(1415.79);
    expect(result.cotizaciones[1].tipo).toBe("blue");
    expect(result.cotizaciones[0].spread_vs_oficial).toBe(0);
    expect(result.cotizaciones[1].spread_vs_oficial).toBeCloseTo(-0.76, 1);
    expect(result.fuente).toBe("Ámbito Financiero (via DolarAPI)");
    expect(result.freshness).toBe("current");

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("dolarapi.com");
  });

  it("maneja cotización sin compra (solo venta)", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse([
        { moneda: "USD", casa: "cripto", nombre: "Cripto", compra: null, venta: 1450, fechaActualizacion: "2026-04-01T14:00:00.000Z", variacion: 0 },
      ])
    );

    const result = await dolarCotizaciones();
    expect(result.cotizaciones[0].compra).toBeNull();
    expect(result.cotizaciones[0].venta).toBe(1450);
  });

  it("lanza error en respuesta HTTP errónea", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 500));
    await expect(dolarCotizaciones()).rejects.toThrow("HTTP 500");
  });
});
