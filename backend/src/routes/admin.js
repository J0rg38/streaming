// ----------------------------------------------------------------------------
//  routes/admin.js — Panel de administración: alta de contenido con subida
//  de archivos (multer). El backend guarda los videos/imágenes dentro de
//  MEDIA_ROOT de forma ordenada y registra todo en PostgreSQL.
//
//  Rutas:
//    POST   /api/admin/movies                     -> crea película + sube video
//    POST   /api/admin/series                     -> crea serie (metadatos)
//    POST   /api/admin/series/:id/episodes        -> añade capítulo + sube video
//    GET    /api/admin/series                      -> lista de series (para el UI)
//    DELETE /api/admin/media/:id                   -> elimina título (y su carpeta)
//    DELETE /api/admin/episodes/:id                -> elimina capítulo
// ----------------------------------------------------------------------------
import { Router } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { query } from '../db.js';
import { enqueueTranscode, removeHls, getTranscodeProgress } from '../transcoder.js';
import { getDisk, listDisksUsage, DISKS, diskForPath } from '../storage.js';
import { canAccessAdult } from '../middleware/auth.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Tamaño máximo por archivo de video, configurable con MAX_UPLOAD_GB.
// Por defecto 50 GB para pruebas locales (ajústalo al pasar a producción).
const MAX_UPLOAD_GB = Number(process.env.MAX_UPLOAD_GB) || 50;
const MAX_FILE_SIZE = MAX_UPLOAD_GB * 1024 * 1024 * 1024;

// Limpia el nombre de archivo para evitar caracteres problemáticos.
const safeName = (name) =>
  name.replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(-120);

// Nombre único: <timestamp>-<nombre-limpio>
const uniqueName = (original) => `${Date.now()}-${safeName(original)}`;

// --- Parseo de géneros: acepta "Acción, Drama" o ["Acción","Drama"] ---------
const parseGenres = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return raw.split(',').map((g) => g.trim()).filter(Boolean);
};

// ¿La lista de géneros marca el título como contenido para adultos?
const isAdultGenres = (genres) =>
  (genres || []).some((g) => ['adulto', 'adultos'].includes(String(g).trim().toLowerCase()));

// ===========================================================================
//  Multer — almacenamiento en disco. El disco destino se elige con ?disk=<id>
//  (query param), disponible en las callbacks de destino.
// ===========================================================================

// Crea (si no existe) y devuelve una subcarpeta dentro del disco elegido.
const diskDir = (req, sub) => {
  const dir = path.join(getDisk(req.query.disk).path, sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

// Para PELÍCULAS: el video va a /movies, poster/banner a /images (del disco elegido).
const movieStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, diskDir(req, file.fieldname === 'video' ? 'movies' : 'images')),
  filename: (_req, file, cb) => cb(null, uniqueName(file.originalname)),
});
const movieUpload = multer({ storage: movieStorage, limits: { fileSize: MAX_FILE_SIZE } });

// Para SERIES/edición (metadatos): sólo imágenes (poster/banner) a /images.
const imageStorage = multer.diskStorage({
  destination: (req, _file, cb) => cb(null, diskDir(req, 'images')),
  filename: (_req, file, cb) => cb(null, uniqueName(file.originalname)),
});
const imageUpload = multer({ storage: imageStorage });

// Para CAPÍTULOS: el video va a /series/<mediaId>/ del disco elegido.
const episodeStorage = multer.diskStorage({
  destination: (req, _file, cb) => cb(null, diskDir(req, path.join('series', String(req.params.id)))),
  filename: (_req, file, cb) => cb(null, uniqueName(file.originalname)),
});
const episodeUpload = multer({ storage: episodeStorage, limits: { fileSize: MAX_FILE_SIZE } });

// URL pública para una imagen guardada (servida por express.static en /api/images).
const imageUrl = (file) => (file ? `/api/images/${file.filename}` : null);

// Borra un archivo de imagen (póster/banner) subido, de todos los discos.
// Sólo actúa sobre imágenes servidas por nosotros (/api/images/...), no URLs externas.
const removeImageByUrl = (url) => {
  if (!url || !url.startsWith('/api/images/')) return;
  const name = path.basename(url);
  for (const d of DISKS) {
    fs.rm(path.join(d.path, 'images', name), { force: true }, () => {});
  }
};

// ===========================================================================
//  POST /api/admin/movies  — crea una película y sube su archivo de video.
//  Campos (multipart/form-data):
//    text : title, description, release_year, genres
//    files: video (obligatorio), poster (opcional), banner (opcional)
// ===========================================================================
router.post(
  '/movies',
  movieUpload.fields([
    { name: 'video',  maxCount: 1 },
    { name: 'poster', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { title, description, release_year, duration } = req.body;
      const videoFile = req.files?.video?.[0];

      if (!title || !videoFile) {
        return res.status(400).json({ error: 'title y archivo de video son obligatorios' });
      }

      const posterUrl = imageUrl(req.files?.poster?.[0]) || 'https://picsum.photos/seed/movie/300/450';
      const bannerUrl = imageUrl(req.files?.banner?.[0]) || posterUrl;

      const genres = parseGenres(req.body.genres);
      const { rows } = await query(
        `INSERT INTO media (title, description, type, release_year, genres, actors, tags,
                            poster_url, banner_url, video_path, duration, is_adult)
         VALUES ($1, $2, 'movie', $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, title, type`,
        [
          title,
          description || null,
          release_year ? Number(release_year) : null,
          genres,
          parseGenres(req.body.actors), // misma lógica: separados por coma
          parseGenres(req.body.tags),
          posterUrl,
          bannerUrl,
          videoFile.path, // ruta absoluta dentro de MEDIA_ROOT
          duration ? Math.round(Number(duration)) : null,
          isAdultGenres(genres),
        ]
      );

      // Encolamos la transcodificación a HLS (en segundo plano). El MP4 original
      // ya sirve como respaldo progresivo mientras tanto.
      enqueueTranscode({ kind: 'movie', id: rows[0].id, videoPath: videoFile.path });

      res.status(201).json(rows[0]);
    } catch (err) {
      console.error('[POST /api/admin/movies]', err);
      res.status(500).json({ error: 'Error al crear la película' });
    }
  }
);

// ===========================================================================
//  POST /api/admin/series  — crea una serie (sin video; los videos van en
//  los capítulos). Acepta poster/banner opcionales.
// ===========================================================================
router.post(
  '/series',
  imageUpload.fields([
    { name: 'poster', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { title, description, release_year } = req.body;
      if (!title) return res.status(400).json({ error: 'title es obligatorio' });

      const posterUrl = imageUrl(req.files?.poster?.[0]) || 'https://picsum.photos/seed/series/300/450';
      const bannerUrl = imageUrl(req.files?.banner?.[0]) || posterUrl;

      const genres = parseGenres(req.body.genres);
      const { rows } = await query(
        `INSERT INTO media (title, description, type, release_year, genres, actors, tags,
                            poster_url, banner_url, video_path, is_adult)
         VALUES ($1, $2, 'series', $3, $4, $5, $6, $7, $8, NULL, $9)
         RETURNING id, title, type`,
        [
          title,
          description || null,
          release_year ? Number(release_year) : null,
          genres,
          parseGenres(req.body.actors),
          parseGenres(req.body.tags),
          posterUrl,
          bannerUrl,
          isAdultGenres(genres),
        ]
      );

      res.status(201).json(rows[0]);
    } catch (err) {
      console.error('[POST /api/admin/series]', err);
      res.status(500).json({ error: 'Error al crear la serie' });
    }
  }
);

// ===========================================================================
//  POST /api/admin/series/:id/episodes — añade un capítulo a una serie.
//  Campos (multipart): season_number, episode_number, title, duration + video
// ===========================================================================
router.post('/series/:id/episodes', episodeUpload.single('video'), async (req, res) => {
  const mediaId = Number(req.params.id);
  try {
    const { season_number, episode_number, title, duration } = req.body;
    const videoFile = req.file;

    if (!videoFile || !season_number || !episode_number) {
      return res.status(400).json({
        error: 'season_number, episode_number y archivo de video son obligatorios',
      });
    }

    // Verificamos que el media exista y sea una serie.
    const { rows: check } = await query(
      `SELECT type FROM media WHERE id = $1`, [mediaId]
    );
    if (check.length === 0) return res.status(404).json({ error: 'Serie no encontrada' });
    if (check[0].type !== 'series') return res.status(400).json({ error: 'El título no es una serie' });

    const { rows } = await query(
      `INSERT INTO episodes (media_id, season_number, episode_number, title, duration, video_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, season_number, episode_number, title`,
      [
        mediaId,
        Number(season_number),
        Number(episode_number),
        title || null,
        duration ? Number(duration) : null,
        videoFile.path,
      ]
    );

    // Encolamos la transcodificación a HLS del capítulo (en segundo plano).
    enqueueTranscode({ kind: 'episode', id: rows[0].id, videoPath: videoFile.path });

    res.status(201).json(rows[0]);
  } catch (err) {
    // Violación de UNIQUE (temporada+episodio duplicado)
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe ese capítulo (temporada + número)' });
    }
    console.error('[POST episodes]', err);
    res.status(500).json({ error: 'Error al añadir el capítulo' });
  }
});

// ===========================================================================
//  GET /api/admin/series — lista de series con su número de capítulos
//  (para poblar el selector del panel de administración).
// ===========================================================================
router.get('/series', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT m.id, m.title,
              COUNT(e.id)::int AS episode_count
         FROM media m
         LEFT JOIN episodes e ON e.media_id = m.id
        WHERE m.type = 'series'
        GROUP BY m.id
        ORDER BY m.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/admin/series]', err);
    res.status(500).json({ error: 'Error al listar series' });
  }
});

// ===========================================================================
//  GET /api/admin/disks — discos disponibles con capacidad y espacio libre.
// ===========================================================================
router.get('/disks', async (_req, res) => {
  try {
    res.json(await listDisksUsage());
  } catch (err) {
    console.error('[GET /api/admin/disks]', err);
    res.status(500).json({ error: 'Error al leer los discos' });
  }
});

// ===========================================================================
//  GET /api/admin/transcode-progress — progreso en tiempo real (en memoria).
//  Devuelve { 'movie-8': 42, 'episode-3': 87, ... } con lo que se procesa ahora.
// ===========================================================================
router.get('/transcode-progress', (_req, res) => {
  // Redondeamos a entero para el UI.
  const raw = getTranscodeProgress();
  const out = {};
  for (const [k, v] of Object.entries(raw)) out[k] = Math.round(v);
  res.json(out);
});

// ===========================================================================
//  GET /api/admin/library — biblioteca PAGINADA para el panel de gestión.
//    Query: page, pageSize, type ('all'|'movie'|'series'), q (búsqueda).
//    Devuelve { items, total, page, pageSize, movieCount, seriesCount }.
//    Así no se carga todo el catálogo de golpe cuando hay muchos títulos.
// ===========================================================================
router.get('/library', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 12));
  const offset = (page - 1) * pageSize;
  const type = ['movie', 'series'].includes(req.query.type) ? req.query.type : 'all';
  const adult = req.query.adult === 'true'; // biblioteca normal (false) o +18 (true)
  const q = (req.query.q || '').trim();
  const like = `%${q}%`;

  // La biblioteca +18 sólo la gestiona quien tenga acceso adulto (aunque sea admin).
  if (adult && !canAccessAdult(req.user)) {
    return res.status(403).json({ error: 'No tienes acceso a la sección de adultos' });
  }

  try {
    // Construimos el WHERE dinámico (adulto + tipo + búsqueda por título/género/actor).
    const where = ['m.is_adult = $1'];
    const params = [adult];
    let i = 2;
    if (type !== 'all') { where.push(`m.type = $${i++}`); params.push(type); }
    if (q) {
      where.push(
        `(m.title ILIKE $${i}
          OR EXISTS (SELECT 1 FROM unnest(m.genres) g WHERE g ILIKE $${i})
          OR EXISTS (SELECT 1 FROM unnest(m.actors) a WHERE a ILIKE $${i})
          OR EXISTS (SELECT 1 FROM unnest(m.tags)   t WHERE t ILIKE $${i}))`
      );
      params.push(like); i++;
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    // Total que cumple el filtro (para la paginación).
    const { rows: cnt } = await query(`SELECT COUNT(*)::int AS total FROM media m ${whereSql}`, params);
    const total = cnt[0].total;

    // Conteos por tipo dentro del contexto actual (normal o +18).
    const { rows: byType } = await query(
      `SELECT type, COUNT(*)::int AS c FROM media WHERE is_adult = $1 GROUP BY type`,
      [adult]
    );
    const movieCount = byType.find((r) => r.type === 'movie')?.c || 0;
    const seriesCount = byType.find((r) => r.type === 'series')?.c || 0;

    // Página de resultados (películas y series unificadas). `sample_path` es la
    // ruta de un video (la película, o el 1er capítulo si es serie) para saber
    // en qué disco está guardado.
    const { rows: items } = await query(
      `SELECT m.id, m.title, m.type, m.release_year, m.genres, m.poster_url,
              m.duration, m.transcode_status, m.featured, m.created_at,
              COALESCE(ec.episode_count, 0) AS episode_count,
              COALESCE(ec.season_count, 0)  AS season_count,
              COALESCE(m.video_path,
                (SELECT video_path FROM episodes WHERE media_id = m.id ORDER BY id LIMIT 1)
              ) AS sample_path
         FROM media m
         LEFT JOIN (
           SELECT media_id, COUNT(*)::int AS episode_count,
                  COUNT(DISTINCT season_number)::int AS season_count
             FROM episodes GROUP BY media_id
         ) ec ON ec.media_id = m.id
         ${whereSql}
        ORDER BY m.created_at DESC
        LIMIT $${i} OFFSET $${i + 1}`,
      [...params, pageSize, offset]
    );

    // Añadimos el disco donde está guardado cada título.
    const withDisk = items.map(({ sample_path, ...it }) => {
      const d = sample_path ? diskForPath(sample_path) : null;
      return { ...it, disk: d ? { id: d.id, label: d.label } : null };
    });

    res.json({ items: withDisk, total, page, pageSize, movieCount, seriesCount });
  } catch (err) {
    console.error('[GET /api/admin/library]', err);
    res.status(500).json({ error: 'Error al cargar la biblioteca' });
  }
});

// ===========================================================================
//  PATCH /api/admin/media/:id/featured — marca/desmarca un título como estelar.
// ===========================================================================
router.patch('/media/:id/featured', async (req, res) => {
  const id = Number(req.params.id);
  const featured = Boolean(req.body?.featured);
  try {
    const { rows } = await query(
      `UPDATE media SET featured = $1 WHERE id = $2 RETURNING id, featured`,
      [featured, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /api/admin/media/:id/featured]', err);
    res.status(500).json({ error: 'Error al actualizar destacado' });
  }
});

// ===========================================================================
//  PATCH /api/admin/media/:id — edita los datos de un título.
//    Campos de texto: title, description, release_year, genres, actors, tags.
//    Archivos opcionales: poster, banner (multipart). No cambia el video.
// ===========================================================================
router.patch(
  '/media/:id',
  imageUpload.fields([
    { name: 'poster', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
  ]),
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const b = req.body || {};
      const sets = [];
      const params = [];
      let i = 1;

      // Campos de texto (sólo se actualizan si vienen en el body).
      if (b.title !== undefined)        { sets.push(`title = $${i++}`); params.push(b.title); }
      if (b.description !== undefined)  { sets.push(`description = $${i++}`); params.push(b.description || null); }
      if (b.release_year !== undefined) { sets.push(`release_year = $${i++}`); params.push(b.release_year ? Number(b.release_year) : null); }
      if (b.genres !== undefined) {
        const genres = parseGenres(b.genres);
        sets.push(`genres = $${i++}`); params.push(genres);
        // Al cambiar los géneros, recalculamos si es contenido para adultos.
        sets.push(`is_adult = $${i++}`); params.push(isAdultGenres(genres));
      }
      if (b.actors !== undefined)       { sets.push(`actors = $${i++}`); params.push(parseGenres(b.actors)); }
      if (b.tags !== undefined)         { sets.push(`tags = $${i++}`); params.push(parseGenres(b.tags)); }

      // Imágenes nuevas (si se subieron).
      const posterFile = req.files?.poster?.[0];
      const bannerFile = req.files?.banner?.[0];
      if (posterFile) { sets.push(`poster_url = $${i++}`); params.push(imageUrl(posterFile)); }
      if (bannerFile) { sets.push(`banner_url = $${i++}`); params.push(imageUrl(bannerFile)); }

      if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

      params.push(id);
      const { rows } = await query(
        `UPDATE media SET ${sets.join(', ')} WHERE id = $${i}
         RETURNING id, title, type`,
        params
      );
      if (rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
      res.json(rows[0]);
    } catch (err) {
      console.error('[PATCH /api/admin/media/:id]', err);
      res.status(500).json({ error: 'Error al editar el título' });
    }
  }
);

// ===========================================================================
//  GET /api/admin/media/:id — detalle para gestión (serie con sus capítulos).
// ===========================================================================
router.get('/media/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await query(
      `SELECT id, title, type, description, release_year, genres, actors, tags,
              poster_url, banner_url
         FROM media WHERE id = $1`, [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No encontrado' });

    const media = rows[0];
    if (media.type === 'movie') return res.json(media);

    const { rows: episodes } = await query(
      `SELECT id, season_number, episode_number, title, duration, transcode_status
         FROM episodes WHERE media_id = $1
        ORDER BY season_number, episode_number`,
      [id]
    );
    res.json({ ...media, episodes });
  } catch (err) {
    console.error('[GET /api/admin/media/:id]', err);
    res.status(500).json({ error: 'Error al cargar el detalle' });
  }
});

// ===========================================================================
//  GESTIÓN DE USUARIOS
// ===========================================================================

// GET /api/admin/users — lista de usuarios registrados.
router.get('/users', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, email, display_name, role, adult_access, created_at
         FROM users ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/admin/users]', err);
    res.status(500).json({ error: 'Error al listar usuarios' });
  }
});

// POST /api/admin/users — crea un usuario (el admin define el rol).
router.post('/users', async (req, res) => {
  const { email, password, name, role, adult } = req.body || {};

  if (!EMAIL_RE.test(email || '')) {
    return res.status(400).json({ error: 'Email no válido' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }
  const finalRole = role === 'admin' ? 'admin' : 'user';
  const adultAccess = adult === true || adult === 'true';

  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, display_name, role, adult_access)
       VALUES (lower($1), $2, $3, $4, $5)
       RETURNING id, email, display_name, role, adult_access, created_at`,
      [email, hash, name || null, finalRole, adultAccess]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese email ya está registrado' });
    console.error('[POST /api/admin/users]', err);
    res.status(500).json({ error: 'Error al crear el usuario' });
  }
});

// PATCH /api/admin/users/:id — edita nombre, email, contraseña y/o rol.
router.patch('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { email, name, password, role } = req.body || {};

  try {
    const { rows: existing } = await query(`SELECT role FROM users WHERE id = $1`, [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Validaciones de rol (mismas salvaguardas que en el cambio de rol simple).
    if (role && !['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Rol no válido' });
    }
    if (role && id === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'No puedes quitarte tu propio rol de administrador' });
    }
    if (role === 'user' && existing[0].role === 'admin') {
      const { rows } = await query(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'`);
      if (rows[0].n <= 1) return res.status(400).json({ error: 'Debe existir al menos un administrador' });
    }
    if (email && !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Email no válido' });
    }
    if (password && password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    // Construimos el UPDATE dinámicamente según qué campos llegaron.
    const sets = [];
    const params = [];
    let i = 1;
    if (email !== undefined)          { sets.push(`email = lower($${i++})`); params.push(email); }
    if (name !== undefined)           { sets.push(`display_name = $${i++}`); params.push(name || null); }
    if (role !== undefined)           { sets.push(`role = $${i++}`);         params.push(role); }
    if (req.body.adult !== undefined) { sets.push(`adult_access = $${i++}`);  params.push(req.body.adult === true || req.body.adult === 'true'); }
    if (password)                     { sets.push(`password_hash = $${i++}`); params.push(await bcrypt.hash(password, 12)); }

    if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

    params.push(id);
    const { rows } = await query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING id, email, display_name, role, adult_access, created_at`,
      params
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese email ya está en uso' });
    console.error('[PATCH /api/admin/users/:id]', err);
    res.status(500).json({ error: 'Error al editar el usuario' });
  }
});

// PATCH /api/admin/users/:id/role — cambia el rol (user <-> admin).
router.patch('/users/:id/role', async (req, res) => {
  const id = Number(req.params.id);
  const { role } = req.body || {};

  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Rol no válido' });
  }
  // No permitimos que un admin cambie su propio rol (evita auto-bloqueo).
  if (id === req.user.id) {
    return res.status(400).json({ error: 'No puedes cambiar tu propio rol' });
  }

  try {
    // Evitamos quedarnos sin ningún administrador.
    if (role === 'user') {
      const { rows } = await query(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'`);
      const target = await query(`SELECT role FROM users WHERE id = $1`, [id]);
      if (target.rows[0]?.role === 'admin' && rows[0].n <= 1) {
        return res.status(400).json({ error: 'Debe existir al menos un administrador' });
      }
    }

    const { rows } = await query(
      `UPDATE users SET role = $1 WHERE id = $2
       RETURNING id, email, display_name, role`,
      [role, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /api/admin/users/:id/role]', err);
    res.status(500).json({ error: 'Error al cambiar el rol' });
  }
});

// DELETE /api/admin/users/:id — elimina un usuario (y su progreso, en cascada).
router.delete('/users/:id', async (req, res) => {
  const id = Number(req.params.id);

  // No permitimos que un admin se elimine a sí mismo.
  if (id === req.user.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
  }

  try {
    // Evitamos borrar al último administrador.
    const target = await query(`SELECT role FROM users WHERE id = $1`, [id]);
    if (target.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (target.rows[0].role === 'admin') {
      const { rows } = await query(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'`);
      if (rows[0].n <= 1) {
        return res.status(400).json({ error: 'No puedes eliminar al último administrador' });
      }
    }

    await query(`DELETE FROM users WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/admin/users/:id]', err);
    res.status(500).json({ error: 'Error al eliminar el usuario' });
  }
});

// ===========================================================================
//  DELETE /api/admin/media/:id — elimina un título y sus archivos en disco.
// ===========================================================================
router.delete('/media/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    // Recogemos rutas de archivos antes de borrar (para limpiar el disco).
    const { rows: media } = await query(
      `SELECT type, video_path, poster_url, banner_url FROM media WHERE id = $1`, [id]
    );
    if (media.length === 0) return res.status(404).json({ error: 'No encontrado' });

    const { rows: eps } = await query(
      `SELECT id, video_path FROM episodes WHERE media_id = $1`, [id]
    );

    // Borrado en BD (ON DELETE CASCADE limpia episodes y watch_progress).
    await query(`DELETE FROM media WHERE id = $1`, [id]);

    // Borrado de archivos de video físicos (best-effort).
    const paths = [media[0].video_path, ...eps.map((e) => e.video_path)].filter(Boolean);
    for (const p of paths) {
      fs.rm(p, { force: true }, () => {});
    }
    // Borrado del póster y banner subidos (limpieza completa).
    removeImageByUrl(media[0].poster_url);
    removeImageByUrl(media[0].banner_url);

    // Carpeta de la serie, si existía (en cualquier disco).
    for (const d of DISKS) {
      fs.rm(path.join(d.path, 'series', String(id)), { recursive: true, force: true }, () => {});
    }

    // Borrado de los HLS asociados (película y cada capítulo).
    if (media[0].type === 'movie') removeHls('movie', id);
    for (const e of eps) removeHls('episode', e.id);

    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE media]', err);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

// ===========================================================================
//  DELETE /api/admin/episodes/:id — elimina un capítulo y su archivo.
// ===========================================================================
router.delete('/episodes/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await query(
      `DELETE FROM episodes WHERE id = $1 RETURNING video_path`, [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    if (rows[0].video_path) fs.rm(rows[0].video_path, { force: true }, () => {});
    removeHls('episode', id); // limpia el HLS del capítulo
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE episode]', err);
    res.status(500).json({ error: 'Error al eliminar el capítulo' });
  }
});

export default router;
