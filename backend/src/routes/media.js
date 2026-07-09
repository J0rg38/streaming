// ----------------------------------------------------------------------------
//  routes/media.js — Catálogo y detalle de un título (con progreso por usuario).
//  (Montado detrás de requireAuth: req.user siempre existe.)
//
//  GET /api/media        -> catálogo agrupado, con progreso/duración del usuario.
//  GET /api/media/:id    -> detalle. Series incluyen temporadas/capítulos + progreso.
// ----------------------------------------------------------------------------
import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// Construye el objeto de progreso que consume el frontend (o null si no aplica).
function buildProgress({ stopped_at, duration, episode }) {
  if (!duration) {
    // Sin duración conocida: sólo informamos lo visto (si hay).
    return stopped_at ? { stopped_at, duration: null, percent: null, remaining: null, episode } : null;
  }
  const clamped = Math.min(stopped_at || 0, duration);
  return {
    stopped_at: clamped,
    duration,
    percent: Math.round((clamped / duration) * 100),
    remaining: Math.max(0, duration - clamped), // segundos que faltan por ver
    episode,                                     // {season,episode} en series, o null
  };
}

// ---------------------------------------------------------------------------
//  GET /api/media  — catálogo con carruseles por género + progreso del usuario.
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const userId = req.user.id;
  try {
    const { rows: media } = await query(
      `SELECT id, title, description, type, release_year,
              genres, poster_url, banner_url, video_path, duration, featured
         FROM media
        ORDER BY created_at DESC`
    );

    // Progreso del usuario: una fila por película/capítulo, con la duración
    // correspondiente (la del capítulo en series, la de la película en films).
    const { rows: progressRows } = await query(
      `SELECT wp.media_id, wp.episode_id, wp.stopped_at, wp.updated_at,
              COALESCE(e.duration, m.duration) AS duration,
              e.season_number, e.episode_number
         FROM watch_progress wp
         JOIN media m ON m.id = wp.media_id
         LEFT JOIN episodes e ON e.id = wp.episode_id
        WHERE wp.user_id = $1
        ORDER BY wp.updated_at DESC`,
      [userId]
    );

    // Para cada media, tomamos la fila de progreso más reciente (la primera,
    // porque vienen ordenadas DESC por updated_at).
    const latestByMedia = new Map();
    for (const p of progressRows) {
      if (!latestByMedia.has(p.media_id)) latestByMedia.set(p.media_id, p);
    }

    const enrich = (item) => {
      const p = latestByMedia.get(item.id);
      const progress = p
        ? buildProgress({
            stopped_at: p.stopped_at,
            duration: p.duration,
            episode: p.episode_id
              ? { season_number: p.season_number, episode_number: p.episode_number }
              : null,
          })
        : null;
      return { ...item, progress };
    };

    const enriched = media.map(enrich);

    // Fila especial "Continuar viendo": títulos con progreso sin terminar.
    const continueWatching = enriched
      .filter((m) => m.progress && (m.progress.percent === null || m.progress.percent < 95))
      .slice(0, 20);

    // "Recién añadidos": los más nuevos (ya vienen ordenados por created_at DESC).
    const recentlyAdded = enriched.slice(0, 15);

    // "Estelares": los marcados como destacados por el admin.
    const featured = enriched.filter((m) => m.featured);

    // Carruseles por género.
    const byGenre = {};
    for (const item of enriched) {
      const genres = item.genres?.length ? item.genres : ['Otros'];
      for (const g of genres) (byGenre[g] ||= []).push(item);
    }
    const rails = Object.entries(byGenre).map(([genre, items]) => ({ genre, items }));

    res.json({ continueWatching, recentlyAdded, featured, rails, all: enriched });
  } catch (err) {
    console.error('[GET /api/media]', err);
    res.status(500).json({ error: 'Error al obtener el catálogo' });
  }
});

// ---------------------------------------------------------------------------
//  GET /api/media/search?q=... — búsqueda inteligente.
//    Busca por título, género y actores. Si no hay coincidencia exacta,
//    devuelve resultados SIMILARES usando similitud trigram (tolera errores
//    de escritura y coincidencias parciales). Ordena por relevancia.
//    (Se define antes que /:id para evitar ambigüedad de rutas.)
// ---------------------------------------------------------------------------
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ query: '', results: [], hasTitleMatch: false });

  const like = `%${q}%`;
  try {
    const { rows } = await query(
      `SELECT id, title, type, release_year, genres, actors, tags,
              poster_url, banner_url, duration,
              (title ILIKE $2) AS title_match,
              GREATEST(
                similarity(lower(title), lower($1)),
                similarity(lower(coalesce(array_to_string(genres, ' '), '')), lower($1)),
                similarity(lower(coalesce(array_to_string(actors, ' '), '')), lower($1)),
                similarity(lower(coalesce(array_to_string(tags,   ' '), '')), lower($1)),
                similarity(lower(coalesce(description, '')), lower($1)) * 0.5
              ) AS score
         FROM media
        WHERE title ILIKE $2
           OR EXISTS (SELECT 1 FROM unnest(genres) g WHERE g ILIKE $2)
           OR EXISTS (SELECT 1 FROM unnest(actors) a WHERE a ILIKE $2)
           OR EXISTS (SELECT 1 FROM unnest(tags)   t WHERE t ILIKE $2)
           OR similarity(lower(title), lower($1)) > 0.25
           OR similarity(lower(coalesce(array_to_string(actors, ' '), '')), lower($1)) > 0.25
           OR similarity(lower(coalesce(array_to_string(genres, ' '), '')), lower($1)) > 0.30
           OR similarity(lower(coalesce(array_to_string(tags,   ' '), '')), lower($1)) > 0.30
        ORDER BY title_match DESC, score DESC, created_at DESC
        LIMIT 40`,
      [q, like]
    );

    // ¿Hubo alguna coincidencia real en el título? (para avisar "similares").
    const hasTitleMatch = rows.some((r) => r.title_match);
    res.json({ query: q, results: rows, hasTitleMatch });
  } catch (err) {
    console.error('[GET /api/media/search]', err);
    res.status(500).json({ error: 'Error en la búsqueda' });
  }
});

// ---------------------------------------------------------------------------
//  GET /api/media/:id/similar — títulos que comparten al menos un género.
//  (Se define antes que /:id para evitar ambigüedad de rutas.)
// ---------------------------------------------------------------------------
router.get('/:id/similar', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  try {
    const { rows: base } = await query(`SELECT genres FROM media WHERE id = $1`, [id]);
    if (base.length === 0) return res.status(404).json({ error: 'No encontrado' });

    const genres = base[0].genres || [];

    // Buscamos otros títulos que compartan algún género (operador && de arrays).
    // Si el título no tiene géneros, devolvemos los más recientes como fallback.
    const { rows } = genres.length
      ? await query(
          `SELECT id, title, type, poster_url, banner_url, duration, genres, release_year
             FROM media
            WHERE id <> $1 AND genres && $2::text[]
            ORDER BY created_at DESC
            LIMIT 12`,
          [id, genres]
        )
      : await query(
          `SELECT id, title, type, poster_url, banner_url, duration, genres, release_year
             FROM media
            WHERE id <> $1
            ORDER BY created_at DESC
            LIMIT 12`,
          [id]
        );

    res.json(rows);
  } catch (err) {
    console.error('[GET /api/media/:id/similar]', err);
    res.status(500).json({ error: 'Error al buscar similares' });
  }
});

// ---------------------------------------------------------------------------
//  GET /api/media/:id  — detalle. Series traen temporadas/capítulos + progreso.
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  try {
    const { rows } = await query(
      `SELECT id, title, description, type, release_year,
              genres, actors, poster_url, banner_url, video_path, duration,
              transcode_status, hls_master
         FROM media WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Título no encontrado' });

    const media = rows[0];

    // URL del WebVTT de miniaturas (derivada del master HLS).
    const thumbsFromMaster = (m) => (m ? m.replace('master.m3u8', 'thumbnails.vtt') : null);

    if (media.type === 'movie') {
      // Adjuntamos el progreso del usuario para la película.
      const { rows: pr } = await query(
        `SELECT stopped_at FROM watch_progress
          WHERE user_id = $1 AND media_id = $2 AND episode_id IS NULL`,
        [userId, id]
      );
      const progress = buildProgress({
        stopped_at: pr[0]?.stopped_at || 0,
        duration: media.duration,
        episode: null,
      });
      return res.json({ ...media, thumbnails: thumbsFromMaster(media.hls_master), progress });
    }

    // --- Serie: capítulos ordenados, cada uno con el progreso del usuario --
    const { rows: episodes } = await query(
      `SELECT e.id, e.season_number, e.episode_number, e.title,
              e.duration, e.video_path, e.transcode_status, e.hls_master,
              wp.stopped_at
         FROM episodes e
         LEFT JOIN watch_progress wp
                ON wp.episode_id = e.id AND wp.user_id = $2
        WHERE e.media_id = $1
        ORDER BY e.season_number, e.episode_number`,
      [id, userId]
    );

    // Añadimos objeto progress por capítulo + reagrupamos por temporada.
    const seasonMap = new Map();
    for (const ep of episodes) {
      ep.progress = buildProgress({
        stopped_at: ep.stopped_at || 0,
        duration: ep.duration,
        episode: null,
      });
      ep.thumbnails = thumbsFromMaster(ep.hls_master);
      if (!seasonMap.has(ep.season_number)) seasonMap.set(ep.season_number, []);
      seasonMap.get(ep.season_number).push(ep);
    }

    const seasons = [...seasonMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([season, eps]) => ({ season, episodes: eps }));

    res.json({ ...media, seasons });
  } catch (err) {
    console.error('[GET /api/media/:id]', err);
    res.status(500).json({ error: 'Error al obtener el título' });
  }
});

export default router;
