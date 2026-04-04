import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the pool before importing
const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
vi.mock("../src/db/pool.js", () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
}));

import { logToolCall, getUsageStats } from "../src/request_log.js";

describe("request_log", () => {
  beforeEach(() => {
    mockQuery.mockClear();
  });

  it("logToolCall inserts a record", () => {
    logToolCall("dolar_cotizaciones", 42, "ok");
    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("INSERT INTO request_log");
    expect(params).toEqual(["dolar_cotizaciones", 42, "ok", null]);
  });

  it("logToolCall includes error message on error", () => {
    logToolCall("bcra_tipo_cambio", 100, "error", "timeout");
    const [, params] = mockQuery.mock.calls[0];
    expect(params).toEqual(["bcra_tipo_cambio", 100, "error", "timeout"]);
  });

  it("logToolCall does not throw on DB failure", () => {
    mockQuery.mockRejectedValueOnce(new Error("DB down"));
    expect(() => logToolCall("test", 1, "ok")).not.toThrow();
  });

  it("getUsageStats returns aggregated data", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ total_calls: 100, calls_24h: 10, avg_latency_ms: 50, error_rate: 5.0 }],
      })
      .mockResolvedValueOnce({
        rows: [
          { tool_name: "dolar_cotizaciones", calls: 60, avg_ms: 30, errors: 2 },
          { tool_name: "bcra_tipo_cambio", calls: 40, avg_ms: 80, errors: 3 },
        ],
      });

    const stats = await getUsageStats();
    expect(stats.total_calls).toBe(100);
    expect(stats.calls_24h).toBe(10);
    expect(stats.by_tool).toHaveLength(2);
    expect(stats.by_tool[0].tool_name).toBe("dolar_cotizaciones");
  });
});
