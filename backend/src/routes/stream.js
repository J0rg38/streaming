// ----------------------------------------------------------------------------
//  routes/stream.js — Streaming de video con soporte de rangos HTTP (206).
//
//  GET /api/stream?path=<video_path>
//
//  La MISMA lógica sirve películas y capítulos: el frontend pasa el video_path
//  correspondiente (media.video_path para película, episode.video_path para serie).
//
//  Seguridad: sólo se sirven archivos que estén DENTRO de MEDIA_ROOT. Esto evita
//  path traversal (ej. ?path=/etc/passwd).
// ----------------------------------------------------------------------------
import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

const MEDIA_ROOT = process.env.MEDIA_ROOT
  ? path.resolve(process.env.MEDIA_ROOT)
  : path.resolve('/');

// Tipos MIME más comunes para video. Ajusta según tus formatos.
const MIME = {
  '.mp4':  'video/mp4',
  '.mkv':  'video/x-matroska',
  '.webm': 'video/webm',
  '.mov':  'video/quicktime',
  '.avi':  'video/x-msvideo',
};

router.get('/', (req, res) => {
  const requested = req.query.path;
  if (!requested || typeof requested !== 'string') {
    return res.status(400).json({ error: 'Falta el parámetro path' });
  }

  // Resolvemos la ruta absoluta y verificamos que quede dentro de MEDIA_ROOT.
  const absolute = path.resolve(requested);
  if (MEDIA_ROOT !== path.resolve('/') && !absolute.startsWith(MEDIA_ROOT + path.sep)) {
    return res.status(403).json({ error: 'Ruta fuera del directorio permitido' });
  }

  // Comprobamos que el archivo exista.
  let stat;
  try {
    stat = fs.statSync(absolute);
  } catch {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  const fileSize = stat.size;
  const mime = MIME[path.extname(absolute).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range;

  // --- Sin cabecera Range: enviamos el archivo completo (200) --------------
  if (!range) {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
    });
    return fs.createReadStream(absolute).pipe(res);
  }

  // --- Con Range: enviamos sólo el trozo pedido (206 Partial Content) ------
  // Formato de la cabecera: "bytes=START-END" (END puede venir vacío).
  const match = /bytes=(\d*)-(\d*)/.exec(range);
  if (!match) {
    return res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
  }

  let start = match[1] ? parseInt(match[1], 10) : 0;
  let end   = match[2] ? parseInt(match[2], 10) : fileSize - 1;

  // Validación de límites: si el rango es inválido -> 416.
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= fileSize) {
    return res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
  }

  const chunkSize = end - start + 1;

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize,
    'Content-Type': mime,
  });

  // Streaming del trozo. El navegador irá pidiendo más rangos conforme avanza.
  fs.createReadStream(absolute, { start, end }).pipe(res);
});

export default router;
