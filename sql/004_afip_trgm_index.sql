-- Enable pg_trgm for fast text search on AFIP padrón (6M+ records)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index on denominacion for ILIKE and similarity queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_afip_denominacion_trgm
  ON afip_cuit_cache USING gin (denominacion gin_trgm_ops);
