-- Argentina Data MCP - Database Schema
-- Run with: PGPASSWORD=argdata_dev_2026 psql -h localhost -U argdata -d argentina_data -f sql/001_create_tables.sql

-- Cotizaciones del dólar (fuente: DolarAPI.com / BCRA)
CREATE TABLE IF NOT EXISTS cotizaciones_dolar (
  id SERIAL PRIMARY KEY,
  fuente VARCHAR(50) NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  compra DECIMAL(12,4),
  venta DECIMAL(12,4),
  fecha TIMESTAMP NOT NULL,
  variacion DECIMAL(8,4),
  raw_json JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(fuente, tipo, fecha)
);

-- Variables monetarias BCRA
CREATE TABLE IF NOT EXISTS bcra_variables (
  id SERIAL PRIMARY KEY,
  id_variable INTEGER NOT NULL,
  nombre VARCHAR(200) NOT NULL,
  valor DECIMAL(20,6) NOT NULL,
  fecha DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(id_variable, fecha)
);

-- Series de tiempo INDEC / datos.gob.ar
CREATE TABLE IF NOT EXISTS indec_series (
  id SERIAL PRIMARY KEY,
  serie_id VARCHAR(100) NOT NULL,
  nombre VARCHAR(300) NOT NULL,
  valor DECIMAL(20,6) NOT NULL,
  fecha DATE NOT NULL,
  frecuencia VARCHAR(20),
  is_updated BOOLEAN DEFAULT TRUE,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(serie_id, fecha)
);

-- InfoLeg normativa (importada desde CSV dump)
CREATE TABLE IF NOT EXISTS infoleg_normas (
  id SERIAL PRIMARY KEY,
  id_norma INTEGER UNIQUE NOT NULL,
  tipo_norma VARCHAR(100),
  numero_norma VARCHAR(50),
  clase_norma VARCHAR(100),
  organismo_origen VARCHAR(300),
  fecha_sancion DATE,
  numero_boletin VARCHAR(50),
  fecha_boletin DATE,
  titulo_resumido TEXT,
  titulo_sumario TEXT,
  texto_resumido TEXT,
  observaciones TEXT,
  texto_original TEXT,
  texto_actualizado TEXT
);

-- Full-text search index para InfoLeg
CREATE INDEX IF NOT EXISTS idx_infoleg_fts ON infoleg_normas
  USING GIN (to_tsvector('spanish', COALESCE(titulo_sumario,'') || ' ' || COALESCE(titulo_resumido,'') || ' ' || COALESCE(texto_resumido,'')));
CREATE INDEX IF NOT EXISTS idx_infoleg_tipo ON infoleg_normas(tipo_norma);
CREATE INDEX IF NOT EXISTS idx_infoleg_fecha ON infoleg_normas(fecha_sancion);

-- Boletín Oficial
CREATE TABLE IF NOT EXISTS boletin_oficial (
  id SERIAL PRIMARY KEY,
  titulo TEXT,
  seccion VARCHAR(50),
  fecha DATE,
  url TEXT,
  raw_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- AFIP CUIT cache
CREATE TABLE IF NOT EXISTS afip_cuit_cache (
  cuit VARCHAR(11) PRIMARY KEY,
  denominacion VARCHAR(500),
  tipo_persona VARCHAR(50),
  estado VARCHAR(50),
  actividades JSONB,
  raw_json JSONB,
  fetched_at TIMESTAMP DEFAULT NOW()
);

-- Metadata de freshness
CREATE TABLE IF NOT EXISTS data_freshness (
  source_name VARCHAR(100) PRIMARY KEY,
  last_successful_fetch TIMESTAMP,
  last_data_date DATE,
  is_healthy BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);
