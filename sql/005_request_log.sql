-- Request logging for observability and usage metrics
CREATE TABLE IF NOT EXISTS request_log (
  id SERIAL PRIMARY KEY,
  tool_name VARCHAR(50) NOT NULL,
  duration_ms INTEGER NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'ok',  -- 'ok' or 'error'
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_request_log_created ON request_log (created_at DESC);
CREATE INDEX idx_request_log_tool ON request_log (tool_name, created_at DESC);
