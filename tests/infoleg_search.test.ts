import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pool with a factory that doesn't reference external vars
vi.mock("../src/db/pool.js", () => {
  const mockQuery = vi.fn();
  return { pool: { query: mockQuery }, __mockQuery: mockQuery };
});

import { infolegSearch } from "../src/tools/infoleg_search.js";

// Get access to the mock through the module
let mockQuery: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const mod = await vi.importMock<{ __mockQuery: ReturnType<typeof vi.fn> }>("../src/db/pool.js");
  mockQuery = mod.__mockQuery;
  mockQuery.mockReset();
});

describe("infoleg_search", () => {
  it("busca legislación por texto (PostgreSQL FTS)", async () => {
    // First call: FTS search
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id_norma: 123456,
          numero_norma: "27610",
          tipo_norma: "Ley",
          titulo_sumario: "Acceso a la interrupción voluntaria del embarazo",
          titulo_resumido: null,
          fecha_sancion: new Date("2021-01-14"),
          fts_rank: 0.5,
        },
      ],
      rowCount: 1,
    });
    // Second call: count check
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 50000 }] });

    const result = await infolegSearch({ query: "interrupción embarazo" });
    expect(result.resultados).toHaveLength(1);
    expect(result.resultados[0].tipo).toBe("Ley");
    expect(result.resultados[0].numero).toBe("27610");
    expect(result.resultados[0].url).toContain("123456");
    expect(result.fuente).toBe("InfoLeg - Ministerio de Justicia");
  });

  it("filtra por tipo de norma", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 50000 }] });

    const result = await infolegSearch({ query: "impuestos", tipo: "decreto" });
    expect(result.resultados).toEqual([]);

    const firstCall = mockQuery.mock.calls[0];
    expect(firstCall[1]).toContain("decreto");
  });

  it("lanza error con query vacío", async () => {
    await expect(infolegSearch({ query: "" })).rejects.toThrow("requerido");
  });

  it("retorna array vacío si no hay resultados", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 50000 }] });

    const result = await infolegSearch({ query: "zzzznoexiste" });
    expect(result.resultados).toEqual([]);
  });

  it("lanza error si tabla está vacía (datos no importados)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 0 }] });

    await expect(infolegSearch({ query: "test" })).rejects.toThrow("not yet imported");
  });
});
