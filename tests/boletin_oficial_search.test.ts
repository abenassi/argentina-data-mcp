import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

// Mock the searchBoletin function from the collector
vi.mock("../src/collectors/collect_boletin.js", () => ({
  searchBoletin: vi.fn(),
}));

import { boletinOficialSearch } from "../src/tools/boletin_oficial_search.js";
import { pool } from "../src/db/pool.js";
import { searchBoletin } from "../src/collectors/collect_boletin.js";

const mockQuery = vi.mocked(pool.query);
const mockSearchBoletin = vi.mocked(searchBoletin);

beforeEach(() => {
  mockQuery.mockReset();
  mockSearchBoletin.mockReset();
});

describe("boletin_oficial_search", () => {
  it("busca publicaciones por texto usando FTS en PostgreSQL", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id_aviso: "340282",
          organismo: "DIRECCIÓN NACIONAL DE CALIDAD",
          tipo_norma: "Disposición 51/2026",
          seccion: "primera",
          fecha: new Date("2026-04-01"),
          url: "https://www.boletinoficial.gob.ar/detalleAviso/primera/340282/20260401",
          fts_rank: 0.5,
        },
      ],
    } as any);

    const result = await boletinOficialSearch({ query: "disposición calidad" });
    expect(result.resultados).toHaveLength(1);
    expect(result.resultados[0].organismo).toContain("CALIDAD");
    expect(result.resultados[0].tipo_norma).toBe("Disposición 51/2026");
    expect(result.resultados[0].seccion).toBe("primera");
    expect(result.fuente).toBe("Boletín Oficial de la República Argentina");
  });

  it("filtra por sección", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    mockSearchBoletin.mockResolvedValueOnce([]);

    await boletinOficialSearch({ query: "decreto", seccion: "primera" });
    const sqlQuery = mockQuery.mock.calls[0][0] as string;
    expect(sqlQuery).toContain("seccion = $2");
  });

  it("cae a API cuando no hay datos en DB", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    mockSearchBoletin.mockResolvedValueOnce([
      {
        id_aviso: "340297",
        seccion: "primera",
        fecha: "20260401",
        organismo: "BANCO CENTRAL",
        tipo_norma: "Aviso Oficial",
        url: "https://www.boletinoficial.gob.ar/detalleAviso/primera/340297/20260401",
      },
    ]);

    const result = await boletinOficialSearch({ query: "banco central" });
    expect(result.fuente).toBe("Boletín Oficial de la República Argentina");
    expect(result.resultados).toHaveLength(1);
    expect(result.resultados[0].organismo).toBe("BANCO CENTRAL");
  });

  it("lanza error con query vacío", async () => {
    await expect(boletinOficialSearch({ query: "" })).rejects.toThrow("requerido");
  });

  it("lanza error con sección inválida", async () => {
    await expect(
      boletinOficialSearch({ query: "test", seccion: "cuarta" })
    ).rejects.toThrow("no válida");
  });

  it("retorna resultados vacíos si no hay datos en DB ni API", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    mockSearchBoletin.mockRejectedValueOnce(new Error("API down"));

    const result = await boletinOficialSearch({ query: "zzznoexiste" });
    expect(result.resultados).toEqual([]);
    expect(result.fuente).toBe("Boletín Oficial de la República Argentina");
  });
});
