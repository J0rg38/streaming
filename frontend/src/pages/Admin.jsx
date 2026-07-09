// ----------------------------------------------------------------------------
//  Admin.jsx — Panel de administración.
//
//  Pestañas:
//    1. Biblioteca -> ver/filtrar/eliminar todo el contenido (gestión).
//    2. Película   -> subir película (con detección automática de duración).
//    3. Serie      -> crear ficha de serie.
//    4. Capítulo   -> añadir episodios a una serie.
// ----------------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Film, Clapperboard, ListPlus, UploadCloud, ArrowLeft, CheckCircle2,
  Library, Search, Trash2, ChevronDown, ChevronRight, Loader2, LogOut,
  Users, ShieldCheck, User as UserIcon, UserPlus, Pencil, X, Star,
} from 'lucide-react';
import {
  uploadForm, fetchAdminSeries, fetchLibrary, fetchAdminMedia,
  deleteMedia, deleteEpisode, fetchUsers, deleteUser, updateUserRole,
  createUser, updateUser, fetchTranscodeProgress, setFeatured,
} from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { formatMinutes } from '../utils/format.js';

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
    try { await run('/api/admin/movies', fd); e.target.reset(); onDone?.(); } catch { /* noop */ }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Título *"><input name="title" required className={inputCls} placeholder="Ej. Interestelar" /></Field>
      <Field label="Descripción"><textarea name="description" rows={3} className={inputCls} placeholder="Sinopsis…" /></Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Año"><input name="release_year" type="number" className={inputCls} placeholder="2014" /></Field>
        <Field label="Géneros (separados por coma)"><input name="genres" className={inputCls} placeholder="Ciencia ficción, Drama" /></Field>
      </div>
      <Field label="Actores / reparto (separados por coma)">
        <input name="actors" className={inputCls} placeholder="Matthew McConaughey, Anne Hathaway" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Póster"><input name="poster" type="file" accept="image/*" className={inputCls} /></Field>
        <Field label="Banner"><input name="banner" type="file" accept="image/*" className={inputCls} /></Field>
        <Field label="Video *"><input name="video" type="file" accept="video/*" required className={inputCls} /></Field>
      </div>
      <button type="submit" disabled={status === 'uploading' || reading}
        className="flex items-center gap-2 rounded bg-brand px-5 py-2 font-semibold hover:bg-red-700 disabled:opacity-50">
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Póster"><input name="poster" type="file" accept="image/*" className={inputCls} /></Field>
        <Field label="Banner"><input name="banner" type="file" accept="image/*" className={inputCls} /></Field>
      </div>
      <button type="submit" disabled={status === 'uploading'}
        className="flex items-center gap-2 rounded bg-brand px-5 py-2 font-semibold hover:bg-red-700 disabled:opacity-50">
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
      await run(`/api/admin/series/${selected.id}/episodes`, fd);
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
        className="flex items-center gap-2 rounded bg-brand px-5 py-2 font-semibold hover:bg-red-700 disabled:opacity-50">
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

// ===========================================================================
//  Pestaña BIBLIOTECA: ver / filtrar / eliminar.
// ===========================================================================
function LibraryManager() {
  const PAGE_SIZE = 12;
  const [data, setData] = useState({ items: [], total: 0, movieCount: 0, seriesCount: 0 });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [type, setType] = useState('all'); // all | movie | series
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [progress, setProgress] = useState({}); // { 'movie-8': 42, ... }
  const [reloadSignal, setReloadSignal] = useState(0);

  // Debounce del texto de búsqueda (350ms).
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = () => {
    setLoading(true);
    fetchLibrary({ page, pageSize: PAGE_SIZE, type, q: debouncedQ })
      .then(setData).catch(console.error).finally(() => setLoading(false));
  };
  // Recargamos cuando cambian página, filtro o búsqueda.
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, type, debouncedQ]);

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
      </div>

      {loading ? (
        <p className="text-gray-400">Cargando biblioteca…</p>
      ) : data.items.length === 0 ? (
        <p className="text-sm text-gray-500">Sin resultados.</p>
      ) : (
        <div className="space-y-2">
          {data.items.map((it) => {
            const isSeries = it.type === 'series';
            const open = expanded === it.id;
            return (
              <div key={it.id} className="overflow-hidden rounded-lg bg-card">
                <div className="flex flex-wrap items-center gap-3 p-3">
                  {isSeries ? (
                    <button onClick={() => setExpanded(open ? null : it.id)} className="text-gray-400 hover:text-white">
                      {open ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </button>
                  ) : (
                    <span className="w-5 flex-shrink-0" />
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
                  </div>
                  <div className="flex w-full gap-2 sm:w-auto">
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
        const payload = { name: form.name, email: form.email, role: form.role };
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

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded bg-white/10 px-4 py-2 text-sm hover:bg-white/20">Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 rounded bg-brand px-4 py-2 text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
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
          className="flex items-center gap-2 rounded bg-brand px-4 py-2 text-sm font-semibold hover:bg-red-700">
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
//  Página principal del panel.
// ===========================================================================
export default function Admin() {
  const [tab, setTab] = useState('library');
  const [series, setSeries] = useState([]);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const refreshSeries = () => fetchAdminSeries().then(setSeries).catch(console.error);
  useEffect(() => { refreshSeries(); }, []);

  const doLogout = async () => { await logout(); navigate('/login'); };

  const tabs = [
    { key: 'library', label: 'Biblioteca', icon: Library },
    { key: 'movie',   label: 'Película',   icon: Film },
    { key: 'series',  label: 'Serie',      icon: Clapperboard },
    { key: 'episode', label: 'Capítulo',   icon: ListPlus },
    { key: 'users',   label: 'Usuarios',   icon: Users },
  ];

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Panel de administración</h1>
          <p className="text-sm text-gray-400">Sesión: {user?.name || user?.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-1 text-sm text-gray-300 hover:text-white">
            <ArrowLeft size={18} /> Catálogo
          </Link>
          <button onClick={doLogout} className="flex items-center gap-1 rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
            <LogOut size={16} /> Salir
          </button>
        </div>
      </div>

      {/* Pestañas: scroll horizontal en móvil para que no se amontonen */}
      <div className="no-scrollbar mb-6 flex gap-1 overflow-x-auto border-b border-gray-700 sm:gap-2">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex flex-shrink-0 items-center gap-2 px-3 py-2 text-sm font-medium transition-colors sm:px-4 sm:text-base ${
              tab === key ? 'border-b-2 border-brand text-white' : 'text-gray-400 hover:text-white'
            }`}>
            <Icon size={18} /> {label}
          </button>
        ))}
      </div>

      <div className="rounded-lg bg-black/30 p-4 sm:p-6">
        {tab === 'library' && <LibraryManager />}
        {tab === 'movie'   && <MovieForm onDone={refreshSeries} />}
        {tab === 'series'  && <SeriesForm onCreated={refreshSeries} />}
        {tab === 'episode' && <EpisodeForm series={series} refreshSeries={refreshSeries} />}
        {tab === 'users'   && <UserManager />}
      </div>
    </div>
  );
}
