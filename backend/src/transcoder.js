// ----------------------------------------------------------------------------
//  transcoder.js — Transcodificación a HLS multi-resolución (streaming adaptativo).
//
//  Para cada video se generan varias "renditions" (360p, 480p, 720p, 1080p) que
//  no superen la resolución de origen, y un master playlist que las agrupa.
//  El reproductor (hls.js) elige automáticamente la calidad según el ancho de
//  banda del usuario, igual que Netflix.
//
//  Diseño:
//    - Una COLA secuencial (concurrencia 1): transcodificar es intensivo en CPU,
//      así que procesamos un video a la vez para no saturar la máquina.
//    - Cada trabajo actualiza el estado en la BD: pending -> processing -> ready/error.
//    - El MP4 original permanece intacto y sirve de respaldo (modo progresivo)
//      mientras el HLS no esté listo.
// ----------------------------------------------------------------------------
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { query } from './db.js';
import { hlsDirFor, DISKS } from './storage.js';

// Preferimos binarios por env; si no, los estáticos de npm; si no, el del sistema.
const FFMPEG  = process.env.FFMPEG_PATH  || ffmpegStatic || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || ffprobeStatic?.path || 'ffprobe';

// Catálogo de renditions (de menor a mayor). vbit/abit en kbps.
const RENDITIONS = [
  { name: '360p',  height: 360,  vbit: 800,  abit: 96 },
  { name: '480p',  height: 480,  vbit: 1400, abit: 128 },
  { name: '720p',  height: 720,  vbit: 2800, abit: 128 },
  { name: '1080p', height: 1080, vbit: 5000, abit: 192 },
];

// --- Ejecuta ffmpeg parseando su progreso (-progress pipe:1) en stdout. -----
//  onProgress(segundos) se llama con el tiempo de video ya procesado.
function runFfmpeg(args, onProgress) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args);
    let stderr = '';
    p.stdout.on('data', (d) => {
      const text = d.toString();
      // ffmpeg emite líneas "out_time=HH:MM:SS.microsegundos".
      const matches = [...text.matchAll(/out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
      const last = matches.pop();
      if (last && onProgress) {
        const secs = (+last[1]) * 3600 + (+last[2]) * 60 + parseFloat(last[3]);
        if (Number.isFinite(secs)) onProgress(secs);
      }
    });
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg salió con código ${code}: ${stderr.slice(-500)}`));
    });
  });
}

// --- Averigua ancho/alto y duración del video de origen con ffprobe. --------
async function probeVideo(input) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height:format=duration',
      '-of', 'json', input,
    ];
    const p = spawn(FFPROBE, args);
    let out = '';
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.on('error', reject);
    p.on('close', () => {
      try {
        const parsed = JSON.parse(out);
        const s = parsed.streams?.[0] || {};
        resolve({
          width: s.width || 1920,
          height: s.height || 1080,
          duration: parseFloat(parsed.format?.duration) || 0,
        });
      } catch (e) { reject(e); }
    });
  });
}

// --- Transcodifica una rendition concreta a HLS dentro de outDir/<name>/. ----
async function transcodeRendition(input, outDir, r, srcW, srcH, onProgress) {
  const dir = path.join(outDir, r.name);
  fs.mkdirSync(dir, { recursive: true });

  // Ancho proporcional al alto objetivo, forzado a número par (requisito de H.264).
  const width = Math.round((srcW * r.height) / srcH / 2) * 2;

  const args = [
    '-y', '-i', input,
    '-vf', `scale=-2:${r.height}`,
    // pix_fmt yuv420p (4:2:0): estándar web, compatible con el perfil main y
    // con todos los reproductores. Evita errores con fuentes 4:4:4 o de 10 bits.
    '-pix_fmt', 'yuv420p',
    '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'veryfast',
    '-crf', '20',
    '-maxrate', `${r.vbit}k`, '-bufsize', `${r.vbit * 2}k`,
    '-c:a', 'aac', '-b:a', `${r.abit}k`, '-ac', '2',
    '-hls_time', '6',
    '-hls_playlist_type', 'vod',
    '-hls_segment_filename', path.join(dir, 'seg_%03d.ts'),
    '-progress', 'pipe:1', '-nostats',   // progreso legible por stdout
    '-f', 'hls', path.join(dir, 'playlist.m3u8'),
  ];
  await runFfmpeg(args, onProgress);

  // Ancho par definitivo (por si el escalado real difiere en 1px).
  return { ...r, width: width || Math.round((r.height * 16) / 9) };
}

// --- Genera un "sprite" de miniaturas + un WebVTT que mapea cada instante
//     del video a su miniatura (como el preview al deslizar en Netflix). -----
async function generateThumbnails(input, outDir, duration) {
  if (!duration || duration < 2) return;

  const cols = 10;            // miniaturas por fila en el sprite
  const thumbW = 160, thumbH = 90;
  // Intervalo entre miniaturas: apuntamos a ~150 como máximo.
  const interval = Math.max(2, Math.ceil(duration / 150));
  const count = Math.max(1, Math.ceil(duration / interval));
  const rows = Math.ceil(count / cols);

  const spritePath = path.join(outDir, 'thumbnails.jpg');
  // Un frame cada `interval` s, escalado, y todo unido en una rejilla cols x rows.
  await runFfmpeg([
    '-y', '-i', input,
    '-vf', `fps=1/${interval},scale=${thumbW}:${thumbH},tile=${cols}x${rows}`,
    '-frames:v', '1', '-qscale:v', '4',
    spritePath,
  ]);

  // Construimos el WebVTT: cada cue apunta a una región del sprite (#xywh).
  const fmt = (t) => {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t - Math.floor(t)) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  };
  let vtt = 'WEBVTT\n\n';
  for (let i = 0; i < count; i++) {
    const start = i * interval;
    const end = Math.min(duration, (i + 1) * interval);
    const x = (i % cols) * thumbW;
    const y = Math.floor(i / cols) * thumbH;
    vtt += `${fmt(start)} --> ${fmt(end)}\nthumbnails.jpg#xywh=${x},${y},${thumbW},${thumbH}\n\n`;
  }
  fs.writeFileSync(path.join(outDir, 'thumbnails.vtt'), vtt);
}

// --- Escribe el master playlist que agrupa todas las renditions. ------------
function writeMasterPlaylist(outDir, results) {
  let m = '#EXTM3U\n#EXT-X-VERSION:3\n';
  for (const r of results) {
    const bandwidth = (r.vbit + r.abit) * 1000; // bits por segundo (aprox.)
    m += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${r.width}x${r.height}\n`;
    m += `${r.name}/playlist.m3u8\n`;
  }
  fs.writeFileSync(path.join(outDir, 'master.m3u8'), m);
}

// --- Progreso en tiempo real (en memoria) --------------------------------
//  key ('movie-8' / 'episode-3') -> porcentaje 0..100 mientras se procesa.
const progressMap = new Map();
const setProgress = (key, pct) => progressMap.set(key, Math.max(0, Math.min(100, pct)));

// Devuelve un objeto { 'movie-8': 42, ... } con lo que se esté procesando.
export function getTranscodeProgress() {
  return Object.fromEntries(progressMap);
}

// ===========================================================================
//  Trabajo de transcodificación de un item (película o capítulo).
//    item = { kind: 'movie'|'episode', id, videoPath }
// ===========================================================================
async function processItem(item) {
  const table = item.kind === 'movie' ? 'media' : 'episodes';
  const key = `${item.kind}-${item.id}`;
  // El HLS se genera en el MISMO disco donde está el video de origen.
  const outDir = hlsDirFor(key, item.videoPath);

  // --- Modo "sólo miniaturas": para contenido ya transcodificado que aún no
  //     tiene su sprite (backfill). No toca el estado ni re-transcodifica. ---
  if (item.thumbsOnly) {
    try {
      if (!fs.existsSync(item.videoPath)) return;
      const { duration } = await probeVideo(item.videoPath);
      fs.mkdirSync(outDir, { recursive: true });
      await generateThumbnails(item.videoPath, outDir, duration || item.duration);
      console.log(`[transcoder] miniaturas ${key} — listas`);
    } catch (err) {
      console.error(`[transcoder] miniaturas ${key} — error:`, err.message);
    }
    return;
  }

  console.log(`[transcoder] > ${key} — iniciando`);
  await query(`UPDATE ${table} SET transcode_status = 'processing' WHERE id = $1`, [item.id]);
  setProgress(key, 0);

  try {
    if (!fs.existsSync(item.videoPath)) {
      throw new Error(`Archivo no encontrado: ${item.videoPath}`);
    }

    const { width, height, duration } = await probeVideo(item.videoPath);

    // Elegimos renditions que NO superen la resolución de origen (sin upscaling).
    let chosen = RENDITIONS.filter((r) => r.height <= height);
    if (chosen.length === 0) chosen = [RENDITIONS[0]]; // fuentes muy pequeñas

    fs.mkdirSync(outDir, { recursive: true });

    const total = chosen.length;
    const results = [];
    for (let idx = 0; idx < chosen.length; idx++) {
      const r = chosen[idx];
      console.log(`[transcoder]   . ${key} -> ${r.name}`);
      // Progreso global = (renditions completas + fracción de la actual) / total.
      results.push(await transcodeRendition(item.videoPath, outDir, r, width, height, (secs) => {
        const frac = duration ? Math.min(1, secs / duration) : 0;
        setProgress(key, Math.min(99, ((idx + frac) / total) * 100));
      }));
      setProgress(key, ((idx + 1) / total) * 100);
    }

    writeMasterPlaylist(outDir, results);

    // Miniaturas para el preview de la barra (no bloquea si falla).
    try { await generateThumbnails(item.videoPath, outDir, duration); }
    catch (e) { console.error(`[transcoder] miniaturas ${key}:`, e.message); }

    const masterUrl = `/api/hls/${key}/master.m3u8`;
    await query(
      `UPDATE ${table} SET transcode_status = 'ready', hls_master = $1 WHERE id = $2`,
      [masterUrl, item.id]
    );
    console.log(`[transcoder] OK ${key} — listo (${results.map((r) => r.name).join(', ')})`);
  } catch (err) {
    console.error(`[transcoder] x ${key} — error:`, err.message);
    await query(`UPDATE ${table} SET transcode_status = 'error' WHERE id = $1`, [item.id])
      .catch(() => {});
    // Limpiamos salida parcial para no dejar HLS corrupto.
    fs.rm(outDir, { recursive: true, force: true }, () => {});
  } finally {
    // Sea éxito o error, el item ya no está "en progreso".
    progressMap.delete(key);
  }
}

// ===========================================================================
//  Cola secuencial (concurrencia 1).
// ===========================================================================
const queue = [];
let working = false;

async function drain() {
  if (working) return;
  working = true;
  while (queue.length > 0) {
    const item = queue.shift();
    await processItem(item);
  }
  working = false;
}

// Encola un item para transcodificar (evita duplicados en cola).
export function enqueueTranscode(item) {
  if (queue.some((q) => q.kind === item.kind && q.id === item.id)) return;
  queue.push(item);
  drain();
}

// Elimina los archivos HLS de un item (en cualquier disco).
export function removeHls(kind, id) {
  for (const d of DISKS) {
    fs.rm(path.join(d.path, 'hls', `${kind}-${id}`), { recursive: true, force: true }, () => {});
  }
}

// ===========================================================================
//  Resume/backfill al arrancar: reencola todo lo que no esté 'ready'.
//  Cubre reinicios a mitad y el contenido subido antes de existir HLS.
// ===========================================================================
export async function resumePendingTranscodes() {
  const { rows: movies } = await query(
    `SELECT id, video_path FROM media
      WHERE type = 'movie' AND video_path IS NOT NULL
        AND transcode_status <> 'ready'`
  );
  for (const m of movies) enqueueTranscode({ kind: 'movie', id: m.id, videoPath: m.video_path });

  const { rows: eps } = await query(
    `SELECT id, video_path FROM episodes WHERE transcode_status <> 'ready'`
  );
  for (const e of eps) enqueueTranscode({ kind: 'episode', id: e.id, videoPath: e.video_path });

  const total = movies.length + eps.length;
  if (total > 0) console.log(`[transcoder] ${total} item(s) en cola para transcodificar.`);
}

// ===========================================================================
//  Backfill de miniaturas: para contenido ya 'ready' que aún no tiene el
//  sprite de previews (subido antes de esta función). Genera sólo miniaturas.
// ===========================================================================
export async function backfillThumbnails() {
  const missing = (kind, key, videoPath, duration, id) => {
    const vtt = path.join(hlsDirFor(key, videoPath), 'thumbnails.vtt');
    if (videoPath && fs.existsSync(videoPath) && !fs.existsSync(vtt)) {
      enqueueTranscode({ kind, id, videoPath, duration, thumbsOnly: true });
      return true;
    }
    return false;
  };

  const { rows: movies } = await query(
    `SELECT id, video_path, duration FROM media
      WHERE type = 'movie' AND transcode_status = 'ready' AND video_path IS NOT NULL`
  );
  let n = 0;
  for (const m of movies) if (missing('movie', `movie-${m.id}`, m.video_path, m.duration, m.id)) n++;

  const { rows: eps } = await query(
    `SELECT id, video_path, duration FROM episodes WHERE transcode_status = 'ready'`
  );
  for (const e of eps) if (missing('episode', `episode-${e.id}`, e.video_path, e.duration, e.id)) n++;

  if (n > 0) console.log(`[transcoder] generando miniaturas para ${n} título(s) existentes.`);
}
