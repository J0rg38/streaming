// ----------------------------------------------------------------------------
//  Search.jsx — Buscador de películas y series.
//  Busca por título, género y actores. Si no hay coincidencia exacta, muestra
//  resultados SIMILARES (el backend usa similitud trigram).
// ----------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Search as SearchIcon, Loader2, X } from 'lucide-react';
import { searchMedia } from '../api.js';
import MediaCard from '../components/MediaCard.jsx';

export default function Search() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState(params.get('q') || '');
  const [data, setData] = useState(null);   // { results, hasTitleMatch }
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Búsqueda con "debounce" (espera 350ms tras dejar de escribir).
  useEffect(() => {
    const term = q.trim();
    // Sincronizamos el término con la URL (para poder compartir/recargar).
    setParams(term ? { q: term } : {}, { replace: true });

    if (!term) { setData(null); return; }
    setLoading(true);
    const t = setTimeout(() => {
      searchMedia(term)
        .then(setData)
        .catch(() => setData({ results: [], hasTitleMatch: false }))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [q, setParams]);

  const results = data?.results || [];
  const showSimilarNote = data && results.length > 0 && !data.hasTitleMatch;

  return (
    <div className="min-h-screen">
      {/* -------- Barra superior con el buscador -------- */}
      <div className="sticky top-0 z-20 flex items-center gap-3 bg-surface/95 px-4 py-3 backdrop-blur sm:px-8">
        <button onClick={() => navigate('/')} className="flex-shrink-0 text-gray-300 hover:text-white" title="Volver">
          <ArrowLeft size={22} />
        </button>
        <div className="relative flex-1">
          <SearchIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por título, género o actor…"
            className="w-full rounded-full border border-gray-700 bg-black/40 py-2.5 pl-10 pr-10 text-white placeholder-gray-500 focus:border-brand focus:outline-none"
          />
          {q && (
            <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* -------- Resultados -------- */}
      <div className="px-4 py-6 sm:px-8">
        {loading && (
          <div className="flex items-center gap-2 text-gray-400">
            <Loader2 className="animate-spin" size={18} /> Buscando…
          </div>
        )}

        {!loading && !q.trim() && (
          <p className="text-gray-400">Escribe para buscar entre tus películas y series.</p>
        )}

        {!loading && q.trim() && results.length === 0 && (
          <div className="text-gray-400">
            <p>No encontramos nada para «{q}».</p>
            <Link to="/" className="mt-2 inline-block text-brand hover:underline">Volver al inicio</Link>
          </div>
        )}

        {!loading && results.length > 0 && (
          <>
            {showSimilarNote ? (
              <p className="mb-4 text-gray-300">
                No hay una coincidencia exacta de «<span className="font-semibold">{q}</span>».
                Quizá te refieres a estos títulos similares:
              </p>
            ) : (
              <p className="mb-4 text-gray-400">Resultados para «<span className="text-white">{q}</span>»</p>
            )}

            <div className="flex flex-wrap gap-3">
              {results.map((item) => (
                <MediaCard key={item.id} item={item} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
