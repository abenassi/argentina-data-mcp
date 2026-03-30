import { describe, it, expect, vi, beforeEach } from "vitest";
import { boletinOficialSearch } from "../src/tools/boletin_oficial_search.js";

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

describe("boletin_oficial_search", () => {
  it("busca publicaciones por texto", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        dataList: [
          {
            id: "abc123",
            denominacion: "Decreto 100/2025 - Regulación de importaciones",
            nombreSeccion: "Primera Sección",
            fechaPublicacion: "2025-03-28",
          },
        ],
      })
    );

    const results = await boletinOficialSearch({ query: "importaciones" });
    expect(results).toHaveLength(1);
    expect(results[0].titulo).toContain("importaciones");
    expect(results[0].seccion).toBe("Primera Sección");
    expect(results[0].url).toContain("abc123");
  });

  it("filtra por sección", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ dataList: [] }));

    await boletinOficialSearch({ query: "licitación", seccion: "tercera" });
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("seccion=tercera");
  });

  it("lanza error con query vacío", async () => {
    await expect(boletinOficialSearch({ query: "" })).rejects.toThrow("requerido");
  });

  it("lanza error con sección inválida", async () => {
    await expect(
      boletinOficialSearch({ query: "test", seccion: "cuarta" })
    ).rejects.toThrow("no válida");
  });

  it("retorna array vacío si no hay resultados", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ dataList: [] }));
    const results = await boletinOficialSearch({ query: "zzzznoexiste" });
    expect(results).toEqual([]);
  });
});
