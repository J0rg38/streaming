// ----------------------------------------------------------------------------
//  VideoPlayer.jsx — Reproductor de video personalizado con streaming
//  adaptativo (HLS + hls.js).
//
//  Props:
//    - hlsUrl        : URL del master playlist HLS si está listo (o null).
//    - progressiveUrl: URL de respaldo (MP4 progresivo por rangos).
//    - mediaId       : id del título (obligatorio para guardar progreso).
//    - episodeId     : id del capítulo (null si es película).
//    - title         : texto de la barra superior.
//    - restart       : si true, empieza desde 0 (ignora el progreso guardado).
//
//  Cuando hay HLS, hls.js mide el ancho de banda y cambia de resolución
//  automáticamente (ABR) igual que Netflix. Además se ofrece un selector
//  manual de calidad. Si no hay HLS aún (transcodificando), usa el MP4.
// ----------------------------------------------------------------------------
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Maximize,
  RotateCcw, RotateCw, Settings, ArrowLeft, Loader2,
} from 'lucide-react';
// hls.js se carga de forma diferida (import dinámico) para no engordar el
// bundle inicial: sólo se descarga cuando se abre el reproductor.
import { fetchProgress, saveProgress } from '../api.js';
import EndScreen from './EndScreen.jsx';

// Convierte segundos -> "mm:ss" / "h:mm:ss".
function fmt(t) {
  if (!Number.isFinite(t)) return '0:00';
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

// "HH:MM:SS.mmm" -> segundos.
function vttTime(t) {
  const [hh, mm, rest] = t.split(':');
  const [ss, ms = '0'] = (rest || '0').split('.');
  return (+hh) * 3600 + (+mm) * 60 + (+ss) + (+ms) / 1000;
}

// Parsea el WebVTT de miniaturas -> [{ start, end, x, y, w, h }].
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

export default function VideoPlayer({
  hlsUrl, progressiveUrl, thumbnailsUrl, mediaId, episodeId = null, title, restart = false,
  nextItem = null, recommendations = [], onNavigate, onBack,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hideTimerRef = useRef(null); // temporizador para ocultar los controles
  const hlsRef = useRef(null);       // instancia de hls.js
  const [showEndScreen, setShowEndScreen] = useState(false);
  const [buffering, setBuffering] = useState(true); // mostrando icono de carga

  // Miniaturas del preview de la barra (sprite + cues del WebVTT).
  const [cues, setCues] = useState([]);
  const [spriteUrl, setSpriteUrl] = useState(null);
  const [preview, setPreview] = useState({ visible: false, x: 0, time: 0 });

  useEffect(() => {
    setCues([]); setSpriteUrl(null);
    if (!thumbnailsUrl) return;
    let cancelled = false;
    fetch(thumbnailsUrl, { credentials: 'include' })
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((text) => {
        if (cancelled) return;
        setCues(parseThumbnailsVtt(text));
        setSpriteUrl(thumbnailsUrl.replace('thumbnails.vtt', 'thumbnails.jpg'));
      })
      .catch(() => { /* sin miniaturas: no pasa nada */ });
    return () => { cancelled = true; };
  }, [thumbnailsUrl]);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);

  // Calidad (HLS): niveles disponibles, selección manual (-1 = automático) y
  // el nivel que el ABR está usando en cada momento.
  const [levels, setLevels] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState(-1); // -1 = Auto
  const [autoLevel, setAutoLevel] = useState(-1);
  const [showQuality, setShowQuality] = useState(false);

  // --- Configuración de la fuente: HLS (hls.js / nativo) o MP4 progresivo ---
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let cancelled = false;

    // Limpiamos cualquier instancia previa de hls.js.
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    setLevels([]);
    setShowEndScreen(false); // nuevo video -> ocultamos la pantalla de fin
    setBuffering(true);      // mostramos el icono de carga hasta que pueda reproducir

    // Intenta iniciar la reproducción automáticamente. Si el navegador la
    // bloquea (política de autoplay), se queda en pausa y el usuario dará play.
    const tryPlay = () => { v.play().catch(() => {}); };

    async function setup() {
      if (hlsUrl) {
        // Import dinámico: hls.js se descarga en su propio chunk bajo demanda.
        const { default: Hls } = await import('hls.js');
        if (cancelled) return;

        if (Hls.isSupported()) {
          // hls.js: ABR automático. withCredentials envía la cookie de sesión.
          const hls = new Hls({
            xhrSetup: (xhr) => { xhr.withCredentials = true; },
            startLevel: -1,
          });
          hls.loadSource(hlsUrl);
          hls.attachMedia(v);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            const lv = hls.levels.map((l, i) => ({ index: i, height: l.height, bitrate: l.bitrate }));
            setLevels(lv);
            tryPlay(); // <-- arranque automático (el atributo autoplay no basta con hls.js)
          });
          hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => setAutoLevel(data.level));
          hlsRef.current = hls;
          return;
        }
        if (v.canPlayType('application/vnd.apple.mpegurl')) {
          v.src = hlsUrl; // Safari: HLS nativo
          v.addEventListener('loadedmetadata', tryPlay, { once: true });
          return;
        }
      }
      // Respaldo: MP4 progresivo por rangos HTTP (mientras se transcodifica).
      v.src = progressiveUrl;
      v.addEventListener('loadedmetadata', tryPlay, { once: true });
    }
    setup();

    return () => {
      cancelled = true;
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, [hlsUrl, progressiveUrl]);

  // Cambia la calidad manualmente. levelIndex = -1 -> automático (ABR).
  const setQuality = (levelIndex) => {
    if (hlsRef.current) hlsRef.current.currentLevel = levelIndex;
    setSelectedLevel(levelIndex);
    setShowQuality(false);
  };

  // --- Guardado del progreso (reutilizable) -------------------------------
  const persist = useCallback(() => {
    const v = videoRef.current;
    if (!v || !mediaId || !v.currentTime) return;
    saveProgress(mediaId, episodeId, v.currentTime).catch(() => {});
  }, [mediaId, episodeId]);

  // --- Al montar / cambiar de video: recuperar posición previa ------------
  //  Si restart=true ("Ver desde el inicio"), NO reanudamos: empezamos en 0.
  useEffect(() => {
    if (restart) return; // arrancar desde el principio
    let cancelled = false;
    fetchProgress(mediaId, episodeId).then(({ stopped_at }) => {
      const v = videoRef.current;
      if (!cancelled && v && stopped_at > 0) {
        // Esperamos a tener metadata para conocer la duración.
        const seek = () => {
          const dur = v.duration;
          // Si ya estaba (prácticamente) terminado, empezamos desde el inicio
          // en lugar de reanudar al final. Evita el bucle de "ya visto" que
          // saltaba de una peli terminada a otra retomándola en su final.
          const finished = dur && (stopped_at >= dur - 15 || stopped_at / dur >= 0.95);
          if (!finished) v.currentTime = stopped_at;
        };
        if (v.readyState >= 1) seek();
        else v.addEventListener('loadedmetadata', seek, { once: true });
      }
    });
    return () => { cancelled = true; };
  }, [mediaId, episodeId, restart]);

  // --- Guardado periódico cada 10 segundos --------------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      if (!videoRef.current?.paused) persist();
    }, 10_000); // <-- cada 10s, según requisito
    return () => clearInterval(interval);
  }, [persist]);

  // --- Guardar también al abandonar la página (cerrar/refrescar) ----------
  useEffect(() => {
    const onUnload = () => persist();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      persist(); // guardar al desmontar (p.ej. cambiar de capítulo)
    };
  }, [persist]);

  // --- Handlers del elemento <video> --------------------------------------
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); persist(); }
  };

  const onTimeUpdate = () => setCurrent(videoRef.current?.currentTime || 0);
  const onLoadedMeta = () => setDuration(videoRef.current?.duration || 0);

  const seekTo = (value) => {
    const v = videoRef.current;
    if (v) { v.currentTime = value; setCurrent(value); }
  };

  const skip = (delta) => seekTo(Math.max(0, Math.min(duration, current + delta)));

  // --- Mostrar controles y programar su ocultado tras 3s de inactividad ----
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      // Sólo ocultamos si el video se está reproduciendo.
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, 3000);
  }, []);

  // Si el video se pausa, mostramos los controles de forma permanente.
  useEffect(() => {
    if (!playing) {
      clearTimeout(hideTimerRef.current);
      setShowControls(true);
    } else {
      showControlsTemporarily();
    }
    return () => clearTimeout(hideTimerRef.current);
  }, [playing, showControlsTemporarily]);

  // --- Atajos de teclado ---------------------------------------------------
  //  ← / → : retroceder / avanzar 10s. Espacio o K: play/pausa.
  //  ↑ / ↓ : subir / bajar volumen. F: pantalla completa. M: silenciar.
  useEffect(() => {
    const onKey = (e) => {
      const v = videoRef.current;
      if (!v) return;
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 10);
          showControlsTemporarily();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 10);
          showControlsTemporarily();
          break;
        case ' ':
        case 'k':
          e.preventDefault();
          if (v.paused) v.play(); else v.pause();
          showControlsTemporarily();
          break;
        case 'ArrowUp':
          e.preventDefault();
          changeVolume(Math.min(1, (v.muted ? 0 : v.volume) + 0.05));
          showControlsTemporarily();
          break;
        case 'ArrowDown':
          e.preventDefault();
          changeVolume(Math.max(0, v.volume - 0.05));
          showControlsTemporarily();
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'm':
          toggleMute();
          showControlsTemporarily();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showControlsTemporarily]);

  const changeVolume = (value) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = value;
    setVolume(value);
    setMuted(value === 0);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!document.fullscreenElement) el?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  // Al terminar el video: guardamos progreso y mostramos la pantalla de fin.
  const handleEnded = () => {
    persist();
    setShowEndScreen(true);
  };

  // "Ver de nuevo": reinicia desde 0 y oculta la pantalla de fin.
  const handleReplay = () => {
    const v = videoRef.current;
    if (v) { v.currentTime = 0; v.play(); }
    setShowEndScreen(false);
  };

  const progressPct = duration ? (current / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full bg-black ${showControls ? '' : 'cursor-none'}`}
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => { if (!videoRef.current?.paused) setShowControls(false); }}
    >
      {/* La fuente (HLS o MP4) la asigna el efecto de configuración. */}
      <video
        ref={videoRef}
        className="h-full w-full"
        onClick={togglePlay}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMeta}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={handleEnded}
        onWaiting={() => setBuffering(true)}    // el video espera datos (buffering)
        onSeeking={() => setBuffering(true)}
        onCanPlay={() => setBuffering(false)}
        onPlaying={() => setBuffering(false)}
        onSeeked={() => setBuffering(false)}
        autoPlay
      />

      {/* Icono de carga (buffering / carga inicial) */}
      {buffering && !showEndScreen && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Loader2 size={56} className="animate-spin text-white/90 drop-shadow-lg" />
        </div>
      )}

      {/* Barra superior: botón volver + título (mismo patrón que Netflix) */}
      {showControls && (
        <div className="pointer-events-none absolute left-0 top-0 w-full bg-gradient-to-b from-black/80 to-transparent p-4">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="pointer-events-auto flex flex-shrink-0 items-center gap-1 rounded bg-black/40 px-3 py-1.5 text-sm text-white hover:bg-black/70"
              >
                <ArrowLeft size={18} /> Volver
              </button>
            )}
            <h2 className="min-w-0 truncate text-lg font-semibold drop-shadow">{title}</h2>
          </div>
        </div>
      )}

      {/* -------- Barra de controles inferior -------- */}
      {showControls && (
        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10">
          {/* Barra de progreso (seekable) con preview de miniaturas */}
          <div
            className="relative mb-2"
            onMouseMove={(e) => {
              if (!cues.length || !duration || !spriteUrl) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
              setPreview({ visible: true, x: ratio * rect.width, time: ratio * duration });
            }}
            onMouseLeave={() => setPreview((p) => ({ ...p, visible: false }))}
          >
            {/* Miniatura flotante en el punto donde está el cursor */}
            {preview.visible && spriteUrl && (() => {
              const cue = cues.find((c) => preview.time >= c.start && preview.time < c.end) || cues[cues.length - 1];
              if (!cue) return null;
              // Clamp horizontal para que la miniatura no se salga del contenedor.
              const half = cue.w / 2;
              const left = Math.min(Math.max(preview.x, half), (containerRef.current?.clientWidth || 9999) - half);
              return (
                <div className="pointer-events-none absolute bottom-5 -translate-x-1/2" style={{ left }}>
                  <div
                    className="rounded border border-white/40 shadow-lg"
                    style={{
                      width: cue.w, height: cue.h,
                      backgroundImage: `url(${spriteUrl})`,
                      backgroundPosition: `-${cue.x}px -${cue.y}px`,
                      backgroundRepeat: 'no-repeat',
                    }}
                  />
                  <div className="mt-0.5 text-center text-xs font-medium text-white drop-shadow">{fmt(preview.time)}</div>
                </div>
              );
            })()}

            <input
              type="range"
              min={0}
              max={duration || 0}
              step="0.1"
              value={current}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-600 accent-brand"
              style={{
                background: `linear-gradient(to right, #e50914 ${progressPct}%, #4b5563 ${progressPct}%)`,
              }}
            />
          </div>

          <div className="flex items-center gap-2 text-white sm:gap-4">
            {/* Play / pausa */}
            <button onClick={togglePlay} className="hover:text-brand">
              {playing ? <Pause size={24} /> : <Play size={24} />}
            </button>

            {/* Saltos ±10s */}
            <button onClick={() => skip(-10)} className="hover:text-brand" title="-10s">
              <RotateCcw size={20} />
            </button>
            <button onClick={() => skip(10)} className="hover:text-brand" title="+10s">
              <RotateCw size={20} />
            </button>

            {/* Volumen (el deslizador se oculta en móvil; queda el silenciar) */}
            <div className="flex items-center gap-2">
              <button onClick={toggleMute} className="hover:text-brand">
                {muted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <input
                type="range"
                min={0} max={1} step="0.05"
                value={muted ? 0 : volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
                className="hidden h-1 w-20 cursor-pointer appearance-none rounded-full bg-gray-600 accent-white sm:block"
              />
            </div>

            {/* Tiempo */}
            <span className="whitespace-nowrap text-xs tabular-nums text-gray-200 sm:text-sm">
              {fmt(current)} / {fmt(duration)}
            </span>

            <div className="flex-1" />

            {/* Selector de calidad (sólo con HLS y varios niveles) */}
            {levels.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowQuality((s) => !s)}
                  className="flex items-center gap-1 hover:text-brand"
                  title="Calidad"
                >
                  <Settings size={22} />
                  <span className="text-xs">
                    {selectedLevel === -1
                      ? `Auto${autoLevel >= 0 && levels[autoLevel] ? ` (${levels[autoLevel].height}p)` : ''}`
                      : `${levels.find((l) => l.index === selectedLevel)?.height}p`}
                  </span>
                </button>

                {showQuality && (
                  <div className="absolute bottom-9 right-0 min-w-[140px] overflow-hidden rounded-md bg-black/90 py-1 text-sm shadow-xl">
                    {/* Automático (ABR) */}
                    <button
                      onClick={() => setQuality(-1)}
                      className={`flex w-full items-center justify-between px-4 py-2 hover:bg-white/10 ${selectedLevel === -1 ? 'text-brand' : ''}`}
                    >
                      Automático
                      {selectedLevel === -1 && <span className="text-xs text-gray-400">ABR</span>}
                    </button>
                    {/* Niveles concretos, de mayor a menor */}
                    {[...levels].sort((a, b) => b.height - a.height).map((l) => (
                      <button
                        key={l.index}
                        onClick={() => setQuality(l.index)}
                        className={`block w-full px-4 py-2 text-left hover:bg-white/10 ${selectedLevel === l.index ? 'text-brand' : ''}`}
                      >
                        {l.height}p
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Pantalla completa */}
            <button onClick={toggleFullscreen} className="hover:text-brand">
              <Maximize size={22} />
            </button>
          </div>
        </div>
      )}

      {/* -------- Pantalla de fin (recomendaciones + autoplay) -------- */}
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
