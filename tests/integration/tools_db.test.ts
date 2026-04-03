import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import pg from "pg";

// These tests require a running PostgreSQL with data loaded by collectors.
// Run with: npm run test:integration

const pool = new pg.Pool({
  max: 2,
  connectionTimeoutMillis: 5000,
});

beforeAll(async () => {
  // Verify DB connection
  const result = await pool.query("SELECT 1");
  expect(result.rows).toHaveLength(1);
});

afterAll(async () => {
  await pool.end();
});

describe("integration: database has data", () => {
  it("cotizaciones_dolar has records", async () => {
    const result = await pool.query("SELECT COUNT(*) as cnt FROM cotizaciones_dolar");
    expect(Number(result.rows[0].cnt)).toBeGreaterThan(0);
  });

  it("bcra_variables has records", async () => {
    const result = await pool.query("SELECT COUNT(*) as cnt FROM bcra_variables");
    expect(Number(result.rows[0].cnt)).toBeGreaterThan(0);
  });

  it("indec_series has records", async () => {
    const result = await pool.query("SELECT COUNT(*) as cnt FROM indec_series");
    expect(Number(result.rows[0].cnt)).toBeGreaterThan(0);
  });

  it("infoleg_normas has records", async () => {
    const result = await pool.query("SELECT COUNT(*) as cnt FROM infoleg_normas");
    expect(Number(result.rows[0].cnt)).toBeGreaterThan(0);
  });

  it("data_freshness has entries", async () => {
    const result = await pool.query("SELECT source_name, is_healthy FROM data_freshness ORDER BY source_name");
    expect(result.rows.length).toBeGreaterThanOrEqual(3);
    // At least dolar and indec should be healthy
    const dolar = result.rows.find((r: any) => r.source_name === "dolar");
    const indec = result.rows.find((r: any) => r.source_name === "indec");
    expect(dolar?.is_healthy).toBe(true);
    expect(indec?.is_healthy).toBe(true);
  });
});

describe("integration: dolar cotizaciones from DB", () => {
  it("has all major exchange rates", async () => {
    const result = await pool.query("SELECT DISTINCT tipo FROM cotizaciones_dolar WHERE fuente = 'dolarapi'");
    const tipos = result.rows.map((r: any) => r.tipo);
    expect(tipos).toContain("oficial");
    expect(tipos).toContain("blue");
  });
});

describe("integration: BCRA variables from DB", () => {
  it("has dolar_oficial data", async () => {
    const result = await pool.query("SELECT valor, fecha FROM bcra_variables WHERE nombre = 'dolar_oficial' ORDER BY fecha DESC LIMIT 1");
    expect(result.rows).toHaveLength(1);
    expect(Number(result.rows[0].valor)).toBeGreaterThan(0);
  });
});

describe("integration: INDEC series from DB", () => {
  it("has IPC data", async () => {
    const result = await pool.query("SELECT valor, fecha FROM indec_series WHERE serie_id = '148.3_INIVELNAL_DICI_M_26' ORDER BY fecha DESC LIMIT 1");
    expect(result.rows).toHaveLength(1);
    expect(Number(result.rows[0].valor)).toBeGreaterThan(0);
  });

  it("has EMAE data", async () => {
    const result = await pool.query("SELECT COUNT(*) as cnt FROM indec_series WHERE serie_id = '143.3_NO_PR_2004_A_21'");
    expect(Number(result.rows[0].cnt)).toBeGreaterThan(0);
  });
});

describe("integration: InfoLeg FTS search", () => {
  it("finds results for common legal terms", async () => {
    const result = await pool.query(
      `SELECT id_norma, tipo_norma, titulo_resumido FROM infoleg_normas
       WHERE to_tsvector('spanish', COALESCE(titulo_sumario,'') || ' ' || COALESCE(titulo_resumido,'') || ' ' || COALESCE(texto_resumido,''))
             @@ plainto_tsquery('spanish', 'impuesto ganancias')
       LIMIT 3`
    );
    expect(result.rows.length).toBeGreaterThan(0);
  });
});
