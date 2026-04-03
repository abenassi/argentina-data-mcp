import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn().mockRejectedValue(new Error("no db in test")) },
}));

import { afipCuitLookup } from "../src/tools/afip_cuit_lookup.js";

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

describe("afip_cuit_lookup", () => {
  it("consulta datos de un CUIT válido (persona jurídica)", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        persona: {
          tipoClave: "CUIT",
          idPersona: 30500010912,
          razonSocial: "EMPRESA TEST S.A.",
          tipoPersona: "JURIDICA",
          estadoClave: "ACTIVO",
          actividades: [
            { idActividad: 620100, descripcion: "Servicios de consultores en informática" },
          ],
        },
      })
    );

    const result = await afipCuitLookup({ cuit: "30-50001091-2" });
    expect(result.cuit).toBe("30500010912");
    expect(result.denominacion).toBe("EMPRESA TEST S.A.");
    expect(result.tipo_persona).toBe("JURIDICA");
    expect(result.estado).toBe("ACTIVO");
    expect(result.actividades).toContain("Servicios de consultores en informática");
    expect(result.fuente).toBe("api_directa");
  });

  it("consulta datos de persona física", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        persona: {
          tipoClave: "CUIL",
          idPersona: 20123456789,
          nombre: "Juan",
          apellido: "Pérez",
          tipoPersona: "FISICA",
          estadoClave: "ACTIVO",
          actividades: [],
        },
      })
    );

    const result = await afipCuitLookup({ cuit: "20123456789" });
    expect(result.denominacion).toBe("Pérez, Juan");
    expect(result.tipo_persona).toBe("FISICA");
  });

  it("lanza error con CUIT inválido (menos de 11 dígitos)", async () => {
    await expect(afipCuitLookup({ cuit: "1234" })).rejects.toThrow("inválido");
  });

  it("lanza error con CUIT inválido (letras)", async () => {
    await expect(afipCuitLookup({ cuit: "abcdefghijk" })).rejects.toThrow("inválido");
  });

  it("lanza error si CUIT no encontrado", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ error: "CUIT no registrado" })
    );
    await expect(afipCuitLookup({ cuit: "20000000001" })).rejects.toThrow("no encontrado");
  });
});
