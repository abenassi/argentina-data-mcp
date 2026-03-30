import { describe, it, expect, vi, beforeEach } from "vitest";
import { infolegSearch } from "../src/tools/infoleg_search.js";

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

describe("infoleg_search", () => {
  it("busca legislación por texto", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [
          {
            idNorma: 123456,
            tipo: "Ley",
            numero: "27610",
            fecha: "2021-01-14",
            tituloSumario: "Acceso a la interrupción voluntaria del embarazo",
          },
        ],
      })
    );

    const results = await infolegSearch({ query: "interrupción embarazo" });
    expect(results).toHaveLength(1);
    expect(results[0].tipo).toBe("Ley");
    expect(results[0].numero).toBe("27610");
    expect(results[0].url).toContain("123456");
  });

  it("filtra por tipo de norma", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ results: [] }));

    await infolegSearch({ query: "impuestos", tipo: "decreto" });
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("tipo=decreto");
  });

  it("lanza error con query vacío", async () => {
    await expect(infolegSearch({ query: "" })).rejects.toThrow("requerido");
  });

  it("retorna array vacío si no hay resultados", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ results: [] }));
    const results = await infolegSearch({ query: "zzzznoexiste" });
    expect(results).toEqual([]);
  });

  it("maneja respuestas HTTP erróneas", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 503));
    await expect(infolegSearch({ query: "test" })).rejects.toThrow("HTTP 503");
  });
});
