// ----------------------------------------------------------------------------
//  AdultHome.jsx — Vista EXCLUSIVA de la sección de adultos.
//  Sólo accesible por usuarios con acceso concedido (ruta con requireAdult).
//  Diseño con hero rotativo, acento terracota y carruseles.
// ----------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, Lock, Play, Info, Flame, Search } from 'lucide-react';
import { fetchAdultCatalog } from '../api.js';
import Carousel from '../components/Carousel.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

export default function AdultHome() {
  const [rails, setRails] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const [recentlyAdded, setRecentlyAdded] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [discovery, setDiscovery] = useState([]);
  const [banner, setBanner] = useState([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    fetchAdultCatalog()
      .then((data) => {
        setRails(data.rails || []);
        setContinueWatching(data.continueWatching || []);
        setRecentlyAdded(data.recentlyAdded || []);
        setFeatured(data.featured || []);
        setDiscovery(data.discovery || []);
        // Banner: destacados + recientes (sin duplicar), hasta 5.
        const seen = new Set();
        const mix = [...(data.featured || []), ...(data.recentlyAdded || [])]
          .filter((m) => (seen.has(m.id) ? false : seen.add(m.id)))
          .slice(0, 5);
        setBanner(mix);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Rotación del hero cada 7s.
  useEffect(() => {
    if (banner.length <= 1) return;
    const t = setInterval(() => setHeroIndex((i) => (i + 1) % banner.length), 7000);
    return () => clearInterval(t);
  }, [banner.length]);

  const hero = banner[heroIndex] || null;
  const doLogout = async () => { await logout(); navigate('/login'); };
  const openTitle = (m) => navigate(m.type === 'series' ? `/series/${m.id}` : `/movie/${m.id}`);

  return (
    <div className="min-h-screen bg-black pb-12 text-white">
      {/* -------- Barra superior -------- */}
      <nav className="fixed top-0 z-30 flex w-full items-center justify-between bg-gradient-to-b from-black via-black/70 to-transparent px-4 py-3 sm:px-8">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-sm font-extrabold">
            <Lock size={14} /> +18
          </span>
          <span className="hidden text-sm text-gray-300 sm:inline">Contenido exclusivo</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link to="/adultos/buscar" className="flex items-center gap-2 rounded bg-white/10 px-3 py-2 text-sm font-medium backdrop-blur hover:bg-white/20 sm:px-4" title="Buscar">
            <Search size={16} /> <span className="hidden sm:inline">Buscar</span>
          </Link>
          <Link to="/" className="flex items-center gap-2 rounded bg-white/10 px-3 py-2 text-sm font-medium backdrop-blur hover:bg-white/20 sm:px-4">
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Catálogo principal</span>
          </Link>
          <button onClick={doLogout} className="flex items-center gap-2 rounded bg-white/10 px-3 py-2 text-sm font-medium backdrop-blur hover:bg-white/20 sm:px-4">
            <LogOut size={16} /> <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </nav>

      {loading ? (
        <div className="grid h-screen place-items-center text-gray-400">Cargando…</div>
      ) : banner.length === 0 && rails.length === 0 && featured.length === 0 && discovery.length === 0 && continueWatching.length === 0 ? (
        <div className="grid h-screen place-items-center px-6 text-center">
          <div>
            <Flame size={48} className="mx-auto mb-4 text-brand" />
            <p className="text-gray-400">Aún no hay contenido en esta sección.</p>
            <p className="mt-1 text-sm text-gray-600">Sube títulos con el género «Adultos» desde el panel.</p>
          </div>
        </div>
      ) : (
        <>
          {/* -------- Hero rotativo -------- */}
          {hero && (
            <div className="relative h-[75vh] w-full overflow-hidden">
              {banner.map((f, i) => (
                <img
                  key={f.id}
                  src={f.banner_url || f.poster_url}
                  alt={f.title}
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${i === heroIndex ? 'opacity-100' : 'opacity-0'}`}
                />
              ))}
              {/* Degradados: oscurecen para legibilidad + tinte terracota abajo */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/80 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-brand/25 to-transparent" />

              <div className="absolute bottom-16 left-4 right-4 max-w-2xl sm:left-10 sm:right-auto">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/90 px-3 py-1 text-xs font-bold uppercase tracking-wider">
                  <Flame size={13} /> Solo para adultos
                </span>
                <h1 className="mt-3 text-4xl font-extrabold drop-shadow-lg sm:text-6xl">{hero.title}</h1>
                <p className="mt-2 line-clamp-2 text-sm text-gray-200 sm:mt-3 sm:text-base">{hero.description}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    onClick={() => navigate(hero.type === 'series' ? `/series/${hero.id}` : `/watch/${hero.id}`)}
                    className="flex items-center gap-2 rounded-lg bg-white px-7 py-2.5 font-semibold text-black hover:bg-gray-200"
                  >
                    <Play size={20} fill="currentColor" /> Reproducir
                  </button>
                  <button
                    onClick={() => openTitle(hero)}
                    className="flex items-center gap-2 rounded-lg bg-white/15 px-6 py-2.5 font-semibold backdrop-blur hover:bg-white/25"
                  >
                    <Info size={20} /> Más información
                  </button>
                </div>
              </div>

              {/* Indicadores del hero */}
              {banner.length > 1 && (
                <div className="absolute bottom-6 right-6 flex gap-2 sm:right-10">
                  {banner.map((f, i) => (
                    <button
                      key={f.id}
                      onClick={() => setHeroIndex(i)}
                      aria-label={`Destacado ${i + 1}`}
                      className={`h-2 rounded-full transition-all ${i === heroIndex ? 'w-7 bg-brand' : 'w-2 bg-white/40 hover:bg-white/70'}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* -------- Carruseles -------- */}
          <div className="relative z-10 mt-4">
            {continueWatching.length > 0 && <Carousel title="Continuar viendo" items={continueWatching} />}
            {recentlyAdded.length > 0 && <Carousel title="🔥 Recién añadidos" items={recentlyAdded} />}
            {featured.length > 0 && <Carousel title="✨ Destacados" items={featured} />}
            {/* Recomendaciones inteligentes: por actriz y por etiquetas */}
            {discovery.map((rail) => (
              <Carousel key={`d-${rail.title}`} title={rail.title} items={rail.items} />
            ))}
            {rails.map((rail) => (
              <Carousel key={rail.genre} title={rail.genre} items={rail.items} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
