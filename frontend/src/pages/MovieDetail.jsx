// ----------------------------------------------------------------------------
//  MovieDetail.jsx — Página de detalle de una PELÍCULA (antes de reproducir).
//
//  Muestra banner, sinopsis, año, géneros y duración. El botón principal lleva
//  al reproductor (/watch/:id). Si el usuario ya la empezó, ofrece "Reanudar"
//  e indica cuánto le queda.
// ----------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, RotateCcw, ArrowLeft, Clock, Home, CalendarClock } from 'lucide-react';
import { fetchMedia, fetchSimilar } from '../api.js';
import { formatMinutes, progressLabel } from '../utils/format.js';
import Carousel from '../components/Carousel.jsx';

export default function MovieDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchMedia(id)
      .then((data) => {
        if (data.type !== 'movie') {
          // Si por alguna razón es una serie, la mandamos a su vista correcta.
          navigate(`/series/${id}`, { replace: true });
          return;
        }
        setMovie(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // Títulos similares (por género).
    fetchSimilar(id).then(setSimilar).catch(() => setSimilar([]));
  }, [id, navigate]);

  if (loading) {
    return <div className="grid h-screen place-items-center text-gray-400">Cargando…</div>;
  }
  if (error || !movie) {
    return (
      <div className="grid h-screen place-items-center text-gray-400">
        <div className="text-center">
          <p className="mb-4">{error || 'No encontrada'}</p>
          <button onClick={() => navigate('/')} className="rounded bg-brand px-4 py-2">Volver</button>
        </div>
      </div>
    );
  }

  const p = movie.progress;
  const started = p && p.stopped_at > 0 && (p.percent === null || p.percent < 95);
  const label = progressLabel(p, movie.duration);

  return (
    <div className="min-h-screen">
      {/* -------- Banner -------- */}
      <div className="relative h-[60vh] w-full">
        <img
          src={movie.banner_url || movie.poster_url}
          alt={movie.title}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-surface/80 to-transparent" />

        <div className="absolute left-4 top-4 flex items-center gap-2 sm:left-6 sm:top-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 rounded bg-black/50 px-3 py-1.5 text-sm hover:bg-black/70"
          >
            <ArrowLeft size={18} /> Volver
          </button>
          <button
            onClick={() => navigate(movie.is_adult ? '/adultos' : '/')}
            title="Ir al inicio"
            className="flex items-center gap-1 rounded bg-black/50 px-3 py-1.5 text-sm hover:bg-black/70"
          >
            <Home size={18} /> <span className="hidden sm:inline">Inicio</span>
          </button>
        </div>
      </div>

      {/* -------- Información + acciones -------- */}
      <div className="relative z-10 -mt-24 px-4 pb-16 sm:-mt-40 sm:px-8">
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Póster */}
          <img
            src={movie.poster_url}
            alt={movie.title}
            className="hidden h-72 w-48 flex-shrink-0 rounded-lg object-cover shadow-2xl md:block"
          />

          {/* Texto */}
          <div className="max-w-2xl">
            <h1 className="text-3xl font-extrabold drop-shadow-lg sm:text-5xl">{movie.title}</h1>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-300">
              {movie.release_year && <span>{movie.release_year}</span>}
              {movie.duration && (
                <span className="flex items-center gap-1"><Clock size={14} /> {formatMinutes(movie.duration)}</span>
              )}
              {movie.genres?.length > 0 && <span>{movie.genres.join(' · ')}</span>}
            </div>

            {/* Barra de progreso si ya vio algo */}
            {p && p.percent > 0 && (
              <div className="mt-4 max-w-md">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
                  <div className="h-full bg-brand" style={{ width: `${p.percent}%` }} />
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {p.percent >= 95 ? 'Visto' : label}
                </p>
              </div>
            )}

            <p className="mt-4 text-gray-200">{movie.description || 'Sin descripción.'}</p>

            {movie.actors?.length > 0 && (
              <p className="mt-3 text-sm text-gray-400">
                <span className="text-gray-500">Reparto:</span> {movie.actors.join(', ')}
              </p>
            )}

            {/* Botones — o aviso de "Próximamente" si aún no tiene video */}
            {movie.coming_soon ? (
              <div className="mt-6 inline-flex items-center gap-2 rounded-lg border border-brand/40 bg-brand/10 px-5 py-3 font-semibold text-brand">
                <CalendarClock size={20} /> Próximamente
                {movie.release_date && (
                  <span className="text-gray-300">
                    · Estreno {new Date(movie.release_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                )}
              </div>
            ) : (
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => navigate(`/watch/${movie.id}`)}
                  className="flex items-center gap-2 rounded bg-white px-6 py-2.5 font-semibold text-black hover:bg-gray-200 sm:px-8 sm:py-3"
                >
                  {started ? <RotateCcw size={20} /> : <Play size={20} />}
                  {started ? 'Reanudar' : 'Reproducir'}
                </button>

                {/* Si ya empezó, permitir también empezar de cero */}
                {started && (
                  <button
                    onClick={() => navigate(`/watch/${movie.id}?restart=1`)}
                    className="flex items-center gap-2 rounded bg-gray-600/70 px-5 py-2.5 font-semibold hover:bg-gray-600 sm:px-6 sm:py-3"
                  >
                    <Play size={20} /> Ver desde el inicio
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* -------- Títulos similares -------- */}
        {similar.length > 0 && (
          <div className="mt-12 -mx-4 sm:-mx-8">
            <Carousel title="Títulos similares" items={similar} />
          </div>
        )}
      </div>
    </div>
  );
}
