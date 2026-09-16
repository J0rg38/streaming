-- ============================================================================
--  Migración: marcas de reproducción (inicio de créditos y cabecera de series).
--  NO destructiva.
--  Ejecutar:  psql -U postgres -d vod -f database/migration_marks.sql
--
--  credits_start — segundo en el que empiezan los créditos finales. A partir de
--    ahí el título se considera VISTO y el reproductor pasa a "post-play"
--    (vídeo encogido + recomendaciones), sin obligar a tragarse los créditos.
--    NULL = desconocido; el backend calcula entonces una estimación por
--    duración, así que el reproductor siempre tiene un punto con el que
--    trabajar (ver backend/src/marks.js).
--
--  marks_source — de dónde salió la marca, por orden de confianza:
--    'manual'   -> la puso una persona desde el reproductor. NUNCA se pisa.
--    'chapters' -> capítulo "End Credits" del propio archivo (exacta).
--    'auto'     -> detección por luminancia con ffmpeg (buena aproximación).
--    NULL       -> no se ha analizado todavía (es lo que busca el barrido).
--  Un análisis sin resultado deja marks_source='auto' y credits_start NULL: así
--  consta como analizado, no se repite en cada arranque, y el reproductor usa
--  la estimación por duración.
--
--  intro_start / intro_end (sólo capítulos) — cabecera de la serie, para el
--    botón "Saltar intro". Suele ser idéntica en toda la temporada, por eso el
--    panel permite copiar la marca a todos los capítulos de una tacada.
-- ============================================================================

ALTER TABLE media
  ADD COLUMN IF NOT EXISTS credits_start INT,
  ADD COLUMN IF NOT EXISTS marks_source  VARCHAR(10);

ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS credits_start INT,
  ADD COLUMN IF NOT EXISTS intro_start   INT,
  ADD COLUMN IF NOT EXISTS intro_end     INT,
  ADD COLUMN IF NOT EXISTS marks_source  VARCHAR(10);

-- El barrido en segundo plano busca justo esto: lo que aún no tiene marca.
-- Índices parciales: sólo indexan las filas pendientes, así que ocupan nada.
CREATE INDEX IF NOT EXISTS idx_media_sin_marcas
    ON media(id) WHERE marks_source IS NULL;
CREATE INDEX IF NOT EXISTS idx_episodes_sin_marcas
    ON episodes(id) WHERE marks_source IS NULL;
