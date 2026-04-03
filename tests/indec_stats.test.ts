import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn().mockRejectedValue(new Error("no db in test")) },
}));

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
  it("obtiene IPC con variación (array-of-arrays format)", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        data: [
          ["2025-02-01", 350.5],
          ["2025-01-01", 340.0],
        ],
        count: 2,
        meta: [
          { frequency: "month", start_date: "2025-02-01", end_date: "2025-01-01" },
          { field: { id: "148.3_INIVELNAL_DICI_M_26", time_index_end: "2025-02-01", is_updated: "True", last_value: "350.5" } },
        ],
      })
    );

    const result = await indecStats({ indicador: "ipc" });
    expect(result.indicador).toBe("ipc");
    expect(result.valor).toBe(350.5);
    expect(result.periodo).toBe("2025-02-01");
    expect(result.variacion).toBeDefined();
    expect(result.variacion).toBeCloseTo(3.09, 1);
    expect(result.fuente).toBe("api_directa");
    expect(result.is_updated).toBe(true);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("apis.datos.gob.ar");
    expect(calledUrl).toContain("metadata=full");
  });

  it("obtiene EMAE", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        data: [["2025-01-01", 155.3]],
        count: 1,
        meta: [
          { frequency: "month" },
          { field: { id: "143.3_NO_PR_2004_A_21", time_index_end: "2025-01-01", is_updated: "True" } },
        ],
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
    mockFetch.mockResolvedValueOnce(mockResponse({ data: [], count: 0, meta: [] }));
    await expect(indecStats({ indicador: "ipc" })).rejects.toThrow("No hay datos");
  });

  it("acepta indicador case-insensitive", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        data: [["2025-01-01", 100]],
        count: 1,
        meta: [
          { frequency: "month" },
          { field: { id: "test", time_index_end: "2025-01-01", is_updated: "True" } },
        ],
      })
    );
    const result = await indecStats({ indicador: "IPC" });
    expect(result.indicador).toBe("ipc");
  });
});
