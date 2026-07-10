// ----------------------------------------------------------------------------
//  api.js — Cliente del backend para la app. Usa Bearer token (no cookies).
//  El token se inyecta con setToken() tras el login.
// ----------------------------------------------------------------------------
import { API_BASE } from './config';

let authToken = null;
export const setToken = (t) => { authToken = t; };
export const getToken = () => authToken;

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch {}
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return res.status === 204 ? null : res.json();
}

// --- Autenticación ---
export const login = (email, password) =>
  apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
export const me = () => apiFetch('/api/auth/me');

// --- Catálogo ---
export const fetchCatalog = () => apiFetch('/api/media');
export const fetchAdultCatalog = () => apiFetch('/api/media/adult');
export const fetchMedia = (id) => apiFetch(`/api/media/${id}`);
export const searchMedia = (q) => apiFetch(`/api/media/search?q=${encodeURIComponent(q)}`);

// --- Progreso ---
export const fetchProgress = (mediaId, episodeId) =>
  apiFetch(episodeId ? `/api/progress/${mediaId}/${episodeId}` : `/api/progress/${mediaId}`)
    .catch(() => ({ stopped_at: 0 }));
export const saveProgress = (mediaId, episodeId, stoppedAt) =>
  apiFetch('/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_id: mediaId, episode_id: episodeId || null, stopped_at: Math.floor(stoppedAt) }),
  }).catch(() => {});

// --- Helpers de URLs con auth ---
// URL de streaming progresivo (un solo request con rangos: fiable con headers).
export const streamUrl = (videoPath) =>
  `${API_BASE}/api/stream?path=${encodeURIComponent(videoPath)}`;

// Fuente de imagen: nuestras imágenes requieren auth (cabecera). Las externas no.
export const imageSource = (url) => {
  if (!url) return undefined;
  if (url.startsWith('/api/')) {
    return { uri: `${API_BASE}${url}`, headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} };
  }
  return { uri: url }; // URL externa (p.ej. placeholder)
};

// Cabeceras para el reproductor (Bearer token).
export const authHeaders = () => (authToken ? { Authorization: `Bearer ${authToken}` } : {});
