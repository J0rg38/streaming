// ----------------------------------------------------------------------------
//  storage.js — Almacenamiento multi-disco.
//
//  Permite guardar el contenido en varios discos del servidor. Cada disco tiene
//  sus subcarpetas (movies, series, images, hls). Se configura con la variable
//  de entorno MEDIA_DISKS (JSON); si no existe, se usa un único disco = MEDIA_ROOT.
//
//  Ejemplo de .env:
//    MEDIA_DISKS=[{"id":"disk1","label":"Disco 1","path":"/mnt/disk1"},
//                 {"id":"disk2","label":"Disco 2","path":"/mnt/disk2"}]
// ----------------------------------------------------------------------------
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const DEFAULT_ROOT = path.resolve(process.env.MEDIA_ROOT || './media');
const SUBDIRS = ['movies', 'series', 'images', 'hls'];

function loadDisks() {
  const disks = [];
  const raw = process.env.MEDIA_DISKS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((d, i) => {
          if (!d?.path) return;
          disks.push({
            id: String(d.id || `disk${i + 1}`),
            label: d.label || `Disco ${i + 1}`,
            path: path.resolve(d.path),
          });
        });
      }
    } catch (e) {
      console.error('[storage] MEDIA_DISKS inválido, se ignora:', e.message);
    }
  }
  // Garantizamos el disco por defecto (MEDIA_ROOT) para no perder contenido previo.
  if (!disks.some((d) => d.path === DEFAULT_ROOT)) {
    disks.unshift({ id: 'default', label: 'Principal', path: DEFAULT_ROOT });
  }
  return disks;
}

export const DISKS = loadDisks();
export const DEFAULT_DISK = DISKS[0];

// Crea las subcarpetas necesarias en cada disco.
export function ensureDiskDirs() {
  for (const d of DISKS) {
    for (const sub of SUBDIRS) {
      try { fs.mkdirSync(path.join(d.path, sub), { recursive: true }); }
      catch (e) { console.error(`[storage] no se pudo crear ${d.path}/${sub}:`, e.message); }
    }
  }
}

// Devuelve el disco por id (o el por defecto si no existe).
export function getDisk(id) {
  return DISKS.find((d) => d.id === id) || DEFAULT_DISK;
}

// Disco que contiene una ruta absoluta (para colocar el HLS en el mismo disco).
export function diskForPath(absPath) {
  const resolved = path.resolve(absPath || '');
  return DISKS.find((d) => resolved === d.path || resolved.startsWith(d.path + path.sep)) || DEFAULT_DISK;
}

// ¿La ruta está dentro de ALGÚN disco configurado? (validación de streaming).
export function isInsideAnyDisk(absPath) {
  const resolved = path.resolve(absPath || '');
  return DISKS.some((d) => resolved === d.path || resolved.startsWith(d.path + path.sep));
}

// Carpeta HLS para una clave (movie-8 / episode-3), en el disco del video.
export function hlsDirFor(key, videoPath) {
  return path.join(diskForPath(videoPath).path, 'hls', key);
}

// Uso de cada disco: capacidad total y espacio libre (en bytes).
export async function listDisksUsage() {
  const out = [];
  for (const d of DISKS) {
    let total = null, free = null;
    try {
      const s = await fs.promises.statfs(d.path);
      total = s.blocks * s.bsize;
      free = s.bavail * s.bsize;   // espacio disponible para usuarios no-root
    } catch { /* si el disco no está montado, devolvemos null */ }
    out.push({
      id: d.id, label: d.label, path: d.path,
      total, free, used: (total != null && free != null) ? total - free : null,
    });
  }
  return out;
}
