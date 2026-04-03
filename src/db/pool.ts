import pg from "pg";

// pg automatically reads PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE from env
const pool = new pg.Pool({
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err.message);
});

export { pool };

export async function healthCheck(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
