// ----------------------------------------------------------------------------
//  Search.jsx — Buscador de películas y series.
//  Busca por título, género y actores. Si no hay coincidencia exacta, muestra
//  resultados SIMILARES (similitud trigram). Cuando el campo está vacío, NUNCA
//  se queda en blanco: muestra sugerencias (seguir viendo / recién añadidas).
// ----------------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Search as SearchIcon, Loader2, X } from 'lucide-react';
import { searchMedia, fetchCatalog } from '../api.js';
import MediaCard from '../components/MediaCard.jsx';

export default function Search() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState(params.get('q') || '');
  const [data, setData] = useState(null);        // resultados de búsqueda
  const [loading, setLoading] = useState(false);
  const [suggest, setSuggest] = useState(null);  // { continueWatching, recentlyAdded }
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Sugerencias por defecto (cuando no hay texto). Se cargan una vez.
  useEffect(() => {
    fetchCatalog()
      .then((c) => setSuggest({
        continueWatching: c.continueWatching || [],
        recentlyAdded: c.recentlyAdded || [],
      }))
      .catch(() => setSuggest({ continueWatching: [], recentlyAdded: [] }));
  }, []);

  // Búsqueda con debounce (350ms). Si el campo se vacía, NO deja el spinner:
  // limpia el estado y muestra las sugerencias.
  useEffect(() => {
    const term = q.trim();
    setParams(term ? { q: term } : {}, { replace: true });

    if (!term) { setData(null); setLoading(false); return; }

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
  const searching = q.trim().length > 0;

  // Sugerencias combinadas para "más para ti" (recientes, sin duplicar con "seguir viendo").
  const recentSuggest = useMemo(() => {
    if (!suggest) return [];
    const cwIds = new Set(suggest.continueWatching.map((m) => m.id));
    return suggest.recentlyAdded.filter((m) => !cwIds.has(m.id));
  }, [suggest]);

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

      <div className="px-4 py-6 sm:px-8">
        {/* -------- Modo BÚSQUEDA -------- */}
        {searching ? (
          loading ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="animate-spin" size={18} /> Buscando…
            </div>
          ) : results.length === 0 ? (
            <div className="text-gray-400">
              <p>No encontramos nada para «{q}».</p>
              <p className="mt-1 text-sm text-gray-600">Prueba con otro título, género o actor.</p>
            </div>
          ) : (
            <>
              {showSimilarNote ? (
                <p className="mb-4 text-gray-300">
                  No hay una coincidencia exacta de «<span className="font-semibold">{q}</span>».
                  Quizá te refieres a:
                </p>
              ) : (
                <p className="mb-4 text-gray-400">Resultados para «<span className="text-white">{q}</span>»</p>
              )}
              <div className="flex flex-wrap gap-3">
                {results.map((item) => <MediaCard key={item.id} item={item} />)}
              </div>
            </>
          )
        ) : (
          /* -------- Modo SUGERENCIAS (campo vacío) -------- */
          !suggest ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="animate-spin" size={18} /> Cargando…
            </div>
          ) : (
            <div className="space-y-8">
              {suggest.continueWatching.length > 0 && (
                <section>
                  <h2 className="mb-3 text-lg font-bold">Seguir viendo</h2>
                  <div className="flex flex-wrap gap-3">
                    {suggest.continueWatching.map((item) => <MediaCard key={item.id} item={item} />)}
                  </div>
                </section>
              )}
              <section>
                <h2 className="mb-3 text-lg font-bold">Recién añadidos</h2>
                {recentSuggest.length === 0 ? (
                  <p className="text-gray-500">Aún no hay títulos.</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {recentSuggest.map((item) => <MediaCard key={item.id} item={item} />)}
                  </div>
                )}
              </section>
              <p className="text-sm text-gray-600">Escribe arriba para buscar por título, género o actor.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
