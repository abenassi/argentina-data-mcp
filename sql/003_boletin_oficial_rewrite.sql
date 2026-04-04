-- Migration: Rewrite boletin_oficial table for new API integration
-- Drops old empty table and creates new schema with FTS support

DROP TABLE IF EXISTS boletin_oficial;

CREATE TABLE boletin_oficial (
  id SERIAL PRIMARY KEY,
  id_aviso VARCHAR(20) NOT NULL,
  seccion VARCHAR(20) NOT NULL,  -- primera, segunda, tercera
  fecha DATE NOT NULL,
  organismo TEXT NOT NULL,
  tipo_norma TEXT,               -- e.g. "Decreto 100/2026", "Resolución 50/2026"
  url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (id_aviso, seccion)
);

-- Index for date-based queries (collector, tool)
CREATE INDEX idx_boletin_fecha ON boletin_oficial (fecha DESC);

-- Full-text search index on organismo + tipo_norma
CREATE INDEX idx_boletin_fts ON boletin_oficial
  USING gin(to_tsvector('spanish', COALESCE(organismo, '') || ' ' || COALESCE(tipo_norma, '')));
