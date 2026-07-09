// ----------------------------------------------------------------------------
//  EndScreen.jsx — Pantalla al terminar una película o capítulo (estilo Netflix).
//
//  - Fondo cinematográfico con el banner de "lo siguiente" (desenfocado).
//  - Botón de reproducir con un ANILLO de cuenta atrás que se rellena.
//  - Autoreproduce lo siguiente al llegar a 0.
//  - Detalle único: el contador se PAUSA automáticamente si cambias de pestaña
//    (visibilitychange), y lo indica; se reanuda al volver. Así no salta de
//    título mientras no estás mirando.
//
//  Props:
//    - nextItem       : { title, subtitle, meta, poster_url, banner_url, path } | null
//    - recommendations: array de títulos (tarjetas).
//    - onPlayNext(path), onReplay(), onHome(), seconds (por defecto 10).
// ----------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, Home, X, PauseCircle } from 'lucide-react';
import MediaCard from './MediaCard.jsx';

export default function EndScreen({
  nextItem, recommendations = [], onPlayNext, onReplay, onHome, seconds = 10,
}) {
  const [remaining, setRemaining] = useState(seconds);
  const [cancelled, setCancelled] = useState(false); // el usuario detuvo el contador
  const [hidden, setHidden] = useState(false);       // pestaña en segundo plano
  const timerRef = useRef(null);

  // El contador corre sólo si hay "siguiente", no se canceló y la pestaña está visible.
  const counting = Boolean(nextItem) && !cancelled && !hidden;

  // Pausa/reanuda según la visibilidad de la pestaña (detalle único).
  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Cuenta atrás.
  useEffect(() => {
    if (!counting) return;
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(timerRef.current);
          onPlayNext(nextItem.path);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [counting, nextItem, onPlayNext]);

  // Anillo circular del botón de play (0..1 relleno).
  const R = 34;
  const C = 2 * Math.PI * R;
  const ringOffset = C * (remaining / seconds);
  const backdrop = nextItem?.banner_url || nextItem?.poster_url;

  return (
    <div className="absolute inset-0 z-40 overflow-hidden">
      {/* -------- Fondo cinematográfico -------- */}
      {backdrop && (
        <img
          src={backdrop}
          alt=""
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-[2px]"
          style={{ animation: 'endzoom 12s ease-out forwards' }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/50" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      {/* Keyframes del zoom lento (Ken Burns) */}
      <style>{`@keyframes endzoom{from{transform:scale(1.15)}to{transform:scale(1.02)}}`}</style>

      {/* -------- Contenido -------- */}
      <div className="relative z-10 flex h-full flex-col justify-center gap-8 overflow-y-auto px-6 py-10 md:px-16">
        {nextItem ? (
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">
              {nextItem.subtitle || 'A continuación'}
            </p>
            <h2 className="mt-2 text-4xl font-extrabold drop-shadow-lg md:text-5xl">{nextItem.title}</h2>
            {nextItem.meta && <p className="mt-2 text-sm text-gray-300">{nextItem.meta}</p>}

            <div className="mt-6 flex items-center gap-4">
              {/* Botón play con anillo de cuenta atrás */}
              <div className="relative h-20 w-20 flex-shrink-0">
                {counting && (
                  <svg className="absolute inset-0 -rotate-90" width="80" height="80">
                    <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
                    <circle
                      cx="40" cy="40" r={R} fill="none" stroke="#e50914" strokeWidth="4"
                      strokeDasharray={C} strokeDashoffset={C - ringOffset} strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 1s linear' }}
                    />
                  </svg>
                )}
                <button
                  onClick={() => onPlayNext(nextItem.path)}
                  className="absolute inset-2 grid place-items-center rounded-full bg-white text-black transition-transform hover:scale-105"
                  title="Reproducir ahora"
                >
                  <Play size={30} fill="currentColor" />
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-lg font-semibold">
                  {counting ? `Reproduciendo en ${remaining}s` : cancelled ? 'Reproducción automática pausada' : ''}
                </span>
                {hidden && !cancelled && (
                  <span className="flex items-center gap-1 text-sm text-gray-400">
                    <PauseCircle size={15} /> En pausa (pestaña en segundo plano)
                  </span>
                )}
                <div className="mt-1 flex flex-wrap gap-2">
                  {counting && (
                    <button onClick={() => setCancelled(true)}
                      className="flex items-center gap-1 rounded bg-white/15 px-4 py-1.5 text-sm font-medium hover:bg-white/25">
                      <X size={15} /> Cancelar
                    </button>
                  )}
                  <button onClick={onReplay}
                    className="flex items-center gap-1 rounded bg-white/15 px-4 py-1.5 text-sm font-medium hover:bg-white/25">
                    <RotateCcw size={15} /> Ver de nuevo
                  </button>
                  <button onClick={onHome}
                    className="flex items-center gap-1 rounded bg-white/15 px-4 py-1.5 text-sm font-medium hover:bg-white/25">
                    <Home size={15} /> Inicio
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Sin "siguiente": sólo repetir / volver.
          <div className="max-w-2xl">
            <h2 className="text-4xl font-extrabold">Has terminado</h2>
            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={onReplay} className="flex items-center gap-2 rounded bg-white px-6 py-2.5 font-semibold text-black hover:bg-gray-200">
                <RotateCcw size={18} /> Ver de nuevo
              </button>
              <button onClick={onHome} className="flex items-center gap-2 rounded bg-white/15 px-5 py-2.5 font-semibold hover:bg-white/25">
                <Home size={18} /> Volver al inicio
              </button>
            </div>
          </div>
        )}

        {/* -------- Recomendaciones -------- */}
        {recommendations.length > 0 && (
          <div>
            <h3 className="mb-3 text-lg font-bold">Más títulos para ti</h3>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {recommendations.slice(0, 10).map((item) => (
                <MediaCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
