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
// El buscador es el mismo endpoint para catálogo normal y +18; el flag decide
// en cuál busca (el backend exige acceso concedido para adult=true).
export const searchMedia = (q, adult = false) =>
  apiFetch(`/api/media/search?q=${encodeURIComponent(q)}${adult ? '&adult=true' : ''}`);
// Títulos afines (comparten género). Alimenta el carrusel "Más como esto" de la
// ficha y el "A continuación" del final del reproductor.
export const fetchSimilar = (id) => apiFetch(`/api/media/${id}/similar`);

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
// El token va en la URL (?token=) porque <Image> y algunos reproductores nativos
// no envían cabeceras de forma fiable en Android.
const withToken = (url) => (authToken ? `${url}${url.includes('?') ? '&' : '?'}token=${authToken}` : url);

// URL de streaming progresivo (un solo request con rangos).
export const streamUrl = (videoPath) =>
  withToken(`${API_BASE}/api/stream?path=${encodeURIComponent(videoPath)}`);

// Fuente de imagen: nuestras imágenes requieren auth (token en la URL). Las externas no.
export const imageSource = (url) => {
  if (!url) return undefined;
  if (url.startsWith('/api/')) return { uri: withToken(`${API_BASE}${url}`) };
  return { uri: url }; // URL externa (p.ej. placeholder)
};

// Cabeceras para el reproductor (Bearer token) — por si el player las soporta.
export const authHeaders = () => (authToken ? { Authorization: `Bearer ${authToken}` } : {});
