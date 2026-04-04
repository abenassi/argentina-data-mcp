import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

import { afipCuitLookup } from "../src/tools/afip_cuit_lookup.js";
import { pool } from "../src/db/pool.js";

const mockQuery = vi.mocked(pool.query);

beforeEach(() => mockQuery.mockReset());

describe("afip_cuit_lookup", () => {
  it("consulta datos de un CUIT válido (persona jurídica)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        denominacion: "EMPRESA TEST S.A.",
        tipo_persona: "JURIDICA",
        estado: "ACTIVO",
        imp_ganancias: "AC",
        imp_iva: "AC",
        monotributo: "NI",
        actividad_monotributo: "00",
        empleador: true,
        integrante_sociedad: false,
        fetched_at: new Date("2026-04-01T00:00:00Z"),
      }],
    } as any);

    const result = await afipCuitLookup({ cuit: "30-50001091-2" });
    expect(result.cuit).toBe("30500010912");
    expect(result.denominacion).toBe("EMPRESA TEST S.A.");
    expect(result.tipo_persona).toBe("JURIDICA");
    expect(result.estado).toBe("ACTIVO");
    expect(result.imp_ganancias).toBe("Activo");
    expect(result.imp_iva).toBe("Responsable Inscripto");
    expect(result.monotributo).toBe("No Inscripto");
    expect(result.empleador).toBe(true);
    expect(result.fuente).toBe("padron_afip_zip");
  });

  it("consulta datos de monotributista categoría A", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        denominacion: "PEREZ JUAN",
        tipo_persona: "FISICA",
        estado: "ACTIVO",
        imp_ganancias: "NI",
        imp_iva: "NI",
        monotributo: "A",
        actividad_monotributo: "02",
        empleador: false,
        integrante_sociedad: false,
        fetched_at: new Date("2026-04-01T00:00:00Z"),
      }],
    } as any);

    const result = await afipCuitLookup({ cuit: "20123456789" });
    expect(result.denominacion).toBe("PEREZ JUAN");
    expect(result.tipo_persona).toBe("FISICA");
    expect(result.monotributo).toBe("Categoría A");
    expect(result.actividad_monotributo).toBe("Profesional");
    expect(result.empleador).toBe(false);
  });

  it("lanza error con CUIT inválido (menos de 11 dígitos)", async () => {
    await expect(afipCuitLookup({ cuit: "1234" })).rejects.toThrow("inválido");
  });

  it("lanza error con CUIT inválido (letras)", async () => {
    await expect(afipCuitLookup({ cuit: "abcdefghijk" })).rejects.toThrow("inválido");
  });

  it("lanza error si CUIT no encontrado en el padrón", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    await expect(afipCuitLookup({ cuit: "20000000001" })).rejects.toThrow("no encontrado");
  });

  it("marca como stale si datos tienen más de 14 días", async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 20);
    mockQuery.mockResolvedValueOnce({
      rows: [{
        denominacion: "TEST",
        tipo_persona: "FISICA",
        estado: "ACTIVO",
        imp_ganancias: "NI",
        imp_iva: "NI",
        monotributo: "NI",
        actividad_monotributo: "00",
        empleador: false,
        integrante_sociedad: false,
        fetched_at: oldDate,
      }],
    } as any);

    const result = await afipCuitLookup({ cuit: "20123456789" });
    expect(result.freshness).toBe("stale");
  });

  it("acepta CUIT con guiones", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        denominacion: "TEST",
        tipo_persona: "FISICA",
        estado: "ACTIVO",
        imp_ganancias: "NI",
        imp_iva: "NI",
        monotributo: "NI",
        actividad_monotributo: "00",
        empleador: false,
        integrante_sociedad: false,
        fetched_at: new Date(),
      }],
    } as any);

    const result = await afipCuitLookup({ cuit: "20-12345678-9" });
    expect(result.cuit).toBe("20123456789");
  });
});
