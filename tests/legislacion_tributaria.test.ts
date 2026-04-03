import { describe, it, expect } from "vitest";
import { legislacionTributaria } from "../src/tools/legislacion_tributaria.js";

describe("legislacion_tributaria", () => {
  it("devuelve categorías de monotributo por defecto", () => {
    const result = legislacionTributaria({});
    expect(result.impuesto).toBe("monotributo");
    expect(result.vigencia).toContain("2026");
    const datos = result.datos as any;
    expect(datos.categorias).toHaveLength(11);
    expect(datos.categorias[0].categoria).toBe("A");
    expect(datos.categorias[10].categoria).toBe("K");
    expect(datos.categorias[0].cuota_total_servicios).toBeGreaterThan(0);
    expect(datos.categorias[0].cuota_total_bienes).toBeGreaterThan(0);
  });

  it("cuota de servicios >= cuota de bienes a partir de categoría C", () => {
    const result = legislacionTributaria({ impuesto: "monotributo" });
    const datos = result.datos as any;
    for (const cat of datos.categorias) {
      if (["A", "B"].includes(cat.categoria)) {
        expect(cat.cuota_total_servicios).toBe(cat.cuota_total_bienes);
      } else {
        expect(cat.cuota_total_servicios).toBeGreaterThan(cat.cuota_total_bienes);
      }
    }
  });

  it("devuelve deducciones y escala de ganancias", () => {
    const result = legislacionTributaria({ impuesto: "ganancias" });
    expect(result.impuesto).toBe("ganancias");
    const datos = result.datos as any;
    expect(datos.deducciones_anuales.ganancia_no_imponible).toBe(5151802.50);
    expect(datos.deducciones_anuales.deduccion_especial_empleados).toBe(24728652.02);
    expect(datos.escala_alicuotas).toHaveLength(9);
    expect(datos.escala_alicuotas[0].alicuota_porcentaje).toBe(5);
    expect(datos.escala_alicuotas[8].alicuota_porcentaje).toBe(35);
    expect(datos.escala_alicuotas[8].hasta).toBeNull();
  });

  it("escala de ganancias tiene montos fijos crecientes", () => {
    const result = legislacionTributaria({ impuesto: "ganancias" });
    const datos = result.datos as any;
    for (let i = 1; i < datos.escala_alicuotas.length; i++) {
      expect(datos.escala_alicuotas[i].monto_fijo).toBeGreaterThan(datos.escala_alicuotas[i - 1].monto_fijo);
    }
  });

  it("devuelve alícuotas de IVA", () => {
    const result = legislacionTributaria({ impuesto: "iva" });
    expect(result.impuesto).toBe("iva");
    const datos = result.datos as any;
    expect(datos.alicuotas).toHaveLength(4);
    const general = datos.alicuotas.find((a: any) => a.tipo === "general");
    expect(general.porcentaje).toBe(21);
    const reducida = datos.alicuotas.find((a: any) => a.tipo === "reducida");
    expect(reducida.porcentaje).toBe(10.5);
  });

  it("lanza error con impuesto no reconocido", () => {
    expect(() => legislacionTributaria({ impuesto: "inexistente" }))
      .toThrow("Impuesto no reconocido");
  });

  it("incluye norma_fuente y actualizado_al en todos los impuestos", () => {
    for (const impuesto of ["monotributo", "ganancias", "iva"]) {
      const result = legislacionTributaria({ impuesto });
      expect(result.norma_fuente).toBeTruthy();
      expect(result.actualizado_al).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
