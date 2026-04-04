-- Add columns to afip_cuit_cache for padrón ZIP data
-- Source: https://www.afip.gob.ar/genericos/cInscripcion/archivos/apellidoNombreDenominacion.zip

ALTER TABLE afip_cuit_cache
  ADD COLUMN IF NOT EXISTS imp_ganancias VARCHAR(2),
  ADD COLUMN IF NOT EXISTS imp_iva VARCHAR(2),
  ADD COLUMN IF NOT EXISTS monotributo VARCHAR(2),
  ADD COLUMN IF NOT EXISTS integrante_sociedad BOOLEAN,
  ADD COLUMN IF NOT EXISTS empleador BOOLEAN,
  ADD COLUMN IF NOT EXISTS actividad_monotributo VARCHAR(2);
