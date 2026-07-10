-- ============================================================================
--  Migración: sección para adultos. NO destructiva.
--  Ejecutar:  psql -U postgres -d vod -f database/migration_adult.sql
--
--  - users.adult_access : si el usuario puede ver la sección de adultos.
--  - media.is_adult     : el título es contenido para adultos (género adulto/adultos).
--                         Se excluye del catálogo normal y sólo aparece en /adultos.
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS adult_access BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE media
  ADD COLUMN IF NOT EXISTS is_adult BOOLEAN NOT NULL DEFAULT false;

-- Backfill: marca como adulto lo que ya tenga género 'adulto' o 'adultos'.
UPDATE media
   SET is_adult = true
 WHERE EXISTS (
   SELECT 1 FROM unnest(genres) g WHERE lower(trim(g)) IN ('adulto', 'adultos')
 );

-- Los administradores tienen acceso a la sección de adultos.
UPDATE users SET adult_access = true WHERE role = 'admin';

CREATE INDEX IF NOT EXISTS idx_media_is_adult ON media(is_adult);
