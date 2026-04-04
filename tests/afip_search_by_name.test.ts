import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

import { afipSearchByName } from "../src/tools/afip_search_by_name.js";
import { pool } from "../src/db/pool.js";

const mockQuery = vi.mocked(pool.query);

beforeEach(() => mockQuery.mockReset());

const SAMPLE_ROWS = [
  {
    cuit: "20123456789", denominacion: "PEREZ JUAN CARLOS", tipo_persona: "FISICA",
    estado: "ACTIVO", imp_ganancias: "AC", imp_iva: "AC", monotributo: "NI",
    empleador: false, integrante_sociedad: false, sim: 0.45,
  },
  {
    cuit: "30712345678", denominacion: "PEREZ Y ASOCIADOS SA", tipo_persona: "JURIDICA",
    estado: "ACTIVO", imp_ganancias: "AC", imp_iva: "AC", monotributo: "NI",
    empleador: true, integrante_sociedad: false, sim: 0.30,
  },
];

describe("afip_search_by_name", () => {
  it("busca por nombre y devuelve resultados", async () => {
    mockQuery.mockResolvedValueOnce({ rows: SAMPLE_ROWS } as never);

    const result = await afipSearchByName({ nombre: "perez" });
    expect(result.total).toBe(2);
    expect(result.resultados[0].cuit).toBe("20123456789");
    expect(result.resultados[0].denominacion).toBe("PEREZ JUAN CARLOS");
    expect(result.resultados[0].imp_ganancias).toBe("Activo");
    expect(result.resultados[0].imp_iva).toBe("Responsable Inscripto");
    expect(result.resultados[1].tipo_persona).toBe("JURIDICA");
    expect(result.resultados[1].empleador).toBe(true);
    expect(result.query).toBe("perez");
    expect(result.fuente).toBe("padron_afip_zip");
  });

  it("respeta el límite de resultados (max 50)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await afipSearchByName({ nombre: "perez", limit: 100 });
    const args = mockQuery.mock.calls[0][1];
    expect(args[2]).toBe(50);
  });

  it("usa default limit 10", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await afipSearchByName({ nombre: "garcia" });
    const args = mockQuery.mock.calls[0][1];
    expect(args[2]).toBe(10);
  });

  it("lanza error con nombre muy corto", async () => {
    await expect(afipSearchByName({ nombre: "ab" })).rejects.toThrow("al menos 3 caracteres");
  });

  it("lanza error con nombre vacío", async () => {
    await expect(afipSearchByName({ nombre: "  " })).rejects.toThrow("al menos 3 caracteres");
  });

  it("convierte labels de monotributo correctamente", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        cuit: "20999888777", denominacion: "GOMEZ MARIA", tipo_persona: "FISICA",
        estado: "ACTIVO", imp_ganancias: "NI", imp_iva: "NI", monotributo: "B",
        empleador: false, integrante_sociedad: false, sim: 0.5,
      }],
    } as never);

    const result = await afipSearchByName({ nombre: "gomez" });
    expect(result.resultados[0].monotributo).toBe("Categoría B");
    expect(result.resultados[0].imp_ganancias).toBe("No Inscripto");
  });

  it("devuelve lista vacía cuando no hay matches", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const result = await afipSearchByName({ nombre: "xyznonexistent" });
    expect(result.total).toBe(0);
    expect(result.resultados).toEqual([]);
  });
});
