// ----------------------------------------------------------------------------
//  Admin.jsx — Panel de administración.
//
//  Pestañas:
//    1. Biblioteca -> ver/filtrar/eliminar todo el contenido (gestión).
//    2. Película   -> subir película (con detección automática de duración).
//    3. Serie      -> crear ficha de serie.
//    4. Capítulo   -> añadir episodios a una serie.
// ----------------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Film, Clapperboard, ListPlus, UploadCloud, ArrowLeft, CheckCircle2,
  Library, Search, Trash2, ChevronDown, ChevronRight, Loader2, LogOut,
  Users, ShieldCheck, User as UserIcon, UserPlus, Pencil, X, Star,
  HardDrive, Lock, List, LayoutGrid, Download, Database, Upload, CheckSquare, Square,
} from 'lucide-react';
import {
  uploadForm, fetchAdminSeries, fetchLibrary, fetchAdminMedia,
  deleteMedia, deleteEpisode, fetchUsers, deleteUser, updateUserRole,
  createUser, updateUser, fetchTranscodeProgress, setFeatured, updateMediaDetails,
  fetchDisks, mediaDownloadUrl, backupUrl, restoreBackup,
} from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { formatMinutes, formatBytes } from '../utils/format.js';

// --- Lee la duración (segundos) de un archivo de video en el navegador -------
// Usa un elemento <video> oculto para leer los metadatos sin subir nada.
function getVideoDuration(file) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration || 0); };
      v.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
      v.src = url;
    } catch { resolve(0); }
  });
}

const inputCls =
  'w-full rounded border border-gray-600 bg-card px-3 py-2 text-white placeholder-gray-500 focus:border-brand focus:outline-none';

// --- Selector de disco de almacenamiento (con capacidad y espacio libre) -----
function DiskPicker({ value, onChange }) {
  const [disks, setDisks] = useState([]);

  const load = () => fetchDisks().then((d) => {
    setDisks(d);
    if (d.length && !value) onChange(d[0].id); // selecciona el primero por defecto
  }).catch(() => setDisks([]));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (disks.length <= 1 && disks[0]) {
    // Un solo disco: no hace falta selector, mostramos su espacio.
    const d = disks[0];
    const pct = d.total ? Math.round((d.used / d.total) * 100) : 0;
    return (
      <div className="rounded border border-gray-700 bg-card p-3">
        <div className="mb-1 flex items-center gap-2 text-sm">
          <HardDrive size={16} className="text-gray-400" />
          <span className="font-medium">{d.label}</span>
          <span className="ml-auto text-xs text-gray-400">
            {formatBytes(d.free)} libres de {formatBytes(d.total)}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
          <div className={`h-full ${pct > 90 ? 'bg-red-500' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  const selected = disks.find((d) => d.id === value) || disks[0];
  const pct = selected?.total ? Math.round((selected.used / selected.total) * 100) : 0;

  return (
    <Field label="Disco de almacenamiento *">
      <div className="space-y-2">
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          {disks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label} — {formatBytes(d.free)} libres de {formatBytes(d.total)}
            </option>
          ))}
        </select>
        {selected && (
          <div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
              <div className={`h-full ${pct > 90 ? 'bg-red-500' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-gray-500">{pct}% usado · {selected.path}</p>
          </div>
        )}
      </div>
    </Field>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-300">{label}</span>
      {children}
    </label>
  );
}

// Badge con el estado de transcodificación a HLS (calidad adaptativa).
//  `percent` (0..100) sólo se pasa cuando el item se está procesando ahora.
function StatusBadge({ status, percent }) {
  const map = {
    ready:      { text: 'HD adaptativo listo', cls: 'bg-green-600/20 text-green-300' },
    processing: { text: 'Procesando calidades…', cls: 'bg-yellow-600/20 text-yellow-300' },
    pending:    { text: 'En cola', cls: 'bg-gray-600/30 text-gray-300' },
    error:      { text: 'Error al procesar', cls: 'bg-red-600/20 text-red-300' },
  };
  const s = map[status] || map.pending;

  // Si está procesando y tenemos porcentaje, mostramos una barra + %.
  if (status === 'processing' && typeof percent === 'number') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-600/20 px-2 py-0.5 text-[10px] font-medium text-yellow-300">
        <span className="inline-block h-1 w-10 overflow-hidden rounded-full bg-yellow-900/60 align-middle">
          <span className="block h-full bg-yellow-300 transition-all" style={{ width: `${percent}%` }} />
        </span>
        Procesando {percent}%
      </span>
    );
  }
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${status === 'processing' ? 'animate-pulse ' : ''}${s.cls}`}>{s.text}</span>;
}

function ProgressBar({ progress, status }) {
  if (status === 'idle') return null;
  return (
    <div className="mt-2">
      {status === 'uploading' && (
        <>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
            <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-gray-400">Subiendo… {progress}%</p>
        </>
      )}
      {status === 'done' && (
        <p className="mt-1 flex items-center gap-1 text-sm text-green-400">
          <CheckCircle2 size={16} /> ¡Guardado correctamente!
        </p>
      )}
      {status === 'error' && <p className="mt-1 text-sm text-red-400">{progress}</p>}
    </div>
  );
}

function useUpload() {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle');
  const run = async (url, formData) => {
    setStatus('uploading'); setProgress(0);
    try {
      const result = await uploadForm(url, formData, setProgress);
      setStatus('done');
      return result;
    } catch (err) {
      setProgress(err.message); setStatus('error');
      throw err;
    }
  };
  return { progress, status, run };
}

// ===========================================================================
//  Formulario: PELÍCULA (detecta la duración automáticamente)
// ===========================================================================
function MovieForm({ onDone }) {
  const { progress, status, run } = useUpload();
  const [reading, setReading] = useState(false);
  const [disk, setDisk] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const video = fd.get('video');
    if (video && video.size) {
      setReading(true);
      const dur = await getVideoDuration(video);
      setReading(false);
      if (dur) fd.set('duration', String(Math.round(dur)));
    }
    try { await run(`/api/admin/movies?disk=${disk}`, fd); e.target.reset(); onDone?.(); } catch { /* noop */ }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <DiskPicker value={disk} onChange={setDisk} />
      <Field label="Título *"><input name="title" required className={inputCls} placeholder="Ej. Interestelar" /></Field>
      <Field label="Descripción"><textarea name="description" rows={3} className={inputCls} placeholder="Sinopsis…" /></Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Año"><input name="release_year" type="number" className={inputCls} placeholder="2014" /></Field>
        <Field label="Géneros (separados por coma)"><input name="genres" className={inputCls} placeholder="Ciencia ficción, Drama" /></Field>
      </div>
      <Field label="Actores / reparto (separados por coma)">
        <input name="actors" className={inputCls} placeholder="Matthew McConaughey, Anne Hathaway" />
      </Field>
      <Field label="Etiquetas (nombre en inglés, alias, saga… separadas por coma)">
        <input name="tags" className={inputCls} placeholder="Interstellar, espacio, Nolan" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Póster"><input name="poster" type="file" accept="image/*" className={inputCls} /></Field>
        <Field label="Banner"><input name="banner" type="file" accept="image/*" className={inputCls} /></Field>
        <Field label="Video *"><input name="video" type="file" accept="video/*" required className={inputCls} /></Field>
      </div>
      <button type="submit" disabled={status === 'uploading' || reading}
        className="flex items-center gap-2 rounded bg-brand px-5 py-2 font-semibold hover:bg-brand-dark disabled:opacity-50">
        {reading ? <Loader2 className="animate-spin" size={18} /> : <UploadCloud size={18} />}
        {reading ? 'Leyendo duración…' : 'Subir película'}
      </button>
      <ProgressBar progress={progress} status={status} />
    </form>
  );
}

// ===========================================================================
//  Formulario: SERIE
// ===========================================================================
function SeriesForm({ onCreated }) {
  const { progress, status, run } = useUpload();
  const onSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try { await run('/api/admin/series', fd); e.target.reset(); onCreated?.(); } catch { /* noop */ }
  };
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="rounded bg-card p-3 text-sm text-gray-400">
        Crea la ficha de la serie. Después ve a <span className="text-white">«Capítulo»</span> para subir sus episodios.
      </p>
      <Field label="Título *"><input name="title" required className={inputCls} placeholder="Ej. Dark" /></Field>
      <Field label="Descripción"><textarea name="description" rows={3} className={inputCls} placeholder="Sinopsis…" /></Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Año"><input name="release_year" type="number" className={inputCls} placeholder="2017" /></Field>
        <Field label="Géneros (separados por coma)"><input name="genres" className={inputCls} placeholder="Misterio, Thriller" /></Field>
      </div>
      <Field label="Actores / reparto (separados por coma)">
        <input name="actors" className={inputCls} placeholder="Louis Hofmann, Lisa Vicari" />
      </Field>
      <Field label="Etiquetas (nombre en inglés, alias, saga… separadas por coma)">
        <input name="tags" className={inputCls} placeholder="Dark, viaje en el tiempo" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Póster"><input name="poster" type="file" accept="image/*" className={inputCls} /></Field>
        <Field label="Banner"><input name="banner" type="file" accept="image/*" className={inputCls} /></Field>
      </div>
      <button type="submit" disabled={status === 'uploading'}
        className="flex items-center gap-2 rounded bg-brand px-5 py-2 font-semibold hover:bg-brand-dark disabled:opacity-50">
        <Clapperboard size={18} /> Crear serie
      </button>
      <ProgressBar progress={progress} status={status} />
    </form>
  );
}

// ===========================================================================
//  Formulario: CAPÍTULO
//   - Buscador de serie (combobox) en lugar de un simple select.
//   - Selección de una temporada existente o creación de una nueva.
//   - Sugerencia automática del siguiente nº de capítulo y detección de duración.
// ===========================================================================
function EpisodeForm({ series, refreshSeries }) {
  const { progress, status, run } = useUpload();
  const [reading, setReading] = useState(false);
  const [disk, setDisk] = useState('');

  // --- Búsqueda / selección de serie -------------------------------------
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);   // { id, title }
  const [detail, setDetail] = useState(null);        // capítulos de la serie

  // --- Temporada ----------------------------------------------------------
  const [seasonMode, setSeasonMode] = useState('existing'); // 'existing' | 'new'
  const [season, setSeason] = useState('');
  const [episodeNumber, setEpisodeNumber] = useState('');

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    return series.filter((s) => s.title.toLowerCase().includes(t)).slice(0, 8);
  }, [series, query]);

  // Temporadas existentes derivadas de los capítulos de la serie.
  const existingSeasons = useMemo(() => {
    if (!detail) return [];
    return [...new Set(detail.map((e) => e.season_number))].sort((a, b) => a - b);
  }, [detail]);

  // Sugerencia del siguiente nº de capítulo para la temporada elegida.
  const suggestedEpisode = useMemo(() => {
    if (!detail || !season) return 1;
    const eps = detail.filter((e) => String(e.season_number) === String(season));
    return eps.reduce((m, e) => Math.max(m, e.episode_number), 0) + 1;
  }, [detail, season]);

  useEffect(() => { setEpisodeNumber(String(suggestedEpisode)); }, [suggestedEpisode]);

  // Selecciona una serie y carga sus temporadas.
  const pickSeries = async (s) => {
    setSelected(s); setQuery(s.title); setOpen(false); setDetail(null);
    try {
      const d = await fetchAdminMedia(s.id);
      const eps = d.episodes || [];
      setDetail(eps);
      const secs = [...new Set(eps.map((e) => e.season_number))].sort((a, b) => a - b);
      if (secs.length) { setSeasonMode('existing'); setSeason(String(secs[secs.length - 1])); }
      else { setSeasonMode('new'); setSeason('1'); }
    } catch { setDetail([]); setSeasonMode('new'); setSeason('1'); }
  };

  const reloadDetail = async () => {
    if (!selected) return;
    try { const d = await fetchAdminMedia(selected.id); setDetail(d.episodes || []); } catch { /* noop */ }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!selected) return;
    const form = e.target;
    const fd = new FormData(form);
    fd.set('season_number', season);
    fd.set('episode_number', episodeNumber);

    if (!fd.get('duration')) {
      const video = fd.get('video');
      if (video && video.size) {
        setReading(true);
        const dur = await getVideoDuration(video);
        setReading(false);
        if (dur) fd.set('duration', String(Math.round(dur)));
      }
    }
    try {
      await run(`/api/admin/series/${selected.id}/episodes?disk=${disk}`, fd);
      form.title.value = ''; form.video.value = ''; form.duration.value = '';
      await reloadDetail();      // actualiza temporadas y sugerencia
      refreshSeries?.();
    } catch { /* noop */ }
  };

  if (series.length === 0) {
    return <p className="text-sm text-yellow-400">No hay series creadas. Crea una en la pestaña «Serie».</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <DiskPicker value={disk} onChange={setDisk} />
      {/* -------- Buscador de serie -------- */}
      <Field label="Serie *">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); setSelected(null); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Escribe para buscar la serie…"
            className={`${inputCls} pl-9`}
          />
          {selected && (
            <CheckCircle2 size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-green-400" />
          )}
          {open && filtered.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-gray-700 bg-card shadow-xl">
              {filtered.map((s) => (
                <button
                  key={s.id} type="button"
                  onMouseDown={() => pickSeries(s)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/10"
                >
                  <span className="truncate">{s.title}</span>
                  <span className="ml-2 flex-shrink-0 text-xs text-gray-500">{s.episode_count} cap.</span>
                </button>
              ))}
            </div>
          )}
          {open && query.trim() && filtered.length === 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-700 bg-card px-3 py-2 text-sm text-gray-400">
              Sin resultados
            </div>
          )}
        </div>
      </Field>

      {/* -------- Temporada (existente o nueva) -------- */}
      {selected && (
        <Field label="Temporada *">
          <div className="flex flex-wrap items-center gap-2">
            {existingSeasons.map((n) => (
              <button
                key={n} type="button"
                onClick={() => { setSeasonMode('existing'); setSeason(String(n)); }}
                className={`rounded-full px-3.5 py-1.5 text-sm ${
                  seasonMode === 'existing' && String(season) === String(n)
                    ? 'bg-brand text-white' : 'bg-card text-gray-300 hover:bg-gray-700'
                }`}
              >
                Temporada {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setSeasonMode('new'); setSeason(String((existingSeasons.at(-1) || 0) + 1)); }}
              className={`flex items-center gap-1 rounded-full px-3.5 py-1.5 text-sm ${
                seasonMode === 'new' ? 'bg-brand text-white' : 'bg-card text-gray-300 hover:bg-gray-700'
              }`}
            >
              <ListPlus size={14} /> Nueva temporada
            </button>
          </div>
          {seasonMode === 'new' && (
            <input
              type="number" min="1" value={season}
              onChange={(e) => setSeason(e.target.value)}
              className={`${inputCls} mt-2 w-32`} placeholder="Nº temporada"
            />
          )}
          {existingSeasons.length === 0 && (
            <p className="mt-1 text-xs text-gray-500">Esta serie aún no tiene temporadas: crea la primera.</p>
          )}
        </Field>
      )}

      {/* -------- Datos del capítulo -------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nº capítulo *">
          <input type="number" min="1" required value={episodeNumber}
            onChange={(e) => setEpisodeNumber(e.target.value)} className={inputCls} placeholder="1" />
        </Field>
        <Field label="Duración (auto)">
          <input name="duration" type="number" className={inputCls} placeholder="detección automática" />
        </Field>
      </div>
      <Field label="Título del capítulo">
        <input name="title" className={inputCls} placeholder="Ej. Secretos" />
      </Field>
      <Field label="Video *">
        <input name="video" type="file" accept="video/*" required className={inputCls} />
      </Field>

      <button type="submit" disabled={status === 'uploading' || reading || !selected || !season}
        className="flex items-center gap-2 rounded bg-brand px-5 py-2 font-semibold hover:bg-brand-dark disabled:opacity-50">
        {reading ? <Loader2 className="animate-spin" size={18} /> : <ListPlus size={18} />}
        {reading ? 'Leyendo duración…' : 'Añadir capítulo'}
      </button>
      <ProgressBar progress={progress} status={status} />
    </form>
  );
}

// ===========================================================================
//  Gestión de capítulos de una serie (expandible dentro de la biblioteca).
// ===========================================================================
function SeriesEpisodes({ seriesId, onChanged, progress = {}, reloadSignal = 0 }) {
  const [episodes, setEpisodes] = useState(null);

  const load = () =>
    fetchAdminMedia(seriesId).then((d) => setEpisodes(d.episodes || [])).catch(() => setEpisodes([]));
  // Recargamos al abrir y cada vez que algo termina de transcodificar.
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [seriesId, reloadSignal]);

  const removeEpisode = async (ep) => {
    if (!confirm(`¿Eliminar el capítulo T${ep.season_number}:E${ep.episode_number}?`)) return;
    await deleteEpisode(ep.id);
    load();
    onChanged?.();
  };

  if (episodes === null) return <p className="px-4 py-3 text-sm text-gray-400">Cargando capítulos…</p>;
  if (episodes.length === 0) return <p className="px-4 py-3 text-sm text-gray-500">Esta serie aún no tiene capítulos.</p>;

  return (
    <div className="divide-y divide-gray-800 bg-black/20">
      {episodes.map((ep) => (
        <div key={ep.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate text-gray-200">
            <span className="text-gray-500">T{ep.season_number}:E{ep.episode_number}</span>{' '}
            {ep.title || 'Sin título'}
            {ep.duration ? <span className="ml-2 text-gray-500">· {formatMinutes(ep.duration)}</span> : null}
          </span>
          <StatusBadge status={ep.transcode_status} percent={progress[`episode-${ep.id}`]} />
          <button onClick={() => removeEpisode(ep)} className="text-gray-400 hover:text-red-400" title="Eliminar capítulo">
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Modal de edición de un título (película o serie).
//  Precarga los datos actuales y permite cambiar textos, etiquetas e imágenes.
// ---------------------------------------------------------------------------
function MediaEditModal({ id, onClose, onSaved }) {
  const [media, setMedia] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchAdminMedia(id).then(setMedia).catch((e) => setError(e.message)); }, [id]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    const fd = new FormData(e.target);
    // Si no se elige imagen nueva, no la enviamos (el input file vacío no aporta).
    if (!fd.get('poster')?.size) fd.delete('poster');
    if (!fd.get('banner')?.size) fd.delete('banner');
    try { await updateMediaDetails(id, fd); onSaved(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold">Editar título</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>

        {error && <div className="mb-3 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        {!media ? (
          <p className="text-gray-400">Cargando…</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <Field label="Título">
              <input name="title" defaultValue={media.title} className={inputCls} />
            </Field>
            <Field label="Descripción">
              <textarea name="description" rows={3} defaultValue={media.description || ''} className={inputCls} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Año">
                <input name="release_year" type="number" defaultValue={media.release_year || ''} className={inputCls} />
              </Field>
              <Field label="Géneros (coma)">
                <input name="genres" defaultValue={(media.genres || []).join(', ')} className={inputCls} />
              </Field>
            </div>
            <Field label="Actores (coma)">
              <input name="actors" defaultValue={(media.actors || []).join(', ')} className={inputCls} />
            </Field>
            <Field label="Etiquetas (coma)">
              <input name="tags" defaultValue={(media.tags || []).join(', ')} className={inputCls} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nuevo póster (opcional)">
                <input name="poster" type="file" accept="image/*" className={inputCls} />
              </Field>
              <Field label="Nuevo banner (opcional)">
                <input name="banner" type="file" accept="image/*" className={inputCls} />
              </Field>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="rounded bg-white/10 px-4 py-2 text-sm hover:bg-white/20">Cancelar</button>
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 rounded bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />} Guardar cambios
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
//  Pestaña BIBLIOTECA: ver / filtrar / editar / eliminar.
// ===========================================================================
function LibraryManager({ adult = false }) {
  const PAGE_SIZE = 12;
  const [data, setData] = useState({ items: [], total: 0, movieCount: 0, seriesCount: 0 });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [type, setType] = useState('all'); // all | movie | series
  const [view, setView] = useState('list'); // list | grid
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [selected, setSelected] = useState(new Set()); // ids de películas seleccionadas
  const [progress, setProgress] = useState({}); // { 'movie-8': 42, ... }
  const [reloadSignal, setReloadSignal] = useState(0);
  const [editId, setEditId] = useState(null);   // id del título en edición

  // Debounce del texto de búsqueda (350ms).
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = () => {
    setLoading(true);
    fetchLibrary({ page, pageSize: PAGE_SIZE, type, q: debouncedQ, adult })
      .then(setData).catch(console.error).finally(() => setLoading(false));
  };
  // Recargamos cuando cambian página, filtro, búsqueda o sección (normal/+18).
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, type, debouncedQ, adult]);

  // Al cambiar de filtro, volvemos a la página 1.
  const changeType = (t) => { setType(t); setPage(1); };

  // --- Polling del progreso de transcodificación en tiempo real -----------
  useEffect(() => {
    let prevKeys = [];
    const tick = async () => {
      try {
        const p = await fetchTranscodeProgress();
        setProgress(p);
        const keys = Object.keys(p);
        if (prevKeys.some((k) => !keys.includes(k))) {
          load();
          setReloadSignal((s) => s + 1);
        }
        prevKeys = keys;
      } catch { /* silencioso */ }
    };
    const interval = setInterval(tick, 2500);
    tick();
    return () => clearInterval(interval);
    // eslint-disable-next-line
  }, [page, type, debouncedQ]);

  const removeMedia = async (item) => {
    const extra = item.type === 'series' ? ' y TODOS sus capítulos' : '';
    if (!confirm(`¿Eliminar «${item.title}»${extra}? Esta acción no se puede deshacer.`)) return;
    await deleteMedia(item.id);
    load();
  };

  // Marca/desmarca "Estelar" (optimista).
  const toggleFeatured = async (item) => {
    setData((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === item.id ? { ...it, featured: !item.featured } : it)),
    }));
    try { await setFeatured(item.id, !item.featured); }
    catch { load(); }
  };

  // --- Selección y descarga (solo películas) ------------------------------
  const movieItems = data.items.filter((it) => it.type === 'movie');
  const allMoviesSelected = movieItems.length > 0 && movieItems.every((it) => selected.has(it.id));
  const toggleSelect = (id) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleSelectAll = () =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (allMoviesSelected) movieItems.forEach((it) => n.delete(it.id));
      else movieItems.forEach((it) => n.add(it.id));
      return n;
    });
  const triggerDownload = (id) => {
    const a = document.createElement('a');
    a.href = mediaDownloadUrl(id);
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  // Descarga masiva: separa cada descarga para que el navegador no las bloquee.
  const downloadSelected = () => {
    [...selected].forEach((id, i) => setTimeout(() => triggerDownload(id), i * 900));
  };

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const chips = [
    { key: 'all', label: `Todo (${data.movieCount + data.seriesCount})` },
    { key: 'movie', label: `Películas (${data.movieCount})` },
    { key: 'series', label: `Series (${data.seriesCount})` },
  ];

  return (
    <div className="space-y-5">
      {/* Buscador + filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por título, género o actor…"
            className={`${inputCls} pl-9`}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button key={c.key} onClick={() => changeType(c.key)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                type === c.key ? 'bg-brand text-white' : 'bg-card text-gray-300 hover:bg-gray-700'
              }`}>
              {c.label}
            </button>
          ))}
        </div>
        {/* Alternar vista lista / mosaico */}
        <div className="flex items-center gap-1 rounded-lg bg-card p-1">
          <button onClick={() => setView('list')} title="Vista en lista"
            className={`rounded-md p-1.5 ${view === 'list' ? 'bg-brand text-white' : 'text-gray-400 hover:text-white'}`}>
            <List size={18} />
          </button>
          <button onClick={() => setView('grid')} title="Vista en mosaico"
            className={`rounded-md p-1.5 ${view === 'grid' ? 'bg-brand text-white' : 'text-gray-400 hover:text-white'}`}>
            <LayoutGrid size={18} />
          </button>
        </div>
      </div>

      {/* Barra de selección / descarga masiva (solo películas) */}
      {movieItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-800 bg-black/20 px-3 py-2">
          <button onClick={toggleSelectAll} className="flex items-center gap-2 text-sm text-gray-300 hover:text-white">
            {allMoviesSelected ? <CheckSquare size={18} className="text-brand" /> : <Square size={18} />}
            Seleccionar películas
          </button>
          <span className="text-sm text-gray-500">{selected.size} seleccionada{selected.size === 1 ? '' : 's'}</span>
          <div className="flex-1" />
          {selected.size > 0 && (
            <>
              <button onClick={() => setSelected(new Set())}
                className="rounded bg-white/10 px-3 py-1.5 text-sm text-gray-300 hover:bg-white/20">
                Limpiar
              </button>
              <button onClick={downloadSelected}
                className="flex items-center gap-2 rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">
                <Download size={16} /> Descargar {selected.size} video{selected.size === 1 ? '' : 's'}
              </button>
            </>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Cargando biblioteca…</p>
      ) : data.items.length === 0 ? (
        <p className="text-sm text-gray-500">Sin resultados.</p>
      ) : (
        <div className={view === 'grid'
          ? 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
          : 'space-y-2'}>
          {data.items.map((it) => {
            const isSeries = it.type === 'series';
            const open = expanded === it.id;

            // -------- Vista en MOSAICO --------
            if (view === 'grid') {
              const isMovie = it.type === 'movie';
              const isSel = selected.has(it.id);
              return (
                <div key={it.id} className={`overflow-hidden rounded-lg bg-card ring-2 ${isSel ? 'ring-brand' : 'ring-transparent'}`}>
                  <div className="relative aspect-[2/3] w-full bg-gray-800">
                    <img src={it.poster_url} alt="" className="h-full w-full object-cover" />
                    <div className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
                      <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] uppercase text-gray-200">
                        {isSeries ? 'Serie' : 'Película'}
                      </span>
                      {it.featured && (
                        <span className="rounded bg-yellow-500/90 px-1.5 py-0.5 text-[10px] font-bold text-black">Estelar</span>
                      )}
                    </div>
                    {/* Checkbox de selección (solo películas) */}
                    {isMovie && (
                      <button onClick={() => toggleSelect(it.id)} title="Seleccionar"
                        className="absolute right-1.5 top-1.5 rounded bg-black/60 p-0.5 text-white hover:bg-black/80">
                        {isSel ? <CheckSquare size={20} className="text-brand" /> : <Square size={20} />}
                      </button>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="truncate text-sm font-semibold">{it.title}</p>
                    <p className="truncate text-xs text-gray-400">
                      {isSeries
                        ? `${it.season_count} temp · ${it.episode_count} cap`
                        : `${it.release_year || 's/año'}${it.duration ? ` · ${formatMinutes(it.duration)}` : ''}`}
                    </p>
                    {/* Estado de transcodificación FUERA de la imagen */}
                    {isMovie && (
                      <div className="mt-1.5">
                        <StatusBadge status={it.transcode_status} percent={progress[`movie-${it.id}`]} />
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-1.5">
                      <button onClick={() => setEditId(it.id)} title="Editar"
                        className="flex-1 rounded bg-white/10 p-1.5 text-gray-200 hover:bg-white/20">
                        <Pencil size={14} className="mx-auto" />
                      </button>
                      {isMovie && (
                        <button onClick={() => triggerDownload(it.id)} title="Descargar video original"
                          className="flex-1 rounded bg-white/10 p-1.5 text-gray-200 hover:bg-white/20">
                          <Download size={14} className="mx-auto" />
                        </button>
                      )}
                      <button onClick={() => toggleFeatured(it)} title={it.featured ? 'Quitar de Estelares' : 'Marcar como Estelar'}
                        className={`flex-1 rounded p-1.5 ${it.featured ? 'bg-yellow-500/20 text-yellow-300' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
                        <Star size={14} fill={it.featured ? 'currentColor' : 'none'} className="mx-auto" />
                      </button>
                      <button onClick={() => removeMedia(it)} title="Eliminar"
                        className="flex-1 rounded bg-red-600/20 p-1.5 text-red-300 hover:bg-red-600/40">
                        <Trash2 size={14} className="mx-auto" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            // -------- Vista en LISTA --------
            return (
              <div key={it.id} className="overflow-hidden rounded-lg bg-card">
                <div className="flex flex-wrap items-center gap-3 p-3">
                  {isSeries ? (
                    <button onClick={() => setExpanded(open ? null : it.id)} className="text-gray-400 hover:text-white">
                      {open ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </button>
                  ) : (
                    <button onClick={() => toggleSelect(it.id)} title="Seleccionar" className="flex-shrink-0 text-gray-400 hover:text-white">
                      {selected.has(it.id) ? <CheckSquare size={20} className="text-brand" /> : <Square size={20} />}
                    </button>
                  )}
                  <img src={it.poster_url} alt="" className="h-16 w-11 flex-shrink-0 rounded object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold">{it.title}</p>
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-gray-300">
                        {isSeries ? 'Serie' : 'Película'}
                      </span>
                      {!isSeries && <StatusBadge status={it.transcode_status} percent={progress[`movie-${it.id}`]} />}
                    </div>
                    <p className="text-xs text-gray-400">
                      {isSeries
                        ? `${it.season_count} temporada${it.season_count === 1 ? '' : 's'} · ${it.episode_count} capítulo${it.episode_count === 1 ? '' : 's'}`
                        : `${it.release_year || 's/año'}${it.duration ? ` · ${formatMinutes(it.duration)}` : ''}`}
                      {it.genres?.length ? ` · ${it.genres.join(', ')}` : ''}
                    </p>
                    {it.disk && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500">
                        <HardDrive size={11} /> Guardado en: <span className="text-gray-400">{it.disk.label}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                    <button onClick={() => setEditId(it.id)}
                      className="flex flex-1 items-center justify-center gap-1 rounded bg-white/10 px-3 py-1.5 text-sm text-gray-200 hover:bg-white/20 sm:flex-none">
                      <Pencil size={15} /> Editar
                    </button>
                    {!isSeries && (
                      <button onClick={() => triggerDownload(it.id)} title="Descargar video original"
                        className="flex flex-1 items-center justify-center gap-1 rounded bg-white/10 px-3 py-1.5 text-sm text-gray-200 hover:bg-white/20 sm:flex-none">
                        <Download size={15} /> Descargar
                      </button>
                    )}
                    <button onClick={() => toggleFeatured(it)}
                      title={it.featured ? 'Quitar de Estelares' : 'Marcar como Estelar'}
                      className={`flex flex-1 items-center justify-center gap-1 rounded px-3 py-1.5 text-sm sm:flex-none ${
                        it.featured ? 'bg-yellow-500/20 text-yellow-300' : 'bg-white/10 text-gray-300 hover:bg-white/20'
                      }`}>
                      <Star size={15} fill={it.featured ? 'currentColor' : 'none'} />
                      {it.featured ? 'Estelar' : 'Destacar'}
                    </button>
                    <button onClick={() => removeMedia(it)}
                      className="flex flex-1 items-center justify-center gap-1 rounded bg-red-600/20 px-3 py-1.5 text-sm text-red-300 hover:bg-red-600/40 sm:flex-none">
                      <Trash2 size={15} /> Eliminar
                    </button>
                  </div>
                </div>
                {isSeries && open && (
                  <SeriesEpisodes seriesId={it.id} onChanged={load} progress={progress} reloadSignal={reloadSignal} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20 disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-400">Página {page} de {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20 disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}

      {/* Modal de edición */}
      {editId && (
        <MediaEditModal
          id={editId}
          onClose={() => setEditId(null)}
          onSaved={() => { setEditId(null); load(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Modal de crear / editar usuario.
//    - Sin `user` -> modo creación (contraseña obligatoria).
//    - Con `user` -> modo edición (contraseña opcional: dejar en blanco = no
//      cambiar). El email/nombre/rol se precargan.
// ---------------------------------------------------------------------------
function UserFormModal({ user, currentUser, onClose, onSaved }) {
  const editing = Boolean(user);
  const [form, setForm] = useState({
    name: user?.display_name || '',
    email: user?.email || '',
    password: '',
    role: user?.role || 'user',
    adult: user?.adult_access === true,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const isSelf = editing && user.id === currentUser.id;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editing) {
        const payload = { name: form.name, email: form.email, role: form.role, adult: form.adult };
        if (form.password) payload.password = form.password; // sólo si se escribió
        await updateUser(user.id, payload);
      } else {
        await createUser(form);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold">{editing ? 'Editar usuario' : 'Nuevo usuario'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>

        {error && (
          <div className="mb-3 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <Field label="Nombre"><input value={form.name} onChange={update('name')} className={inputCls} placeholder="Nombre (opcional)" /></Field>
          <Field label="Email *"><input type="email" value={form.email} onChange={update('email')} required className={inputCls} placeholder="correo@ejemplo.com" /></Field>
          <Field label={editing ? 'Nueva contraseña (opcional)' : 'Contraseña *'}>
            <input type="password" value={form.password} onChange={update('password')}
              required={!editing} className={inputCls}
              placeholder={editing ? 'Dejar en blanco para no cambiarla' : 'Mín. 8 caracteres'} />
          </Field>
          <Field label="Rol">
            <select value={form.role} onChange={update('role')} disabled={isSelf} className={inputCls}>
              <option value="user">Usuario</option>
              <option value="admin">Administrador</option>
            </select>
            {isSelf && <span className="mt-1 block text-xs text-gray-500">No puedes cambiar tu propio rol.</span>}
          </Field>

          {/* Acceso a la sección de adultos */}
          <label className="flex cursor-pointer items-center gap-2 rounded bg-black/30 px-3 py-2">
            <input
              type="checkbox"
              checked={form.adult}
              onChange={(e) => setForm({ ...form, adult: e.target.checked })}
              className="h-4 w-4 accent-brand"
            />
            <span className="text-sm">Habilitar acceso a la <span className="font-semibold text-brand">sección de adultos (+18)</span></span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded bg-white/10 px-4 py-2 text-sm hover:bg-white/20">Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 rounded bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark disabled:opacity-50">
              {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
              {editing ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===========================================================================
//  Pestaña USUARIOS: ver / crear / editar / cambiar rol / eliminar.
// ===========================================================================
function UserManager() {
  const { user: current } = useAuth();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null); // null | { user? } -> abre el formulario

  const load = () => fetchUsers().then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const changeRole = async (u, role) => {
    setError('');
    try { await updateUserRole(u.id, role); load(); }
    catch (e) { setError(e.message); }
  };

  const remove = async (u) => {
    if (!confirm(`¿Eliminar al usuario «${u.email}»? Se borrará también su historial de visionado.`)) return;
    setError('');
    try { await deleteUser(u.id); load(); }
    catch (e) { setError(e.message); }
  };

  if (users === null) return <p className="text-gray-400">Cargando usuarios…</p>;

  const term = q.trim().toLowerCase();
  const list = users.filter(
    (u) => u.email.toLowerCase().includes(term) || (u.display_name || '').toLowerCase().includes(term)
  );

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      {/* Buscador + botón crear */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por email o nombre…" className={`${inputCls} pl-9`} />
        </div>
        <button onClick={() => setModal({ user: null })}
          className="flex items-center gap-2 rounded bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark">
          <UserPlus size={16} /> Nuevo usuario
        </button>
      </div>

      <div className="space-y-2">
        {list.map((u) => {
          const isMe = u.id === current.id;
          const isAdmin = u.role === 'admin';
          return (
            <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-card p-3">
              <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${isAdmin ? 'bg-brand/30 text-brand' : 'bg-white/10 text-gray-300'}`}>
                {isAdmin ? <ShieldCheck size={20} /> : <UserIcon size={20} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {u.display_name || u.email}
                  {isMe && <span className="ml-2 text-xs text-gray-500">(tú)</span>}
                </p>
                <p className="truncate text-xs text-gray-400">
                  {u.email} · <span className={isAdmin ? 'text-brand' : ''}>{isAdmin ? 'Administrador' : 'Usuario'}</span>
                  {u.adult_access && <span className="ml-2 rounded bg-brand/20 px-1.5 py-0.5 text-[10px] font-medium text-brand">+18</span>}
                </p>
              </div>

              {/* Acciones */}
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <button onClick={() => setModal({ user: u })}
                  className="flex flex-1 items-center justify-center gap-1 rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 sm:flex-none">
                  <Pencil size={15} /> Editar
                </button>
                {isAdmin ? (
                  <button onClick={() => changeRole(u, 'user')} disabled={isMe}
                    className="flex-1 whitespace-nowrap rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-40 sm:flex-none"
                    title="Quitar permisos de administrador">
                    Hacer usuario
                  </button>
                ) : (
                  <button onClick={() => changeRole(u, 'admin')}
                    className="flex-1 whitespace-nowrap rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 sm:flex-none"
                    title="Conceder permisos de administrador">
                    Hacer admin
                  </button>
                )}
                <button onClick={() => remove(u)} disabled={isMe}
                  className="flex flex-1 items-center justify-center gap-1 rounded bg-red-600/20 px-3 py-1.5 text-sm text-red-300 hover:bg-red-600/40 disabled:opacity-40 sm:flex-none">
                  <Trash2 size={15} /> Eliminar
                </button>
              </div>
            </div>
          );
        })}
        {list.length === 0 && <p className="text-sm text-gray-500">Sin resultados.</p>}
      </div>

      {/* Modal de crear/editar */}
      {modal && (
        <UserFormModal
          user={modal.user}
          currentUser={current}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}

// ===========================================================================
//  Pestaña ALMACENAMIENTO: uso de cada disco con barras y alertas.
// ===========================================================================
function StorageManager() {
  const [disks, setDisks] = useState(null);

  const load = () => fetchDisks().then(setDisks).catch(() => setDisks([]));
  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // refresco cada 15s
    return () => clearInterval(t);
  }, []);

  if (disks === null) return <p className="text-gray-400">Cargando discos…</p>;
  if (disks.length === 0) return <p className="text-gray-400">No hay discos configurados.</p>;

  const totalCap = disks.reduce((a, d) => a + (d.total || 0), 0);
  const totalFree = disks.reduce((a, d) => a + (d.free || 0), 0);

  return (
    <div className="space-y-5">
      {/* Resumen global */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-800 bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Discos</p>
          <p className="mt-1 text-2xl font-bold">{disks.length}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Capacidad total</p>
          <p className="mt-1 text-2xl font-bold">{formatBytes(totalCap)}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Espacio libre</p>
          <p className="mt-1 text-2xl font-bold text-green-400">{formatBytes(totalFree)}</p>
        </div>
      </div>

      {/* Detalle por disco */}
      <div className="space-y-3">
        {disks.map((d) => {
          const offline = d.total == null;
          const pct = d.total ? Math.round((d.used / d.total) * 100) : 0;
          const nearFull = pct >= 90;
          const barColor = offline ? 'bg-gray-600' : nearFull ? 'bg-red-500' : pct >= 75 ? 'bg-yellow-500' : 'bg-brand';
          return (
            <div key={d.id} className="rounded-lg border border-gray-800 bg-card p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <HardDrive size={18} className="text-gray-400" />
                <span className="font-semibold">{d.label}</span>
                <span className="text-xs text-gray-500">({d.id})</span>
                {offline ? (
                  <span className="ml-auto rounded-full bg-gray-600/30 px-2 py-0.5 text-[10px] text-gray-300">No disponible</span>
                ) : nearFull ? (
                  <span className="ml-auto rounded-full bg-red-600/20 px-2 py-0.5 text-[10px] font-medium text-red-300">¡Casi lleno!</span>
                ) : (
                  <span className="ml-auto text-xs text-gray-400">{formatBytes(d.free)} libres de {formatBytes(d.total)}</span>
                )}
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-700">
                <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                <span>{offline ? 'Disco no montado o sin permisos' : `${pct}% usado · ${formatBytes(d.used)}`}</span>
                <span className="truncate pl-2">{d.path}</span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-600">Se actualiza automáticamente cada 15 segundos.</p>
    </div>
  );
}

// ===========================================================================
//  Pestaña BACKUP: copia de seguridad y restauración de la base de datos.
// ===========================================================================
function BackupManager() {
  const [restoring, setRestoring] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const fileRef = useRef(null);

  const doBackup = () => {
    const a = document.createElement('a');
    a.href = backupUrl();
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const onPickRestore = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-seleccionar el mismo archivo
    if (!file) return;
    if (!confirm(
      `¿Restaurar desde «${file.name}»?\n\nESTO REEMPLAZARÁ los datos actuales ` +
      `(catálogo, usuarios y progreso) por los del backup. No se puede deshacer.`
    )) return;

    setRestoring(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append('backup', file);
      await restoreBackup(fd);
      setMsg({ ok: true, text: 'Restauración completada. Recarga la aplicación para ver los cambios.' });
    } catch (err) {
      setMsg({ ok: false, text: err.message || 'No se pudo restaurar' });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Crear backup */}
      <div className="rounded-lg border border-gray-800 bg-card p-5">
        <div className="mb-2 flex items-center gap-2">
          <Database size={20} className="text-brand" />
          <h3 className="font-semibold">Copia de seguridad</h3>
        </div>
        <p className="mb-4 text-sm text-gray-400">
          Descarga un respaldo completo en un solo archivo <code>.tar.gz</code>: la base de
          datos (catálogo, series/capítulos, usuarios y progreso) <strong>más los pósters y
          banners</strong>. Guárdalo en un lugar seguro.
        </p>
        <button onClick={doBackup}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark">
          <Download size={18} /> Descargar backup
        </button>
      </div>

      {/* Restaurar backup */}
      <div className="rounded-lg border border-gray-800 bg-card p-5">
        <div className="mb-2 flex items-center gap-2">
          <Upload size={20} className="text-brand" />
          <h3 className="font-semibold">Restaurar</h3>
        </div>
        <p className="mb-4 text-sm text-gray-400">
          Restaura desde un archivo de backup (<code>.tar.gz</code> o <code>.sql</code>):
          recupera la base de datos y los pósters/banners.
          <span className="text-red-300"> Reemplaza los datos actuales.</span>
        </p>
        <input ref={fileRef} type="file" accept=".tar.gz,.tgz,.gz,.sql" onChange={onPickRestore} className="hidden" />
        <button onClick={() => fileRef.current?.click()} disabled={restoring}
          className="flex items-center gap-2 rounded-lg border border-gray-700 bg-white/5 px-4 py-2.5 font-semibold text-gray-200 hover:bg-white/10 disabled:opacity-50">
          {restoring ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
          {restoring ? 'Restaurando…' : 'Seleccionar archivo y restaurar'}
        </button>
        {msg && (
          <p className={`mt-3 text-sm ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</p>
        )}
      </div>

      <p className="text-xs text-gray-600">
        Nota: el backup incluye la base de datos y las imágenes (pósters/banners). Los
        <strong> archivos de video no se incluyen</strong> por su tamaño; respáldalos por
        separado copiando las carpetas <code>movies</code>/<code>series</code> de tus discos.
      </p>
    </div>
  );
}

// ===========================================================================
//  Página principal del panel.
// ===========================================================================
export default function Admin() {
  const [tab, setTab] = useState('library');
  const [series, setSeries] = useState([]);
  const { user, canAdult, logout } = useAuth();
  const navigate = useNavigate();

  const refreshSeries = () => fetchAdminSeries().then(setSeries).catch(console.error);
  useEffect(() => { refreshSeries(); }, []);

  // Si el admin no tiene acceso adulto y estaba en esa pestaña, lo movemos.
  useEffect(() => { if (tab === 'library18' && !canAdult) setTab('library'); }, [tab, canAdult]);

  const doLogout = async () => { await logout(); navigate('/login'); };

  // Navegación agrupada por secciones (se renderiza como sidebar en escritorio).
  const groups = [
    {
      title: 'Contenido',
      items: [
        { key: 'library',   label: 'Biblioteca', icon: Library },
        // La biblioteca +18 sólo se ofrece a quien tenga acceso adulto.
        ...(canAdult ? [{ key: 'library18', label: 'Biblioteca +18', icon: Lock }] : []),
      ],
    },
    {
      title: 'Subir',
      items: [
        { key: 'movie',   label: 'Película', icon: Film },
        { key: 'series',  label: 'Serie',    icon: Clapperboard },
        { key: 'episode', label: 'Capítulo', icon: ListPlus },
      ],
    },
    {
      title: 'Sistema',
      items: [
        { key: 'users',   label: 'Usuarios',       icon: Users },
        { key: 'storage', label: 'Almacenamiento', icon: HardDrive },
        { key: 'backup',  label: 'Backup',         icon: Database },
      ],
    },
  ];
  const allTabs = groups.flatMap((g) => g.items);
  const current = allTabs.find((t) => t.key === tab);
  const CurrentIcon = current?.icon;

  // Botón de navegación reutilizable (sidebar y móvil).
  const NavButton = ({ item, mobile }) => {
    const active = tab === item.key;
    const Icon = item.icon;
    return (
      <button
        onClick={() => setTab(item.key)}
        className={mobile
          ? `flex flex-shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${active ? 'bg-brand text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`
          : `flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? 'bg-brand text-white' : 'text-gray-300 hover:bg-white/10'}`}
      >
        <Icon size={18} /> {item.label}
      </button>
    );
  };

  const content = (
    <>
      {tab === 'library'   && <LibraryManager />}
      {tab === 'library18' && <LibraryManager adult />}
      {tab === 'movie'     && <MovieForm onDone={refreshSeries} />}
      {tab === 'series'    && <SeriesForm onCreated={refreshSeries} />}
      {tab === 'episode'   && <EpisodeForm series={series} refreshSeries={refreshSeries} />}
      {tab === 'users'     && <UserManager />}
      {tab === 'storage'   && <StorageManager />}
      {tab === 'backup'    && <BackupManager />}
    </>
  );

  return (
    <div className="flex h-screen flex-col bg-surface">
      {/* -------- Barra superior FIJA (ancho completo) -------- */}
      <header className="flex flex-shrink-0 items-center justify-between border-b border-gray-800 bg-black/40 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="Mi VOD" className="h-7 w-auto" />
          <span className="text-xl font-extrabold text-brand">MI VOD</span>
          <span className="hidden text-sm text-gray-500 sm:inline">· Panel de administración</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-gray-400 md:inline">{user?.name || user?.email}</span>
          <Link to="/" className="flex items-center gap-1 rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Catálogo</span>
          </Link>
          <button onClick={doLogout} className="flex items-center gap-1 rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
            <LogOut size={16} /> <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      {/* -------- Navegación móvil (horizontal) -------- */}
      <div className="no-scrollbar flex flex-shrink-0 gap-2 overflow-x-auto border-b border-gray-800 px-4 py-3 md:hidden">
        {allTabs.map((item) => <NavButton key={item.key} item={item} mobile />)}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* -------- Sidebar (escritorio) — fija, separador de altura completa -------- */}
        <aside className="hidden w-60 flex-shrink-0 overflow-y-auto border-r border-gray-800 p-4 md:block">
          <nav className="space-y-6">
            {groups.map((g) => (
              <div key={g.title}>
                <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">{g.title}</p>
                <div className="space-y-1">
                  {g.items.map((item) => <NavButton key={item.key} item={item} />)}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* -------- Contenido (scroll propio) -------- */}
        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mb-5 flex items-center gap-2">
            {CurrentIcon && <CurrentIcon size={22} className="text-brand" />}
            <h1 className="text-xl font-bold sm:text-2xl">{current?.label}</h1>
          </div>
          <div className="rounded-xl border border-gray-800 bg-black/20 p-4 sm:p-6">
            {content}
          </div>
        </main>
      </div>
    </div>
  );
}
