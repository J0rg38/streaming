-- ============================================================================
--  Migración: buscador inteligente + reparto (actores). NO destructiva.
--  Ejecutar:  psql -U postgres -d vod -f database/migration_search.sql
--
--  - pg_trgm: búsqueda por similitud (tolera errores de tipeo, coincidencias
--    parciales) para mostrar resultados "similares" cuando no hay exacto.
--  - actors: reparto del título (para buscar también por actor).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE media
  ADD COLUMN IF NOT EXISTS actors TEXT[] NOT NULL DEFAULT '{}';

-- Índice trigram sobre el título para acelerar similarity()/ILIKE.
CREATE INDEX IF NOT EXISTS idx_media_title_trgm
  ON media USING gin (lower(title) gin_trgm_ops);

-- Índices GIN sobre los arrays (búsquedas por género/actor).
CREATE INDEX IF NOT EXISTS idx_media_genres ON media USING gin (genres);
CREATE INDEX IF NOT EXISTS idx_media_actors ON media USING gin (actors);
