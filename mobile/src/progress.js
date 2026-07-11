// ----------------------------------------------------------------------------
//  progress.js — Progreso de reproducción guardado LOCALMENTE en el dispositivo.
//
//  Complementa al progreso del servidor: así, sin conexión (contenido offline),
//  el video sigue reanudando desde donde se dejó. Se guarda en un JSON con caché
//  en memoria para no leer el disco en cada actualización.
// ----------------------------------------------------------------------------
import * as FileSystem from 'expo-file-system/legacy';

const FILE = `${FileSystem.documentDirectory}progress.json`;
const keyFor = (mediaId, episodeId) => (episodeId ? `${mediaId}_e${episodeId}` : `m${mediaId}`);

let cache = null;

async function loadCache() {
  if (cache) return cache;
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    cache = info.exists ? (JSON.parse(await FileSystem.readAsStringAsync(FILE)) || {}) : {};
  } catch { cache = {}; }
  return cache;
}

export async function getLocalProgress(mediaId, episodeId) {
  const c = await loadCache();
  return c[keyFor(mediaId, episodeId)] || 0;
}

export async function saveLocalProgress(mediaId, episodeId, seconds) {
  if (!seconds || seconds < 0) return;
  const c = await loadCache();
  c[keyFor(mediaId, episodeId)] = Math.floor(seconds);
  try { await FileSystem.writeAsStringAsync(FILE, JSON.stringify(c)); } catch { /* noop */ }
}
