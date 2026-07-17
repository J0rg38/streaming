// ----------------------------------------------------------------------------
//  api.js — Cliente del backend. Todas las peticiones envían la cookie de
//  sesión (credentials: 'include') para que el backend valide al usuario.
// ----------------------------------------------------------------------------

const BASE = '/api';

// Wrapper de fetch que siempre incluye credenciales y maneja errores JSON.
async function apiFetch(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* noop */ }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// ---------------------------------------------------------------------------
//  AUTENTICACIÓN
// ---------------------------------------------------------------------------
export const authApi = {
  me:       () => apiFetch(`${BASE}/auth/me`),
  login:    (email, password) =>
    apiFetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  register: (email, password, name) =>
    apiFetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    }),
  logout:   () => apiFetch(`${BASE}/auth/logout`, { method: 'POST' }),
};

// ---------------------------------------------------------------------------
//  CATÁLOGO
// ---------------------------------------------------------------------------
export const fetchCatalog = () => apiFetch(`${BASE}/media`);
export const fetchAdultCatalog = () => apiFetch(`${BASE}/media/adult`);
export const fetchMedia   = (id) => apiFetch(`${BASE}/media/${id}`);
export const fetchSimilar = (id) => apiFetch(`${BASE}/media/${id}/similar`);
export const searchMedia  = (q, adult = false) =>
  apiFetch(`${BASE}/media/search?q=${encodeURIComponent(q)}${adult ? '&adult=true' : ''}`);

// URL de streaming (la cookie viaja automáticamente al ser same-origin).
export const streamUrl = (videoPath) =>
  `${BASE}/stream?path=${encodeURIComponent(videoPath)}`;

// ---------------------------------------------------------------------------
//  PROGRESO
// ---------------------------------------------------------------------------
export const fetchProgress = (mediaId, episodeId = null) =>
  apiFetch(episodeId ? `${BASE}/progress/${mediaId}/${episodeId}` : `${BASE}/progress/${mediaId}`)
    .catch(() => ({ stopped_at: 0 }));

// Marca un título como NO visto (borra el progreso del usuario para ese título).
export const deleteProgress = (mediaId) =>
  apiFetch(`${BASE}/progress/${mediaId}`, { method: 'DELETE' });

export const saveProgress = (mediaId, episodeId, stoppedAt) =>
  fetch(`${BASE}/progress`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_id: mediaId,
      episode_id: episodeId || null,
      stopped_at: Math.floor(stoppedAt),
    }),
    keepalive: true,
  });

// ---------------------------------------------------------------------------
//  ADMIN
// ---------------------------------------------------------------------------
// Sube un FormData con barra de progreso (XHR expone el progreso de subida).
export function uploadForm(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true; // envía la cookie de sesión
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* noop */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.error || `Error ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Error de red durante la subida'));
    xhr.send(formData);
  });
}

export const fetchDisks        = () => apiFetch(`${BASE}/admin/disks`);
export const fetchAdminSeries  = () => apiFetch(`${BASE}/admin/series`);
export const fetchLibrary      = ({ page = 1, pageSize = 12, type = 'all', q = '', adult = false } = {}) =>
  apiFetch(`${BASE}/admin/library?page=${page}&pageSize=${pageSize}&type=${type}&q=${encodeURIComponent(q)}&adult=${adult}`);
export const fetchTranscodeProgress = () => apiFetch(`${BASE}/admin/transcode-progress`);
export const fetchAdminMedia   = (id) => apiFetch(`${BASE}/admin/media/${id}`);
export const deleteMedia       = (id) => apiFetch(`${BASE}/admin/media/${id}`, { method: 'DELETE' });
export const setFeatured       = (id, featured) =>
  apiFetch(`${BASE}/admin/media/${id}/featured`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ featured }),
  });
// Edición de datos de un título (multipart: incluye poster/banner opcionales).
export const updateMediaDetails = (id, formData) =>
  apiFetch(`${BASE}/admin/media/${id}`, { method: 'PATCH', body: formData });
export const deleteEpisode     = (id) => apiFetch(`${BASE}/admin/episodes/${id}`, { method: 'DELETE' });

// Próximos estrenos: crear (metadata + póster/banner, sin video) y regularizar
// (subir el video luego → deja de ser "próximamente" y se transcodifica).
export const createUpcoming    = (formData) =>
  apiFetch(`${BASE}/admin/upcoming`, { method: 'POST', body: formData });
export const uploadUpcomingVideo = (id, formData, onProgress, disk = '') =>
  uploadForm(`${BASE}/admin/upcoming/${id}/video${disk ? `?disk=${disk}` : ''}`, formData, onProgress);

// Descarga del video original de una película (URL para <a href> / descarga).
export const mediaDownloadUrl  = (id) => `${BASE}/admin/media/${id}/download`;

// Copia de seguridad / restauración de la base de datos.
export const backupUrl         = () => `${BASE}/admin/backup`;
export const restoreBackup     = (formData) =>
  apiFetch(`${BASE}/admin/restore`, { method: 'POST', body: formData });

// Gestión de usuarios
export const fetchUsers        = () => apiFetch(`${BASE}/admin/users`);
export const deleteUser        = (id) => apiFetch(`${BASE}/admin/users/${id}`, { method: 'DELETE' });
export const updateUserRole    = (id, role) =>
  apiFetch(`${BASE}/admin/users/${id}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
export const createUser        = (data) =>
  apiFetch(`${BASE}/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
export const updateUser        = (id, data) =>
  apiFetch(`${BASE}/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
