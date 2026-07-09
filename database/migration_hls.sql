-- ============================================================================
--  Migración: soporte de streaming adaptativo (HLS) por transcodificación.
--  NO destructiva. Ejecutar:  psql -U postgres -d vod -f database/migration_hls.sql
--
--  transcode_status: 'pending' | 'processing' | 'ready' | 'error'
--  hls_master      : URL pública del master playlist (ej. /api/hls/movie-5/master.m3u8)
-- ============================================================================

ALTER TABLE media
  ADD COLUMN IF NOT EXISTS transcode_status VARCHAR(12) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS hls_master TEXT;

ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS transcode_status VARCHAR(12) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS hls_master TEXT;

-- El contenido ya existente queda en 'pending'; el backend lo transcodificará
-- automáticamente al arrancar (proceso de "resume"/backfill).
