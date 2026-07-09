-- ============================================================================
--  Migración: etiquetas (tags) para mejorar la búsqueda. NO destructiva.
--  Ejecutar:  psql -U postgres -d vod -f database/migration_tags.sql
--
--  tags: palabras clave libres (nombre en inglés, alias, saga, etc.) que
--  ayudan a encontrar el título en el buscador.
-- ============================================================================

ALTER TABLE media
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_media_tags ON media USING gin (tags);
