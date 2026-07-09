// ----------------------------------------------------------------------------
//  SeriesDetail.jsx — Vista de detalle de una SERIE.
//
//  Muestra:
//    1. Banner + descripción de la serie.
//    2. Un <select> (dropdown) para cambiar de temporada.
//    3. La lista de capítulos de la temporada elegida, con número, título,
//       duración y barra de progreso si el capítulo se empezó a ver.
//
//  Al hacer clic en un capítulo -> /watch/:mediaId/:episodeId (reproductor).
// ----------------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, ArrowLeft, Clock } from 'lucide-react';
import { fetchMedia, fetchSimilar } from '../api.js';
import { formatClock, progressLabel } from '../utils/format.js';
import Carousel from './Carousel.jsx';

export default function SeriesDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [series, setSeries] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState(null);

  // Carga el detalle de la serie (incluye seasons -> episodes).
  useEffect(() => {
    fetchMedia(id)
      .then((data) => {
        setSeries(data);
        // Por defecto seleccionamos la primera temporada disponible.
        if (data.seasons?.length) setSelectedSeason(data.seasons[0].season);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
    // Títulos similares (por género).
    fetchSimilar(id).then(setSimilar).catch(() => setSimilar([]));
  }, [id]);

  // Capítulos de la temporada actualmente seleccionada.
  const currentEpisodes = useMemo(() => {
    if (!series?.seasons) return [];
    const s = series.seasons.find((s) => s.season === selectedSeason);
    return s?.episodes || [];
  }, [series, selectedSeason]);

  if (loading) {
    return <div className="grid h-screen place-items-center text-gray-400">Cargando serie…</div>;
  }
  if (!series || series.type !== 'series') {
    return <div className="grid h-screen place-items-center text-gray-400">No es una serie válida.</div>;
  }

  return (
    <div className="min-h-screen">
      {/* -------- Banner de la serie -------- */}
      <div className="relative h-[45vh] w-full">
        <img
          src={series.banner_url || series.poster_url}
          alt={series.title}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/50 to-transparent" />

        <button
          onClick={() => navigate('/')}
          className="absolute left-4 top-4 flex items-center gap-1 rounded bg-black/50 px-3 py-1.5 text-sm hover:bg-black/70 sm:left-6 sm:top-6"
        >
          <ArrowLeft size={18} /> Volver
        </button>

        <div className="absolute bottom-4 left-4 right-4 max-w-2xl sm:bottom-6 sm:left-8 sm:right-auto">
          <h1 className="text-2xl font-extrabold drop-shadow-lg sm:text-4xl">{series.title}</h1>
          <p className="mt-1 text-xs text-gray-300 sm:text-sm">
            {series.release_year} · {series.genres?.join(' · ')}
          </p>
        </div>
      </div>

      {/* -------- Descripción + reparto -------- */}
      <div className="max-w-3xl px-4 py-4 sm:px-8">
        <p className="text-sm text-gray-200 sm:text-base">{series.description}</p>
        {series.actors?.length > 0 && (
          <p className="mt-2 text-sm text-gray-400">
            <span className="text-gray-500">Reparto:</span> {series.actors.join(', ')}
          </p>
        )}
      </div>

      {/* -------- Selector de temporada -------- */}
      <div className="flex items-center gap-3 px-4 sm:px-8">
        <span className="font-semibold">Temporada:</span>
        <select
          value={selectedSeason ?? ''}
          onChange={(e) => setSelectedSeason(Number(e.target.value))}
          className="rounded border border-gray-600 bg-card px-4 py-2 text-white focus:border-brand focus:outline-none"
        >
          {series.seasons.map((s) => (
            <option key={s.season} value={s.season}>
              Temporada {s.season}
            </option>
          ))}
        </select>
      </div>

      {/* -------- Lista de capítulos de la temporada seleccionada -------- */}
      <div className="mt-4 flex flex-col gap-2 px-4 pb-16 sm:px-8">
        {currentEpisodes.map((ep) => {
          // El backend ya calcula el progreso del usuario para cada capítulo.
          const pct = ep.progress?.percent ?? 0;
          // Etiqueta: "Te quedan Xmin" / "Visto" / duración total si no se vio.
          const label = progressLabel(ep.progress, ep.duration);

          return (
            <div
              key={ep.id}
              onClick={() => navigate(`/watch/${series.id}/${ep.id}`)}
              className="group flex cursor-pointer items-center gap-4 rounded-lg bg-card p-4 transition-colors hover:bg-gray-700"
            >
              {/* Número de capítulo */}
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-black/40 text-lg font-bold text-gray-300">
                {ep.episode_number}
              </div>

              {/* Icono play */}
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/10 group-hover:bg-brand">
                <Play size={18} />
              </div>

              {/* Título + progreso */}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {ep.title || `Capítulo ${ep.episode_number}`}
                </p>
                {/* Duración total y/o cuánto falta por ver */}
                <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                  {ep.duration ? (
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {formatClock(ep.duration)}
                    </span>
                  ) : null}
                  {label && (
                    <span className={ep.progress?.percent >= 95 ? 'text-green-400' : 'text-brand'}>
                      · {label}
                    </span>
                  )}
                </div>

                {/* Barra de progreso (sólo si hay algo visto) */}
                {pct > 0 && (
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-600">
                    <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {currentEpisodes.length === 0 && (
          <p className="text-gray-400">No hay capítulos en esta temporada.</p>
        )}
      </div>

      {/* -------- Títulos similares -------- */}
      {similar.length > 0 && (
        <div className="pb-16">
          <Carousel title="Títulos similares" items={similar} />
        </div>
      )}
    </div>
  );
}
