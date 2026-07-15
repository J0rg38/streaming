// ----------------------------------------------------------------------------
//  MediaCard.jsx — Tarjeta de un título dentro de un carrusel.
//
//  DIFERENCIACIÓN de contenido:
//    - type === 'movie'  -> clic abre la vista de detalle (/movie/:id).
//    - type === 'series' -> clic abre la vista de detalle (/series/:id).
//
//  Indicadores visuales (item.progress viene del backend, por usuario):
//    - Barra inferior con el porcentaje ya visto.
//    - Etiqueta: "Te quedan 45min" / "Visto" / duración total si no se ha visto.
//    - En series, si hay progreso, muestra el capítulo en curso (T1:E3).
// ----------------------------------------------------------------------------
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Play, ListVideo, Clock, EyeOff } from 'lucide-react';
import { progressLabel } from '../utils/format.js';
import { deleteProgress } from '../api.js';

export default function MediaCard({ item, onChanged }) {
  const navigate = useNavigate();
  const isSeries = item.type === 'series';
  const [cleared, setCleared] = useState(false); // marcado como "no visto" localmente
  const [menu, setMenu] = useState(null);         // { x, y } del menú contextual
  const p = cleared ? null : item.progress;       // null si no hay/borramos el progreso

  const handleClick = () => {
    if (isSeries) navigate(`/series/${item.id}`);
    else navigate(`/movie/${item.id}`);
  };

  // Clic derecho: si hay progreso, ofrece "marcar como no vista".
  // Fijamos la posición ya acotada a la ventana (para que no se salga).
  const onContext = (e) => {
    if (!item.progress || cleared) return;
    e.preventDefault();
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - 230));
    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - 60));
    setMenu({ x, y });
  };
  const markUnwatched = async (e) => {
    e.stopPropagation();
    setMenu(null);
    try { await deleteProgress(item.id); setCleared(true); onChanged?.(); }
    catch { /* noop */ }
  };

  // Etiqueta de tiempo: restante si hay progreso, duración total si no.
  const timeLabel = progressLabel(p, item.duration);
  const percent = p?.percent ?? 0;

  return (
    <div
      onClick={handleClick}
      onContextMenu={onContext}
      className="group relative w-28 flex-shrink-0 cursor-pointer transition-transform duration-200 hover:scale-105 sm:w-36 md:w-40"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md shadow-lg">
        <img src={item.poster_url} alt={item.title} className="h-full w-full object-cover" loading="lazy" />

        {/* Overlay al pasar el ratón */}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/20 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
          <p className="truncate text-sm font-semibold">{item.title}</p>
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-300">
            {isSeries ? <><ListVideo size={14} /> Serie</> : <><Play size={14} /> Película</>}
          </div>
        </div>

        {/* Etiqueta de tipo */}
        <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
          {isSeries ? 'Serie' : 'Película'}
        </span>

        {/* Barra de progreso ya visto (parte inferior de la imagen) */}
        {percent > 0 && (
          <div className="absolute bottom-0 left-0 h-1 w-full bg-black/50">
            <div className="h-full bg-brand" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>

      {/* Etiqueta de tiempo bajo la tarjeta */}
      {timeLabel && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-400">
          <Clock size={11} />
          <span className={p && p.percent >= 95 ? 'text-green-400' : ''}>{timeLabel}</span>
          {/* En series con progreso, indicamos el capítulo en curso */}
          {isSeries && p?.episode && (
            <span className="text-gray-500">
              · T{p.episode.season_number}:E{p.episode.episode_number}
            </span>
          )}
        </div>
      )}

      {/* Menú contextual (clic derecho): marcar como no vista.
          Se renderiza en un PORTAL a <body> para que 'position: fixed' sea
          relativo a la ventana y no a la tarjeta (que usa hover:scale). */}
      {menu && createPortal(
        <div className="fixed inset-0 z-[100]"
          onClick={(e) => { e.stopPropagation(); setMenu(null); }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu(null); }}
          onWheel={() => setMenu(null)}
        >
          <div
            className="fixed w-[210px] overflow-hidden rounded-lg border border-gray-700 bg-card shadow-2xl"
            style={{ top: menu.y, left: menu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={markUnwatched}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-200 hover:bg-white/10"
            >
              <EyeOff size={15} /> Marcar como no vista
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
