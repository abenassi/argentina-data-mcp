-- Uptime tracking — logs health check results every 5 minutes
CREATE TABLE IF NOT EXISTS uptime_log (
  id SERIAL PRIMARY KEY,
  status VARCHAR(10) NOT NULL,   -- 'ok' or 'down'
  db_latency_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_uptime_log_created ON uptime_log (created_at DESC);
