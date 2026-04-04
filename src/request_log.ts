import { pool } from "./db/pool.js";

/** Fire-and-forget log of a tool call. Never throws. */
export function logToolCall(
  toolName: string,
  durationMs: number,
  status: "ok" | "error",
  errorMessage?: string,
): void {
  pool.query(
    `INSERT INTO request_log (tool_name, duration_ms, status, error_message, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [toolName, durationMs, status, errorMessage || null]
  ).catch(() => { /* logging must never break tool execution */ });
}

/** Usage stats summary for data_health / diagnostics */
export async function getUsageStats(): Promise<{
  total_calls: number;
  calls_24h: number;
  avg_latency_ms: number;
  error_rate: number;
  by_tool: { tool_name: string; calls: number; avg_ms: number; errors: number }[];
}> {
  const [totals, byTool] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int AS total_calls,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS calls_24h,
        COALESCE(AVG(duration_ms)::int, 0) AS avg_latency_ms,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE status = 'error')::numeric / COUNT(*)::numeric * 100, 1)
          ELSE 0 END AS error_rate
      FROM request_log
    `),
    pool.query(`
      SELECT tool_name,
        COUNT(*)::int AS calls,
        AVG(duration_ms)::int AS avg_ms,
        COUNT(*) FILTER (WHERE status = 'error')::int AS errors
      FROM request_log
      GROUP BY tool_name
      ORDER BY calls DESC
    `),
  ]);

  const row = totals.rows[0];
  return {
    total_calls: row.total_calls,
    calls_24h: row.calls_24h,
    avg_latency_ms: row.avg_latency_ms,
    error_rate: Number(row.error_rate),
    by_tool: byTool.rows,
  };
}
