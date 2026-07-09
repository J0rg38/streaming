-- ============================================================================
--  Migración: destacados ("Estelares"). NO destructiva.
--  featured = true -> el título aparece en la sección "Estelares" del inicio.
--  Ejecutar:  psql -U postgres -d vod -f database/migration_featured.sql
-- ============================================================================

ALTER TABLE media
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;

-- Índice para filtrar rápido los destacados.
CREATE INDEX IF NOT EXISTS idx_media_featured ON media(featured) WHERE featured = true;
