// ----------------------------------------------------------------------------
//  downloads.js — Gestor de descargas para ver offline.
//
//  Guarda el video (y su portada) en el almacenamiento de la app y mantiene un
//  manifest.json con los metadatos. Usa la API "legacy" de expo-file-system,
//  que ofrece descargas reanudables con progreso.
// ----------------------------------------------------------------------------
import * as FileSystem from 'expo-file-system/legacy';
import { streamUrl, imageSource } from './api';

const DIR = `${FileSystem.documentDirectory}downloads/`;
const MANIFEST = `${DIR}manifest.json`;

const keyFor = (mediaId, episodeId) => (episodeId ? `${mediaId}_e${episodeId}` : `m${mediaId}`);

function extOf(path = '') {
  const m = /\.([a-z0-9]{2,4})(?:\?|$)/i.exec(path);
  return (m ? m[1] : 'mp4').toLowerCase();
}

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

export async function readManifest() {
  try {
    const info = await FileSystem.getInfoAsync(MANIFEST);
    if (!info.exists) return [];
    const txt = await FileSystem.readAsStringAsync(MANIFEST);
    return JSON.parse(txt) || [];
  } catch { return []; }
}

async function writeManifest(list) {
  await ensureDir();
  await FileSystem.writeAsStringAsync(MANIFEST, JSON.stringify(list));
}

export async function listDownloads() {
  const list = await readManifest();
  return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function getDownload(mediaId, episodeId) {
  const list = await readManifest();
  return list.find((e) => e.key === keyFor(mediaId, episodeId)) || null;
}

// Conjunto de IDs de títulos con al menos una descarga (película o capítulo).
export async function listDownloadedMediaIds() {
  const list = await readManifest();
  return new Set(list.map((e) => e.mediaId));
}

// Inicia una descarga. Devuelve { promise, cancel }.
//   item = { mediaId, episodeId?, title, subtitle?, posterUrl, videoPath }
//   onProgress(ratio 0..1)
export function startDownload(item, onProgress) {
  const key = keyFor(item.mediaId, item.episodeId);
  const fileUri = `${DIR}${key}.${extOf(item.videoPath)}`;
  const url = streamUrl(item.videoPath);
  let cancelled = false;

  const resumable = FileSystem.createDownloadResumable(url, fileUri, {}, (p) => {
    if (onProgress && p.totalBytesExpectedToWrite > 0) {
      onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
    }
  });

  const promise = (async () => {
    await ensureDir();
    const res = await resumable.downloadAsync();
    if (cancelled) { await FileSystem.deleteAsync(fileUri, { idempotent: true }); return null; }
    if (!res || res.status >= 400) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
      throw new Error('No se pudo descargar el video');
    }

    // Portada (para mostrarla sin conexión).
    let posterUri = null;
    try {
      const src = imageSource(item.posterUrl);
      if (src?.uri) {
        posterUri = `${DIR}${key}_poster.jpg`;
        await FileSystem.downloadAsync(src.uri, posterUri);
      }
    } catch { posterUri = null; }

    const info = await FileSystem.getInfoAsync(fileUri);
    const entry = {
      key,
      mediaId: item.mediaId,
      episodeId: item.episodeId || null,
      title: item.title,
      subtitle: item.subtitle || null,
      fileUri,
      posterUri,
      size: info.size || 0,
      createdAt: Date.now(),
    };
    const list = await readManifest();
    await writeManifest(list.filter((e) => e.key !== key).concat(entry));
    return entry;
  })();

  const cancel = async () => {
    cancelled = true;
    try { await resumable.pauseAsync(); } catch { /* noop */ }
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  };

  return { promise, cancel };
}

export async function deleteDownload(key) {
  const list = await readManifest();
  const entry = list.find((e) => e.key === key);
  if (entry) {
    await FileSystem.deleteAsync(entry.fileUri, { idempotent: true });
    if (entry.posterUri) await FileSystem.deleteAsync(entry.posterUri, { idempotent: true });
  }
  await writeManifest(list.filter((e) => e.key !== key));
}

export function formatBytes(bytes = 0) {
  if (!bytes) return '—';
  const gb = bytes / 1e9;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}
