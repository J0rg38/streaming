-- ----------------------------------------------------------------------------
--  migration_coming_soon.sql — Sección "Próximamente".
--
--  Permite registrar títulos que aún NO tienen video (próximos estrenos): se
--  sube toda la metadata (título, sinopsis, póster, banner, géneros…) y el
--  video se añade después ("regularizar"), momento en que sale de Próximamente.
--
--  Para que una película pueda existir sin video mientras es "próximamente",
--  relajamos la restricción chk_video_path.
-- ----------------------------------------------------------------------------

ALTER TABLE media ADD COLUMN IF NOT EXISTS coming_soon  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE media ADD COLUMN IF NOT EXISTS release_date DATE;  -- fecha de estreno (opcional)

-- Una película "próximamente" puede no tener video_path todavía.
ALTER TABLE media DROP CONSTRAINT IF EXISTS chk_video_path;
ALTER TABLE media ADD CONSTRAINT chk_video_path CHECK (
    (type = 'movie'  AND (video_path IS NOT NULL OR coming_soon = true)) OR
    (type = 'series' AND video_path IS NULL)
);
