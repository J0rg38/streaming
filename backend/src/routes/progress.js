// ----------------------------------------------------------------------------
//  routes/progress.js — Guardado y consulta del progreso POR USUARIO.
//  (Este router se monta detrás de requireAuth, así que req.user siempre existe.)
//
//  POST /api/progress                       -> UPSERT del punto donde se pausó.
//  GET  /api/progress/:mediaId(/:episodeId) -> leer progreso puntual.
// ----------------------------------------------------------------------------
import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// ---------------------------------------------------------------------------
//  POST /api/progress
//  Body JSON: { media_id, episode_id (opcional / null), stopped_at }
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  const userId = req.user.id;
  const { media_id, stopped_at } = req.body;
  const episode_id = req.body.episode_id ? Number(req.body.episode_id) : null;

  if (!Number.isInteger(Number(media_id)) || !Number.isInteger(Number(stopped_at))) {
    return res.status(400).json({ error: 'media_id y stopped_at son obligatorios (enteros)' });
  }

  try {
    if (episode_id === null) {
      // Película: conflicto sobre el índice parcial (user_id, media_id).
      await query(
        `INSERT INTO watch_progress (user_id, media_id, episode_id, stopped_at, updated_at)
         VALUES ($1, $2, NULL, $3, NOW())
         ON CONFLICT (user_id, media_id) WHERE episode_id IS NULL
         DO UPDATE SET stopped_at = EXCLUDED.stopped_at, updated_at = NOW()`,
        [userId, media_id, stopped_at]
      );
    } else {
      // Serie: conflicto sobre (user_id, media_id, episode_id).
      await query(
        `INSERT INTO watch_progress (user_id, media_id, episode_id, stopped_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id, media_id, episode_id) WHERE episode_id IS NOT NULL
         DO UPDATE SET stopped_at = EXCLUDED.stopped_at, updated_at = NOW()`,
        [userId, media_id, episode_id, stopped_at]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/progress]', err);
    res.status(500).json({ error: 'Error al guardar el progreso' });
  }
});

// ---------------------------------------------------------------------------
//  GET /api/progress/:mediaId(/:episodeId)
// ---------------------------------------------------------------------------
router.get('/:mediaId/:episodeId?', async (req, res) => {
  const userId    = req.user.id;
  const mediaId   = Number(req.params.mediaId);
  const episodeId = req.params.episodeId ? Number(req.params.episodeId) : null;

  try {
    const { rows } = episodeId === null
      ? await query(
          `SELECT stopped_at FROM watch_progress
            WHERE user_id = $1 AND media_id = $2 AND episode_id IS NULL`,
          [userId, mediaId]
        )
      : await query(
          `SELECT stopped_at FROM watch_progress
            WHERE user_id = $1 AND media_id = $2 AND episode_id = $3`,
          [userId, mediaId, episodeId]
        );

    res.json({ stopped_at: rows[0]?.stopped_at ?? 0 });
  } catch (err) {
    console.error('[GET /api/progress]', err);
    res.status(500).json({ error: 'Error al leer el progreso' });
  }
});

export default router;
