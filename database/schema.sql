-- ============================================================================
--  VOD self-hosted — Esquema PostgreSQL (instalación desde cero)
--  Ejecutar con:  psql -U <usuario> -d <base> -f database/schema.sql
--
--  NOTA: si ya tenías la BD creada con la versión anterior, NO uses este
--  archivo (borra datos). Usa database/migration_auth.sql en su lugar.
-- ============================================================================

-- Extensión para búsqueda por similitud (fuzzy).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Limpieza (útil durante desarrollo). Quitar en producción si no se desea.
DROP TABLE IF EXISTS watch_progress CASCADE;
DROP TABLE IF EXISTS episodes       CASCADE;
DROP TABLE IF EXISTS media          CASCADE;
DROP TABLE IF EXISTS users          CASCADE;

-- ----------------------------------------------------------------------------
--  users : cuentas de acceso. role diferencia usuario normal de administrador.
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,          -- bcrypt (nunca texto plano)
    display_name  VARCHAR(120),
    role          VARCHAR(10)  NOT NULL DEFAULT 'user'
                    CHECK (role IN ('user', 'admin')),
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(lower(email));

-- ----------------------------------------------------------------------------
--  media : catálogo principal. Contiene tanto películas como series.
--    - type = 'movie'  -> video_path apunta al archivo de la película.
--    - type = 'series' -> video_path queda NULL; los videos viven en episodes.
-- ----------------------------------------------------------------------------
CREATE TABLE media (
    id           SERIAL PRIMARY KEY,
    title        VARCHAR(255) NOT NULL,
    description  TEXT,
    type         VARCHAR(10)  NOT NULL CHECK (type IN ('movie', 'series')),
    release_year INT,
    genres       TEXT[]       DEFAULT '{}',      -- p.ej. {'Acción','Drama'}
    actors       TEXT[]       NOT NULL DEFAULT '{}', -- reparto (para búsqueda)
    poster_url   TEXT,                            -- imagen vertical (carrusel)
    banner_url   TEXT,                            -- imagen horizontal (hero)
    video_path   TEXT,                            -- SOLO se llena si type='movie'
    duration     INT,                             -- duración en segundos (películas)
    transcode_status VARCHAR(12) NOT NULL DEFAULT 'pending', -- pending|processing|ready|error
    hls_master   TEXT,                            -- URL del master playlist HLS
    featured     BOOLEAN      NOT NULL DEFAULT false, -- aparece en "Estelares"
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),

    -- Regla de integridad: una película DEBE tener video_path;
    -- una serie NO debe tenerlo (sus videos están en episodes).
    CONSTRAINT chk_video_path CHECK (
        (type = 'movie'  AND video_path IS NOT NULL) OR
        (type = 'series' AND video_path IS NULL)
    )
);

-- ----------------------------------------------------------------------------
--  episodes : capítulos de una serie. Sólo aplica a media.type = 'series'.
-- ----------------------------------------------------------------------------
CREATE TABLE episodes (
    id             SERIAL PRIMARY KEY,
    media_id       INT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    season_number  INT NOT NULL,
    episode_number INT NOT NULL,
    title          VARCHAR(255),
    duration       INT,                            -- duración en segundos
    video_path     TEXT NOT NULL,                  -- ruta al archivo del capítulo
    transcode_status VARCHAR(12) NOT NULL DEFAULT 'pending',
    hls_master     TEXT,
    CONSTRAINT uq_episode UNIQUE (media_id, season_number, episode_number)
);
CREATE INDEX idx_episodes_media ON episodes(media_id, season_number, episode_number);

-- ----------------------------------------------------------------------------
--  watch_progress : posición de reproducción POR USUARIO.
--    - Película -> episode_id NULL.
--    - Serie    -> episode_id apunta al capítulo concreto.
-- ----------------------------------------------------------------------------
CREATE TABLE watch_progress (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    media_id   INT NOT NULL REFERENCES media(id)    ON DELETE CASCADE,
    episode_id INT          REFERENCES episodes(id) ON DELETE CASCADE,  -- NULL en películas
    stopped_at INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Un usuario tiene una única fila de progreso por película / por capítulo.
CREATE UNIQUE INDEX uq_progress_movie
    ON watch_progress(user_id, media_id)
    WHERE episode_id IS NULL;
CREATE UNIQUE INDEX uq_progress_episode
    ON watch_progress(user_id, media_id, episode_id)
    WHERE episode_id IS NOT NULL;
