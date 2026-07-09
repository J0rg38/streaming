-- ============================================================================
--  Migración: autenticación + progreso por usuario + duración de películas.
--  NO destructiva: conserva el contenido ya subido.
--  Ejecutar:  psql -U postgres -d vod -f database/migration_auth.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
--  users : cuentas de acceso. role diferencia usuario normal de administrador.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,          -- bcrypt (nunca texto plano)
    display_name  VARCHAR(120),
    role          VARCHAR(10)  NOT NULL DEFAULT 'user'
                    CHECK (role IN ('user', 'admin')),
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Búsqueda rápida por email (login).
CREATE INDEX IF NOT EXISTS idx_users_email ON users(lower(email));

-- ----------------------------------------------------------------------------
--  media.duration : duración en segundos (para películas). Las series usan
--  la duración de cada capítulo en la tabla episodes.
-- ----------------------------------------------------------------------------
ALTER TABLE media ADD COLUMN IF NOT EXISTS duration INT;

-- ----------------------------------------------------------------------------
--  watch_progress : ahora el progreso es POR USUARIO.
-- ----------------------------------------------------------------------------

-- 1) Añadimos la columna user_id (nullable de momento).
ALTER TABLE watch_progress ADD COLUMN IF NOT EXISTS user_id INT;

-- 2) Eliminamos filas de progreso "anónimas" previas a la autenticación
--    (no se pueden atribuir a ningún usuario).
DELETE FROM watch_progress WHERE user_id IS NULL;

-- 3) La hacemos obligatoria y con FK.
ALTER TABLE watch_progress ALTER COLUMN user_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'fk_progress_user'
  ) THEN
    ALTER TABLE watch_progress
      ADD CONSTRAINT fk_progress_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 4) Reemplazamos los índices únicos para que incluyan al usuario:
--    cada usuario tiene su propia fila de progreso por película/capítulo.
DROP INDEX IF EXISTS uq_progress_movie;
DROP INDEX IF EXISTS uq_progress_episode;

CREATE UNIQUE INDEX IF NOT EXISTS uq_progress_movie
    ON watch_progress(user_id, media_id)
    WHERE episode_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_progress_episode
    ON watch_progress(user_id, media_id, episode_id)
    WHERE episode_id IS NOT NULL;
