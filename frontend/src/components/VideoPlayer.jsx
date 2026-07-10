// ----------------------------------------------------------------------------
//  VideoPlayer.jsx — Reproductor de video profesional.
//
//  Props:
//    - hlsUrl        : URL del master playlist HLS si está listo (o null).
//    - progressiveUrl: URL de respaldo (MP4 progresivo por rangos).
//    - thumbnailsUrl : WebVTT de miniaturas para el preview de la barra (o null).
//    - mediaId, episodeId, title, restart : identificación / reanudar.
//    - nextItem, recommendations, onNavigate, onBack : pantalla de fin / navegación.
//
//  Visibilidad de controles: patrón clásico y fiable — se muestran al mover el
//  ratón y se ocultan tras 3s de inactividad (salvo pausa/carga o cursor sobre
//  la barra). En pantalla completa el contenedor ocupa TODA la pantalla física
//  (regla CSS [data-player]:fullscreen en index.css), así el ratón siempre está
//  sobre él y sus eventos funcionan en cualquier monitor/relación de aspecto.
// ----------------------------------------------------------------------------
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  RotateCcw, RotateCw, Settings, ArrowLeft, Loader2, Check,
} from 'lucide-react';
import { fetchProgress, saveProgress } from '../api.js';
import EndScreen from './EndScreen.jsx';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function fmt(t) {
  if (!Number.isFinite(t)) return '0:00';
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function vttTime(t) {
  const [hh, mm, rest] = t.split(':');
  const [ss, ms = '0'] = (rest || '0').split('.');
  return (+hh) * 3600 + (+mm) * 60 + (+ss) + (+ms) / 1000;
}

function parseThumbnailsVtt(text) {
  const cues = [];
  for (const block of text.trim().split(/\n\n+/)) {
    const lines = block.split('\n');
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const urlLine = lines[lines.indexOf(timeLine) + 1] || '';
    const xywh = urlLine.match(/#xywh=(\d+),(\d+),(\d+),(\d+)/);
    if (!xywh) continue;
    const [s, e] = timeLine.split('-->').map((x) => vttTime(x.trim()));
    cues.push({ start: s, end: e, x: +xywh[1], y: +xywh[2], w: +xywh[3], h: +xywh[4] });
  }
  return cues;
}

const isFsElement = () => document.fullscreenElement || document.webkitFullscreenElement;

export default function VideoPlayer({
  hlsUrl, progressiveUrl, thumbnailsUrl, mediaId, episodeId = null, title, restart = false,
  nextItem = null, recommendations = [], onNavigate, onBack,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hlsRef = useRef(null);
  const hideTimerRef = useRef(null);
  const overControlsRef = useRef(false);
  const bufferingRef = useRef(true);
  const skipTimerRef = useRef(null);
  const skipNonce = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [controls, setControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [levels, setLevels] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [autoLevel, setAutoLevel] = useState(-1);
  const [cues, setCues] = useState([]);
  const [spriteUrl, setSpriteUrl] = useState(null);
  const [preview, setPreview] = useState({ visible: false, x: 0, time: 0 });
  const [skipHint, setSkipHint] = useState(null);
  const [showEndScreen, setShowEndScreen] = useState(false);

  const setBuf = (v) => { bufferingRef.current = v; setBuffering(v); };

  // --- Mostrar controles y programar ocultado tras 3s (patrón clásico) ------
  const bumpControls = useCallback(() => {
    setControls(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused && !bufferingRef.current && !overControlsRef.current) setControls(false);
    }, 3000);
  }, []);

  // --- Fuente: HLS (hls.js / nativo) o MP4 progresivo -----------------------
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let cancelled = false;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    setLevels([]); setSelectedLevel(-1); setShowEndScreen(false); setBuf(true);
    const tryPlay = () => v.play().catch(() => {});

    (async () => {
      if (hlsUrl) {
        const { default: Hls } = await import('hls.js');
        if (cancelled) return;
        if (Hls.isSupported()) {
          const hls = new Hls({ xhrSetup: (xhr) => { xhr.withCredentials = true; } });
          hls.loadSource(hlsUrl);
          hls.attachMedia(v);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setLevels(hls.levels.map((l, i) => ({ index: i, height: l.height })));
            tryPlay();
          });
          hls.on(Hls.Events.LEVEL_SWITCHED, (_e, d) => setAutoLevel(d.level));
          hlsRef.current = hls;
          return;
        }
        if (v.canPlayType('application/vnd.apple.mpegurl')) {
          v.src = hlsUrl; v.addEventListener('loadedmetadata', tryPlay, { once: true }); return;
        }
      }
      v.src = progressiveUrl;
      v.addEventListener('loadedmetadata', tryPlay, { once: true });
    })();

    return () => { cancelled = true; if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [hlsUrl, progressiveUrl]);

  // --- Reanudar desde el progreso guardado ----------------------------------
  useEffect(() => {
    if (restart) return;
    let cancelled = false;
    fetchProgress(mediaId, episodeId).then(({ stopped_at }) => {
      const v = videoRef.current;
      if (cancelled || !v || !stopped_at) return;
      const seek = () => {
        const dur = v.duration;
        if (!(dur && (stopped_at >= dur - 15 || stopped_at / dur >= 0.95))) v.currentTime = stopped_at;
      };
      if (v.readyState >= 1) seek(); else v.addEventListener('loadedmetadata', seek, { once: true });
    });
    return () => { cancelled = true; };
  }, [mediaId, episodeId, restart]);

  // --- Guardar progreso ------------------------------------------------------
  const persist = useCallback(() => {
    const v = videoRef.current;
    if (v && mediaId && v.currentTime) saveProgress(mediaId, episodeId, v.currentTime).catch(() => {});
  }, [mediaId, episodeId]);
  useEffect(() => {
    const id = setInterval(() => { if (!videoRef.current?.paused) persist(); }, 10000);
    const onUnload = () => persist();
    window.addEventListener('beforeunload', onUnload);
    return () => { clearInterval(id); window.removeEventListener('beforeunload', onUnload); persist(); };
  }, [persist]);

  // --- Miniaturas ------------------------------------------------------------
  useEffect(() => {
    setCues([]); setSpriteUrl(null);
    if (!thumbnailsUrl) return;
    let cancelled = false;
    fetch(thumbnailsUrl, { credentials: 'include' })
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((text) => { if (!cancelled) { setCues(parseThumbnailsVtt(text)); setSpriteUrl(thumbnailsUrl.replace('thumbnails.vtt', 'thumbnails.jpg')); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [thumbnailsUrl]);

  // --- Estado de pantalla completa ------------------------------------------
  useEffect(() => {
    const onFs = () => { setIsFullscreen(!!isFsElement()); bumpControls(); };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => { document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs); };
  }, [bumpControls]);

  // En pausa/carga, controles siempre visibles.
  useEffect(() => {
    if (!playing || buffering) { clearTimeout(hideTimerRef.current); setControls(true); }
    else bumpControls();
  }, [playing, buffering, bumpControls]);

  // --- Handlers --------------------------------------------------------------
  const togglePlay = () => { const v = videoRef.current; if (!v) return; if (v.paused) v.play(); else { v.pause(); persist(); } bumpControls(); };
  const onTimeUpdate = () => {
    const v = videoRef.current; if (!v) return;
    setCurrent(v.currentTime || 0);
    try { const b = v.buffered; for (let i = 0; i < b.length; i++) if (b.start(i) <= v.currentTime && v.currentTime <= b.end(i)) { setBufferedEnd(b.end(i)); break; } } catch { /* noop */ }
  };
  const onLoadedMeta = () => setDuration(videoRef.current?.duration || 0);
  const seekTo = (val) => { const v = videoRef.current; if (v && Number.isFinite(val)) { v.currentTime = val; setCurrent(val); } };
  const skip = (delta) => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + delta));
    setCurrent(v.currentTime);
    setSkipHint({ dir: delta < 0 ? -1 : 1, secs: Math.abs(delta), nonce: (skipNonce.current += 1) });
    clearTimeout(skipTimerRef.current);
    skipTimerRef.current = setTimeout(() => setSkipHint(null), 650);
    bumpControls();
  };
  const changeVolume = (val) => { const v = videoRef.current; if (!v) return; v.volume = val; v.muted = val === 0; setVolume(val); setMuted(val === 0); };
  const toggleMute = () => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); if (!v.muted && v.volume === 0) { v.volume = 0.5; setVolume(0.5); } };
  const setQuality = (i) => { if (hlsRef.current) hlsRef.current.currentLevel = i; setSelectedLevel(i); };
  const changeSpeed = (s) => { const v = videoRef.current; if (v) v.playbackRate = s; setSpeed(s); };
  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!isFsElement()) (el?.requestFullscreen || el?.webkitRequestFullscreen)?.call(el);
    else (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  };
  const handleEnded = () => { persist(); setShowEndScreen(true); };
  const handleReplay = () => { const v = videoRef.current; if (v) { v.currentTime = 0; v.play(); } setShowEndScreen(false); };

  // --- Teclado ---------------------------------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      const v = videoRef.current; if (!v) return;
      switch (e.key) {
        case 'ArrowRight': e.preventDefault(); skip(10); break;
        case 'ArrowLeft': e.preventDefault(); skip(-10); break;
        case ' ': case 'k': e.preventDefault(); togglePlay(); break;
        case 'ArrowUp': e.preventDefault(); changeVolume(Math.min(1, (v.muted ? 0 : v.volume) + 0.05)); break;
        case 'ArrowDown': e.preventDefault(); changeVolume(Math.max(0, v.volume - 0.05)); break;
        case 'f': toggleFullscreen(); break;
        case 'm': toggleMute(); break;
        default: break;
      }
      bumpControls();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bumpControls]);

  const progressPct = duration ? (current / duration) * 100 : 0;
  const bufferedPct = duration ? Math.min(100, (bufferedEnd / duration) * 100) : 0;
  const previewCue = preview.visible && cues.length
    ? (cues.find((c) => preview.time >= c.start && preview.time < c.end) || cues[cues.length - 1]) : null;
  const controlsCls = `transition-opacity duration-300 ${controls ? 'opacity-100' : 'pointer-events-none opacity-0'}`;

  return (
    <div
      ref={containerRef}
      data-player
      className={`relative h-full w-full select-none overflow-hidden bg-black ${controls ? '' : 'cursor-none'}`}
      onMouseMove={bumpControls}
      onTouchStart={bumpControls}
    >
      {/* Video (object-contain: correcto en cualquier relación de aspecto) */}
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        onClick={togglePlay}
        onTimeUpdate={onTimeUpdate}
        onProgress={onTimeUpdate}
        onLoadedMetadata={onLoadedMeta}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={handleEnded}
        onWaiting={() => setBuf(true)}
        onStalled={() => setBuf(true)}
        onSeeking={() => setBuf(true)}
        onCanPlay={() => setBuf(false)}
        onPlaying={() => setBuf(false)}
        onSeeked={() => setBuf(false)}
        autoPlay
      />

      {/* Spinner de carga */}
      {buffering && !showEndScreen && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Loader2 size={56} className="animate-spin text-white/90 drop-shadow-lg" />
        </div>
      )}

      {/* Indicador de salto ±10s */}
      <style>{`@keyframes skipfade{0%{opacity:0;transform:scale(.7)}25%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1)}}`}</style>
      {skipHint && (
        <div key={skipHint.nonce}
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${skipHint.dir < 0 ? 'left-[12%]' : 'right-[12%]'}`}
          style={{ animation: 'skipfade 650ms ease-out forwards' }}>
          <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-black/60 text-white backdrop-blur">
            {skipHint.dir < 0 ? <RotateCcw size={26} /> : <RotateCw size={26} />}
            <span className="mt-0.5 text-sm font-semibold">{skipHint.secs}s</span>
          </div>
        </div>
      )}

      {/* Play central cuando está en pausa */}
      {!playing && !buffering && !showEndScreen && (
        <button onClick={togglePlay} className="absolute inset-0 grid place-items-center" aria-label="Reproducir">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition-transform hover:scale-110">
            <Play size={40} fill="currentColor" />
          </span>
        </button>
      )}

      {/* Barra superior */}
      <div className={`absolute left-0 top-0 w-full bg-gradient-to-b from-black/80 to-transparent p-4 ${controlsCls}`}>
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="flex flex-shrink-0 items-center gap-1 rounded bg-black/40 px-3 py-1.5 text-sm text-white hover:bg-black/70">
              <ArrowLeft size={18} /> Volver
            </button>
          )}
          <h2 className="min-w-0 truncate text-lg font-semibold text-white drop-shadow">{title}</h2>
        </div>
      </div>

      {/* Barra de controles inferior */}
      <div
        className={`absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-3 pt-12 sm:px-4 sm:pb-4 ${controlsCls}`}
        onMouseEnter={() => { overControlsRef.current = true; setControls(true); clearTimeout(hideTimerRef.current); }}
        onMouseLeave={() => { overControlsRef.current = false; bumpControls(); }}
      >
        {/* Barra de progreso (buffer + progreso + preview de miniaturas) */}
        <div
          className="relative mb-3"
          onMouseMove={(e) => {
            if (!cues.length || !duration || !spriteUrl) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            setPreview({ visible: true, x: ratio * rect.width, time: ratio * duration });
          }}
          onMouseLeave={() => setPreview((p) => ({ ...p, visible: false }))}
        >
          {previewCue && spriteUrl && (
            <div className="pointer-events-none absolute bottom-4 -translate-x-1/2"
              style={{ left: Math.min(Math.max(preview.x, previewCue.w / 2), (containerRef.current?.clientWidth || 9999) - previewCue.w / 2) }}>
              <div className="rounded border border-white/40 shadow-lg"
                style={{ width: previewCue.w, height: previewCue.h, backgroundImage: `url(${spriteUrl})`, backgroundPosition: `-${previewCue.x}px -${previewCue.y}px`, backgroundRepeat: 'no-repeat' }} />
              <div className="mt-0.5 text-center text-xs font-medium text-white drop-shadow">{fmt(preview.time)}</div>
            </div>
          )}
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/25">
            <div className="absolute inset-y-0 left-0 bg-white/40" style={{ width: `${bufferedPct}%` }} />
            <div className="absolute inset-y-0 left-0 bg-brand" style={{ width: `${progressPct}%` }} />
          </div>
          <input type="range" min={0} max={duration || 0} step="0.1" value={current}
            onChange={(e) => seekTo(Number(e.target.value))}
            className="absolute inset-x-0 top-1/2 h-5 w-full -translate-y-1/2 cursor-pointer opacity-0"
            aria-label="Barra de progreso" />
        </div>

        {/* Botones */}
        <div className="flex items-center gap-2 text-white sm:gap-4">
          <button onClick={togglePlay} className="hover:text-brand">{playing ? <Pause size={26} /> : <Play size={26} />}</button>
          <button onClick={() => skip(-10)} className="hover:text-brand" title="-10s"><RotateCcw size={20} /></button>
          <button onClick={() => skip(10)} className="hover:text-brand" title="+10s"><RotateCw size={20} /></button>
          <div className="flex items-center gap-2">
            <button onClick={toggleMute} className="hover:text-brand">{muted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
            <input type="range" min={0} max={1} step="0.05" value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              className="hidden h-1 w-20 cursor-pointer appearance-none rounded-full bg-gray-500 accent-white sm:block" />
          </div>
          <span className="whitespace-nowrap text-xs tabular-nums text-gray-200 sm:text-sm">{fmt(current)} / {fmt(duration)}</span>
          <div className="flex-1" />
          <div className="relative">
            <button onClick={() => setShowSettings((s) => !s)} className="hover:text-brand" title="Ajustes"><Settings size={22} /></button>
            {showSettings && (
              <div className="absolute bottom-10 right-0 w-52 overflow-hidden rounded-lg bg-black/95 py-2 text-sm shadow-2xl">
                <p className="px-4 pb-1 text-xs uppercase tracking-wide text-gray-400">Velocidad</p>
                <div className="flex flex-wrap gap-1 px-3 pb-2">
                  {SPEEDS.map((s) => (
                    <button key={s} onClick={() => changeSpeed(s)}
                      className={`rounded px-2 py-1 text-xs ${speed === s ? 'bg-brand text-white' : 'bg-white/10 text-gray-200 hover:bg-white/20'}`}>
                      {s === 1 ? 'Normal' : `${s}x`}
                    </button>
                  ))}
                </div>
                {levels.length > 1 && (
                  <>
                    <p className="px-4 pb-1 pt-2 text-xs uppercase tracking-wide text-gray-400">Calidad</p>
                    <button onClick={() => setQuality(-1)}
                      className={`flex w-full items-center justify-between px-4 py-2 hover:bg-white/10 ${selectedLevel === -1 ? 'text-brand' : ''}`}>
                      <span>Automática {autoLevel >= 0 && levels[autoLevel] ? `(${levels[autoLevel].height}p)` : ''}</span>
                      {selectedLevel === -1 && <Check size={16} />}
                    </button>
                    {[...levels].sort((a, b) => b.height - a.height).map((l) => (
                      <button key={l.index} onClick={() => setQuality(l.index)}
                        className={`flex w-full items-center justify-between px-4 py-2 hover:bg-white/10 ${selectedLevel === l.index ? 'text-brand' : ''}`}>
                        <span>{l.height}p</span>{selectedLevel === l.index && <Check size={16} />}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
          <button onClick={toggleFullscreen} className="hover:text-brand" title="Pantalla completa">
            {isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
          </button>
        </div>
      </div>

      {showEndScreen && (
        <EndScreen
          nextItem={nextItem}
          recommendations={recommendations}
          onPlayNext={(path) => onNavigate?.(path)}
          onReplay={handleReplay}
          onHome={() => onNavigate?.('/')}
        />
      )}
    </div>
  );
}
