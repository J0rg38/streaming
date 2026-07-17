// ----------------------------------------------------------------------------
//  routes/media.js — Catálogo y detalle de un título (con progreso por usuario).
//  (Montado detrás de requireAuth: req.user siempre existe.)
//
//  GET /api/media        -> catálogo agrupado, con progreso/duración del usuario.
//  GET /api/media/:id    -> detalle. Series incluyen temporadas/capítulos + progreso.
// ----------------------------------------------------------------------------
import { Router } from 'express';
import { query } from '../db.js';
import { canAccessAdult } from '../middleware/auth.js';

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
// Construye el catálogo (carruseles + progreso) para un usuario.
//   adult=false -> sólo contenido normal (excluye adultos).
//   adult=true  -> sólo contenido para adultos.
// Construye rails "de descubrimiento" por un campo array (actors/tags): agrupa
// por valor, prioriza los más frecuentes y asigna cada título a UN solo rail
// (marcándolo en `seen`) para no repetir. Devuelve [{ title, items }].
function buildLensRails(enriched, seen, field, prefix, maxRails) {
  const counts = new Map();
  for (const m of enriched) {
    for (const v of m[field] || []) {
      const val = (v || '').trim();
      if (val) counts.set(val, (counts.get(val) || 0) + 1);
    }
  }
  const candidates = [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([v]) => v);

  const rails = [];
  for (const val of candidates) {
    if (rails.length >= maxRails) break;
    const items = enriched.filter(
      (m) => !seen.has(m.id) && (m[field] || []).some((x) => (x || '').trim() === val)
    );
    if (items.length >= 2) {
      items.forEach((m) => seen.add(m.id));
      rails.push({ title: `${prefix}${val}`, items });
    }
  }
  return rails;
}

async function buildCatalog(userId, adult) {
  const { rows: media } = await query(
    `SELECT id, title, description, type, release_year, release_date, coming_soon,
            genres, actors, tags, poster_url, banner_url, video_path, duration, featured
       FROM media
      WHERE is_adult = $1
      ORDER BY created_at DESC`,
    [adult]
  );

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

  const latestByMedia = new Map();
  for (const p of progressRows) {
    if (!latestByMedia.has(p.media_id)) latestByMedia.set(p.media_id, p);
  }

  const enriched = media.map((item) => {
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
  });

  // "Próximamente": títulos sin video todavía (próximos estrenos). Van en su
  // propia sección y NO aparecen en el resto del catálogo (no se pueden ver aún).
  const comingSoon = enriched.filter((m) => m.coming_soon).slice(0, 20);
  const playable = enriched.filter((m) => !m.coming_soon);

  // Dedup ACUMULATIVO en el orden de visualización: cada título aparece en una
  // sola sección. Prioridad: continuar viendo → DESTACADOS → recién añadidos →
  // (adultos) recomendaciones por actriz/etiqueta → géneros.
  const seen = new Set();
  const take = (arr) => arr.filter((m) => !seen.has(m.id));
  const mark = (arr) => { arr.forEach((m) => seen.add(m.id)); return arr; };

  const continueWatching = mark(
    playable
      .filter((m) => m.progress && (m.progress.percent === null || m.progress.percent < 95))
      .slice(0, 20)
  );
  // Destacados PRIMERO (prioridad sobre recientes): un estelar siempre sale aquí.
  const featured = mark(take(playable).filter((m) => m.featured));
  // Recién añadidos: máximo 12; los más antiguos bajan a los carruseles de género.
  const recentlyAdded = mark(take(playable).slice(0, 12));

  // Recomendaciones inteligentes (sólo adultos): por actriz y por etiquetas.
  const discovery = adult
    ? [
        ...buildLensRails(playable, seen, 'actors', '', 6),
        ...buildLensRails(playable, seen, 'tags', '#', 6),
      ]
    : [];

  // Géneros: excluimos lo que ya salió arriba. Un título SÍ puede estar en varios
  // géneros (navegación rica), pero nunca repite lo ya destacado arriba.
  const byGenre = {};
  for (const item of take(playable)) {
    const genres = item.genres?.length ? item.genres : ['Otros'];
    for (const g of genres) (byGenre[g] ||= []).push(item);
  }
  const rails = Object.entries(byGenre).map(([genre, items]) => ({ genre, items }));

  return { continueWatching, featured, recentlyAdded, comingSoon, discovery, rails, all: playable };
}

router.get('/', async (req, res) => {
  try {
    res.json(await buildCatalog(req.user.id, false)); // catálogo normal (sin adultos)
  } catch (err) {
    console.error('[GET /api/media]', err);
    res.status(500).json({ error: 'Error al obtener el catálogo' });
  }
});

// ---------------------------------------------------------------------------
//  GET /api/media/adult — catálogo EXCLUSIVO de la sección de adultos.
//  Sólo accesible por usuarios con acceso concedido (o administradores).
// ---------------------------------------------------------------------------
router.get('/adult', async (req, res) => {
  if (!canAccessAdult(req.user)) {
    return res.status(403).json({ error: 'No tienes acceso a esta sección' });
  }
  try {
    res.json(await buildCatalog(req.user.id, true));
  } catch (err) {
    console.error('[GET /api/media/adult]', err);
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

  // Búsqueda en el catálogo normal o en el de adultos (requiere acceso).
  const wantAdult = req.query.adult === 'true';
  if (wantAdult && !canAccessAdult(req.user)) {
    return res.status(403).json({ error: 'No tienes acceso a esta sección' });
  }

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
        WHERE is_adult = $3
          AND (title ILIKE $2
           OR EXISTS (SELECT 1 FROM unnest(genres) g WHERE g ILIKE $2)
           OR EXISTS (SELECT 1 FROM unnest(actors) a WHERE a ILIKE $2)
           OR EXISTS (SELECT 1 FROM unnest(tags)   t WHERE t ILIKE $2)
           OR similarity(lower(title), lower($1)) > 0.25
           OR similarity(lower(coalesce(array_to_string(actors, ' '), '')), lower($1)) > 0.25
           OR similarity(lower(coalesce(array_to_string(genres, ' '), '')), lower($1)) > 0.30
           OR similarity(lower(coalesce(array_to_string(tags,   ' '), '')), lower($1)) > 0.30)
        ORDER BY title_match DESC, score DESC, created_at DESC
        LIMIT 40`,
      [q, like, wantAdult]
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
    const { rows: base } = await query(`SELECT genres, is_adult FROM media WHERE id = $1`, [id]);
    if (base.length === 0) return res.status(404).json({ error: 'No encontrado' });

    const genres = base[0].genres || [];
    const adult = base[0].is_adult; // los similares comparten la naturaleza (normal/adulto)

    // Buscamos otros títulos que compartan algún género (operador && de arrays).
    // Si el título no tiene géneros, devolvemos los más recientes como fallback.
    const { rows } = genres.length
      ? await query(
          `SELECT id, title, type, poster_url, banner_url, duration, genres, release_year
             FROM media
            WHERE id <> $1 AND is_adult = $3 AND genres && $2::text[]
            ORDER BY created_at DESC
            LIMIT 12`,
          [id, genres, adult]
        )
      : await query(
          `SELECT id, title, type, poster_url, banner_url, duration, genres, release_year
             FROM media
            WHERE id <> $1 AND is_adult = $2
            ORDER BY created_at DESC
            LIMIT 12`,
          [id, adult]
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
      `SELECT id, title, description, type, release_year, release_date, coming_soon,
              genres, actors, poster_url, banner_url, video_path, duration,
              transcode_status, hls_master, is_adult
         FROM media WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Título no encontrado' });

    const media = rows[0];

    // El contenido para adultos sólo lo pueden ver usuarios con acceso.
    if (media.is_adult && !canAccessAdult(req.user)) {
      return res.status(403).json({ error: 'No tienes acceso a este contenido' });
    }

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
