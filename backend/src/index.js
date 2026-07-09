// ----------------------------------------------------------------------------
//  index.js — Punto de entrada del backend Express.
// ----------------------------------------------------------------------------
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import 'dotenv/config';

import mediaRouter    from './routes/media.js';
import streamRouter   from './routes/stream.js';
import progressRouter from './routes/progress.js';
import adminRouter    from './routes/admin.js';
import authRouter     from './routes/auth.js';
import { requireAuth, requireAdmin } from './middleware/auth.js';
import { seedAdmin } from './seedAdmin.js';
import { resumePendingTranscodes, backfillThumbnails, HLS_ROOT } from './transcoder.js';

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const MEDIA_ROOT = path.resolve(process.env.MEDIA_ROOT || './media');

// --- Seguridad de cabeceras HTTP (helmet) ----------------------------------
// Desactivamos CSP y COEP aquí porque el frontend lo sirve Vite, y el video se
// consume vía proxy same-origin; helmet sigue añadiendo el resto de defensas.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// --- CORS con credenciales (cookies) ---------------------------------------
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

// --- Rutas públicas ---------------------------------------------------------
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRouter);

// --- Rutas protegidas: requieren usuario autenticado -----------------------
// Imágenes (posters/banners): visibles sólo para usuarios logueados.
app.use('/api/images', requireAuth, express.static(path.join(MEDIA_ROOT, 'images')));

// HLS (playlists .m3u8 + segmentos .ts): streaming adaptativo, sólo autenticados.
app.use('/api/hls', requireAuth, express.static(HLS_ROOT, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    } else if (filePath.endsWith('.ts')) {
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // los segmentos no cambian
    }
  },
}));

app.use('/api/media',    requireAuth, mediaRouter);
app.use('/api/stream',   requireAuth, streamRouter);
app.use('/api/progress', requireAuth, progressRouter);

// --- Rutas de administración: requieren rol 'admin' ------------------------
app.use('/api/admin', requireAdmin, adminRouter);

// --- Manejo de errores (incluye errores de subida de multer) ---------------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'El archivo supera el tamaño máximo permitido (MAX_UPLOAD_GB).' });
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Arranque: sembramos el admin y levantamos el servidor.
seedAdmin()
  .catch((e) => console.error('[seedAdmin] Error:', e))
  .finally(() => {
    const server = app.listen(PORT, () => {
      console.log(`🎬  VOD backend escuchando en http://localhost:${PORT}`);
    });

    // --- Timeouts pensados para subidas grandes (videos de varios GB) -------
    //  Node corta por defecto las peticiones a los 5 min (requestTimeout) y el
    //  socket inactivo a los 2 min. Los desactivamos para que una subida lenta
    //  no se interrumpa a mitad (p.ej. al 73%).
    server.requestTimeout = 0;   // sin límite de duración por petición
    server.timeout = 0;          // sin timeout de socket inactivo
    server.headersTimeout = 0;   // sin límite para recibir las cabeceras
    // Mantener vivas las conexiones un poco más que un proxy inverso típico.
    server.keepAliveTimeout = 120000;

    // Reencola transcodificaciones pendientes (reinicios + contenido existente).
    resumePendingTranscodes()
      .then(() => backfillThumbnails())   // genera miniaturas faltantes
      .catch((e) => console.error('[transcoder] resume:', e));
  });
