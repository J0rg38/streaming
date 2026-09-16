// ----------------------------------------------------------------------------
//  marks.js — ¿Dónde empiezan los créditos finales?
//
//  Con ese dato el reproductor puede dar por vista una película sin obligar a
//  tragarse los créditos, encogerse a una esquina y ofrecer recomendaciones,
//  igual que las plataformas grandes.
//
//  El punto se averigua por CUATRO capas, de menos a más fiable. La más fiable
//  disponible gana y queda anotada en `marks_source`:
//
//    0. Estimación por duración  — instantánea, sirve para todo el catálogo
//       desde el primer día. NO se guarda: se calcula al vuelo (así, si se
//       afina la fórmula, mejora todo el catálogo de golpe).
//    1. Capítulos del contenedor — 'chapters'. Gratis (ffprobe sólo lee
//       cabeceras) y exacta cuando el archivo trae un capítulo "End Credits".
//    2. Luminancia con ffmpeg    — 'auto'. Los créditos son un tramo largo y
//       oscuro que llega hasta el final. Se analizan SÓLO los fotogramas clave
//       del último tercio, así que cuesta segundos, no minutos.
//    3. Marca manual             — 'manual'. Un clic en el reproductor. NUNCA
//       la pisa una detección automática.
//
//  Que la capa 0 se equivoque no rompe nada: el reproductor no detiene el
//  vídeo al llegar al punto, lo encoge y deja un botón "Seguir viendo".
// ----------------------------------------------------------------------------
import { spawn } from 'child_process';
import fs from 'fs';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { query } from './db.js';
import { isTranscodeBusy } from './transcoder.js';

const FFMPEG  = process.env.FFMPEG_PATH  || ffmpegStatic || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || ffprobeStatic?.path || 'ffprobe';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ===========================================================================
//  Capa 0 — estimación por duración.
// ===========================================================================
//  Márgenes: una película deja entre 90 s y 5 min de créditos (5% de su
//  duración); un capítulo, entre 45 s y 2 min (4%). Por debajo de 5 minutos de
//  metraje no estimamos nada: cualquier recorte se comería contenido real.
export function estimateCreditsStart(duration, kind = 'movie') {
  const d = Number(duration) || 0;
  if (d < 300) return null;
  const margin = kind === 'episode' ? clamp(d * 0.04, 45, 120) : clamp(d * 0.05, 90, 300);
  return Math.max(1, Math.round(d - margin));
}

// Punto EFECTIVO que consume el reproductor: la marca guardada si la hay y es
// coherente; si no, la estimación. Devuelve null si no se puede saber nada.
export function creditsAtFor({ credits_start, duration, kind = 'movie' }) {
  const d = Number(duration) || 0;
  const explicit = Number(credits_start);
  // Una marca sólo vale si cae dentro del metraje y deja algo de cola.
  if (Number.isFinite(explicit) && explicit > 0 && (!d || explicit < d - 2)) {
    return Math.round(explicit);
  }
  return estimateCreditsStart(d, kind);
}

// ===========================================================================
//  ffprobe / ffmpeg
// ===========================================================================
function probeJson(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFPROBE, args);
    let out = '';
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.on('error', reject);
    p.on('close', () => {
      try { resolve(JSON.parse(out)); } catch (e) { reject(e); }
    });
  });
}

// Duración real del archivo (la del formulario de subida puede faltar o mentir).
export async function probeDuration(videoPath) {
  const parsed = await probeJson([
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', videoPath,
  ]);
  return Math.round(parseFloat(parsed.format?.duration) || 0);
}

// ===========================================================================
//  Capa 1 — capítulos del contenedor.
// ===========================================================================
const CREDITS_RE = /cr[eé]dit|cr[eé]ditos|end\s*roll|closing/i;

async function creditsFromChapters(videoPath, duration) {
  const parsed = await probeJson([
    '-v', 'error', '-show_chapters', '-of', 'json', videoPath,
  ]);
  const chapters = parsed.chapters || [];
  if (chapters.length === 0) return null;

  // El ÚLTIMO capítulo que se llame "créditos": algunas ediciones traen varios
  // (créditos de apertura y de cierre) y el que nos interesa es el final.
  for (let i = chapters.length - 1; i >= 0; i--) {
    const title = chapters[i].tags?.title || '';
    if (!CREDITS_RE.test(title)) continue;
    const start = Math.round(parseFloat(chapters[i].start_time) || 0);
    if (isSaneCreditsPoint(start, duration)) return start;
  }
  return null;
}

// ===========================================================================
//  Capa 2 — detección por luminancia sobre los fotogramas clave.
// ===========================================================================
//  ffmpeg descodifica sólo los fotogramas clave (-skip_frame nokey) del último
//  tercio, reduce cada uno a 128x72 y publica su luminancia media (YAVG, 0-255)
//  con el filtro `metadata`. Los créditos son un tramo largo por debajo del
//  umbral que llega hasta el final del archivo.
const DARK_YAVG = 42;   // por debajo de esto consideramos "pantalla oscura"
const MIN_RUN_S = 45;   // un tramo oscuro más corto no son créditos
const SCAN_FROM = 0.68; // se analiza a partir del 68% del metraje

function readLumaSamples(videoPath, from) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-skip_frame', 'nokey',            // sólo fotogramas clave: rapidísimo
      '-ss', String(from), '-i', videoPath,
      '-an', '-sn',                      // ni audio ni subtítulos
      '-vf', 'scale=128:72,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-',
      '-f', 'null', '-',
    ];
    const p = spawn(FFMPEG, args);
    let out = '';
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.on('error', reject);
    p.on('close', () => {
      const samples = [];
      let t = null;
      for (const line of out.split('\n')) {
        const mt = line.match(/pts_time:([\d.]+)/);
        if (mt) { t = parseFloat(mt[1]); continue; }
        const my = line.match(/YAVG=([\d.]+)/);
        if (my && t != null) { samples.push({ t, y: parseFloat(my[1]) }); t = null; }
      }
      resolve(samples);
    });
  });
}

async function creditsFromLuma(videoPath, duration) {
  const from = Math.floor(duration * SCAN_FROM);
  const samples = await readLumaSamples(videoPath, from);
  if (samples.length < 8) return null;

  // Según la versión de ffmpeg, `-ss` antes de `-i` puede reiniciar los tiempos
  // a cero o conservar los del archivo. Lo deducimos de la primera muestra en
  // vez de suponerlo, que es lo que evita un desfase de minutos.
  const offset = samples[0].t < from / 2 ? from : 0;
  for (const s of samples) s.t += offset;

  // Se permiten hasta 3 muestras claras al final (logo de distribuidora, cartón
  // final) antes de exigir que la cola sea oscura.
  let end = samples.length - 1;
  for (let trimmed = 0; end > 0 && samples[end].y > DARK_YAVG && trimmed < 3; trimmed++) end--;
  if (samples[end].y > DARK_YAVG) return null;   // el final no es oscuro: nos rendimos

  let start = end;
  while (start > 0 && samples[start - 1].y <= DARK_YAVG) start--;

  const runStart = Math.round(samples[start].t);
  if (samples[end].t - samples[start].t < MIN_RUN_S) return null;
  return isSaneCreditsPoint(runStart, duration) ? runStart : null;
}

// Un punto de créditos creíble: en el último 40% y sin comerse el final.
function isSaneCreditsPoint(secs, duration) {
  if (!Number.isFinite(secs) || !duration) return false;
  return secs >= duration * 0.60 && secs <= duration - 20;
}

// ===========================================================================
//  Análisis de UN título: duración fiable + capítulos + luminancia.
// ===========================================================================
async function analyzeOne({ kind, id, videoPath, duration }) {
  const table = kind === 'movie' ? 'media' : 'episodes';

  if (!videoPath || !fs.existsSync(videoPath)) {
    // Sin archivo no hay nada que analizar; lo damos por visto para no
    // reintentarlo en cada arranque.
    await query(`UPDATE ${table} SET marks_source = 'auto' WHERE id = $1`, [id]);
    return false;
  }

  // --- Duración -------------------------------------------------------------
  //  Es el cimiento de todo (progreso, "visto", estimación de créditos) y hasta
  //  ahora sólo se guardaba si el NAVEGADOR podía leerla al subir el archivo,
  //  cosa que con MKV casi nunca ocurre. La medimos con ffprobe y la corregimos.
  let dur = Number(duration) || 0;
  if (!dur) {
    dur = await probeDuration(videoPath).catch(() => 0);
    if (dur) await query(`UPDATE ${table} SET duration = $1 WHERE id = $2`, [dur, id]);
  }
  if (!dur) {
    await query(`UPDATE ${table} SET marks_source = 'auto' WHERE id = $1`, [id]);
    return false;
  }

  // --- Capa 1: capítulos ----------------------------------------------------
  let secs = await creditsFromChapters(videoPath, dur).catch(() => null);
  let source = secs != null ? 'chapters' : null;

  // --- Capa 2: luminancia ---------------------------------------------------
  if (secs == null) {
    secs = await creditsFromLuma(videoPath, dur).catch(() => null);
    source = 'auto';
  }

  await query(
    `UPDATE ${table} SET credits_start = $1, marks_source = $2 WHERE id = $3`,
    [secs, source || 'auto', id]
  );
  return secs != null;
}

// ===========================================================================
//  Barrido en segundo plano.
//  Analiza todo lo que no tenga marca, de uno en uno y SÓLO mientras la cola de
//  transcodificación esté parada: transcodificar ya satura la CPU y tiene
//  prioridad absoluta sobre esto, que no corre ninguna prisa.
// ===========================================================================
let scanning = false;
let scheduled = null;

async function waitForIdle() {
  while (isTranscodeBusy()) await sleep(30_000);
}

export async function backfillMarks() {
  if (scanning) return;
  scanning = true;
  try {
    const { rows: movies } = await query(
      `SELECT id, video_path, duration FROM media
        WHERE type = 'movie' AND coming_soon = false AND video_path IS NOT NULL
          AND marks_source IS NULL
        ORDER BY id`
    );
    const { rows: eps } = await query(
      `SELECT id, video_path, duration FROM episodes
        WHERE marks_source IS NULL ORDER BY id`
    );

    const items = [
      ...movies.map((m) => ({ kind: 'movie', id: m.id, videoPath: m.video_path, duration: m.duration })),
      ...eps.map((e) => ({ kind: 'episode', id: e.id, videoPath: e.video_path, duration: e.duration })),
    ];
    if (items.length === 0) return;

    console.log(`[marcas] ${items.length} títulos sin analizar — barrido en segundo plano`);
    let found = 0;
    for (const it of items) {
      await waitForIdle();
      try {
        if (await analyzeOne(it)) found++;
      } catch (e) {
        console.error(`[marcas] ${it.kind}-${it.id}:`, e.message);
        // Que un archivo corrupto no detenga el barrido entero.
        await query(
          `UPDATE ${it.kind === 'movie' ? 'media' : 'episodes'} SET marks_source = 'auto' WHERE id = $1`,
          [it.id]
        ).catch(() => {});
      }
      await sleep(200); // respiro entre archivos
    }
    console.log(`[marcas] barrido terminado: ${found}/${items.length} con créditos detectados`);
  } catch (e) {
    console.error('[marcas] barrido:', e.message);
  } finally {
    scanning = false;
  }
}

// Relanza el barrido poco después de subir contenido nuevo (agrupa ráfagas de
// subidas en una sola pasada). Sin esto habría que reiniciar el backend para
// que un título recién subido tuviera marca.
export function scheduleMarksScan(delayMs = 10_000) {
  if (scheduled) clearTimeout(scheduled);
  scheduled = setTimeout(() => {
    scheduled = null;
    backfillMarks().catch((e) => console.error('[marcas]', e.message));
  }, delayMs);
  scheduled.unref?.();
}
