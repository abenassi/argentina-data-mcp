import { describe, it, expect } from "vitest";
import { parseAvisosFromHtml } from "../src/collectors/collect_boletin.js";

describe("parseAvisosFromHtml", () => {
  it("parses a standard aviso block", () => {
    const html = `
      <div class="col-md-12">
        <a href="/detalleAviso/primera/340282/20260401?busqueda=2" onclick="sendDetalleEvent('Visto', 'Aviso');">
          <div class="linea-aviso">
            <p class="item">DIRECCIÓN NACIONAL DE CALIDAD </p>
            <p class="item-detalle">
              <small>Disposición 51/2026 </small>
            </p>
          </div>
        </a>
      </div>
    `;
    const avisos = parseAvisosFromHtml(html);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].id_aviso).toBe("340282");
    expect(avisos[0].seccion).toBe("primera");
    expect(avisos[0].fecha).toBe("20260401");
    expect(avisos[0].organismo).toBe("DIRECCIÓN NACIONAL DE CALIDAD");
    expect(avisos[0].tipo_norma).toBe("Disposición 51/2026");
    expect(avisos[0].url).toContain("/detalleAviso/primera/340282/20260401");
  });

  it("parses multiple avisos", () => {
    const html = `
      <a href="/detalleAviso/primera/340297/20260401?busqueda=1">
        <div class="linea-aviso">
          <p class="item">BANCO CENTRAL </p>
          <p class="item-detalle"><small>Aviso Oficial </small></p>
        </div>
      </a>
      <a href="/detalleAviso/segunda/340300/20260401?busqueda=1">
        <div class="linea-aviso">
          <p class="item">INSTITUTO NACIONAL DE SEMILLAS </p>
          <p class="item-detalle"><small>Resolución 10/2026 </small></p>
        </div>
      </a>
    `;
    const avisos = parseAvisosFromHtml(html);
    expect(avisos).toHaveLength(2);
    expect(avisos[0].seccion).toBe("primera");
    expect(avisos[1].seccion).toBe("segunda");
    expect(avisos[1].organismo).toBe("INSTITUTO NACIONAL DE SEMILLAS");
  });

  it("returns empty array for HTML without avisos", () => {
    const html = "<html><body>No results</body></html>";
    expect(parseAvisosFromHtml(html)).toEqual([]);
  });

  it("handles section page format (with anexos param)", () => {
    const html = `
      <a href="/detalleAviso/primera/340228/20260401?anexos=1" onclick="sendDetalleEvent('Visto', 'Aviso');">
        <div class="linea-aviso">
          <p class="item">MINISTERIO DE ECONOMÍA </p>
          <p class="item-detalle"><small>Decreto 200/2026 </small></p>
        </div>
      </a>
    `;
    const avisos = parseAvisosFromHtml(html);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].organismo).toBe("MINISTERIO DE ECONOMÍA");
  });
});
