import { describe, it, expect, vi, beforeEach } from "vitest";
import { indecStats } from "../src/tools/indec_stats.js";

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

describe("indec_stats", () => {
  it("obtiene IPC con variación", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        data: [
          { fecha: "2025-02-01", valor: 350.5 },
          { fecha: "2025-01-01", valor: 340.0 },
        ],
      })
    );

    const result = await indecStats({ indicador: "ipc" });
    expect(result.indicador).toBe("ipc");
    expect(result.valor).toBe(350.5);
    expect(result.periodo).toBe("2025-02-01");
    expect(result.variacion).toBeDefined();
    expect(result.variacion).toBeCloseTo(3.09, 1);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("apis.datos.gob.ar");
  });

  it("obtiene EMAE", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        data: [{ fecha: "2025-01-01", valor: 155.3 }],
      })
    );

    const result = await indecStats({ indicador: "emae" });
    expect(result.indicador).toBe("emae");
    expect(result.valor).toBe(155.3);
    expect(result.variacion).toBeUndefined();
  });

  it("lanza error con indicador desconocido", async () => {
    await expect(indecStats({ indicador: "pbi_mensual" })).rejects.toThrow("no reconocido");
  });

  it("lanza error si no hay datos", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: [] }));
    await expect(indecStats({ indicador: "ipc" })).rejects.toThrow("No hay datos");
  });

  it("acepta indicador case-insensitive", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ data: [{ fecha: "2025-01-01", valor: 100 }] })
    );
    const result = await indecStats({ indicador: "IPC" });
    expect(result.indicador).toBe("ipc");
  });
});
