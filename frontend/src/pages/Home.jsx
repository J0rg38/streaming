// ----------------------------------------------------------------------------
//  Home.jsx — Pantalla de inicio con hero + carruseles por género.
// ----------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Play, Info, Settings, UploadCloud, LogOut, Search, Lock } from 'lucide-react';
import { fetchCatalog } from '../api.js';
import Carousel from '../components/Carousel.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Home() {
  const [rails, setRails] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const [recentlyAdded, setRecentlyAdded] = useState([]);
  const [stellar, setStellar] = useState([]);           // sección "Estelares"
  const [bannerItems, setBannerItems] = useState([]);   // títulos del banner rotativo
  const [heroIndex, setHeroIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user, isAdmin, canAdult, logout } = useAuth();

  useEffect(() => {
    fetchCatalog()
      .then((data) => {
        setRails(data.rails);
        setContinueWatching(data.continueWatching || []);
        setRecentlyAdded(data.recentlyAdded || []);
        setStellar(data.featured || []);
        // Banner rotativo: las últimas 5 añadidas + los destacados (sin duplicar).
        const seen = new Set();
        const banner = [...(data.recentlyAdded || []).slice(0, 5), ...(data.featured || [])]
          .filter((m) => (seen.has(m.id) ? false : seen.add(m.id)))
          .slice(0, 6);
        setBannerItems(banner);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Rotación automática del banner cada 7 segundos.
  useEffect(() => {
    if (bannerItems.length <= 1) return;
    const t = setInterval(() => {
      setHeroIndex((i) => (i + 1) % bannerItems.length);
    }, 7000);
    return () => clearInterval(t);
  }, [bannerItems.length]);

  const hero = bannerItems[heroIndex] || null;

  const doLogout = async () => { await logout(); navigate('/login'); };

  // Botón principal del hero: reproduce (película) o abre la serie.
  const goToHero = () => {
    if (!hero) return;
    if (hero.type === 'series') navigate(`/series/${hero.id}`);
    else navigate(`/watch/${hero.id}`);
  };

  if (loading) {
    return <div className="grid h-screen place-items-center text-gray-400">Cargando catálogo…</div>;
  }

  // Barra de navegación superior fija. El botón "Administrar" sólo se muestra
  // a los administradores.
  const Navbar = () => (
    <nav className="fixed top-0 z-30 flex w-full items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 py-3 sm:px-8 sm:py-4">
      <Link to="/" className="flex items-center gap-2">
        <img src="/logo.svg" alt="Mi VOD" className="h-7 w-auto sm:h-9" />
        <span className="text-xl font-extrabold text-brand sm:text-2xl">MI VOD</span>
      </Link>
      <div className="flex items-center gap-2 sm:gap-3">
        <Link
          to="/search"
          className="flex items-center gap-2 rounded bg-white/10 px-3 py-2 text-sm font-medium backdrop-blur hover:bg-white/20 sm:px-4"
          title="Buscar"
        >
          <Search size={16} /> <span className="hidden sm:inline">Buscar</span>
        </Link>
        {canAdult && (
          <Link
            to="/adultos"
            className="flex items-center gap-2 rounded bg-brand/20 px-3 py-2 text-sm font-medium text-brand backdrop-blur hover:bg-brand/30 sm:px-4"
            title="Sección para adultos"
          >
            <Lock size={16} /> <span className="hidden sm:inline">+18</span>
          </Link>
        )}
        <span className="hidden text-sm text-gray-300 md:inline">
          Hola, {user?.name || user?.email}
        </span>
        {isAdmin && (
          <Link
            to="/admin"
            className="flex items-center gap-2 rounded bg-white/10 px-3 py-2 text-sm font-medium backdrop-blur hover:bg-white/20 sm:px-4"
          >
            <Settings size={16} /> <span className="hidden sm:inline">Administrar</span>
          </Link>
        )}
        <button
          onClick={doLogout}
          className="flex items-center gap-2 rounded bg-white/10 px-3 py-2 text-sm font-medium backdrop-blur hover:bg-white/20 sm:px-4"
        >
          <LogOut size={16} /> <span className="hidden sm:inline">Salir</span>
        </button>
      </div>
    </nav>
  );

  // Catálogo vacío: invitamos a subir el primer contenido.
  if (!hero && rails.length === 0) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="grid h-screen place-items-center">
          <div className="text-center">
            <UploadCloud size={48} className="mx-auto mb-4 text-gray-500" />
            <p className="mb-4 text-gray-400">
              {isAdmin ? 'Tu catálogo está vacío.' : 'Todavía no hay contenido disponible.'}
            </p>
            {isAdmin && (
              <Link to="/admin" className="rounded bg-brand px-5 py-2 font-semibold hover:bg-brand-dark">
                Subir mi primer título
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-12">
      <Navbar />
      {/* -------- Hero / banner destacado (rotativo) -------- */}
      {hero && (
        <div className="relative h-[70vh] w-full overflow-hidden">
          {/* Cada imagen se superpone y se cruza con opacidad para un fundido suave */}
          {bannerItems.map((f, i) => (
            <img
              key={f.id}
              src={f.banner_url || f.poster_url}
              alt={f.title}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
                i === heroIndex ? 'opacity-100' : 'opacity-0'
              }`}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent" />

          <div className="absolute bottom-20 left-4 right-4 max-w-xl sm:bottom-16 sm:left-8 sm:right-auto">
            <h1 className="mb-2 text-3xl font-extrabold drop-shadow-lg sm:mb-3 sm:text-5xl">{hero.title}</h1>
            <p className="mb-3 line-clamp-2 text-sm text-gray-200 sm:mb-4 sm:line-clamp-3 sm:text-base">{hero.description}</p>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <button
                onClick={goToHero}
                className="flex items-center gap-2 rounded bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-gray-200 sm:px-6 sm:text-base"
              >
                <Play size={18} />
                {hero.type === 'series' ? 'Ver serie' : 'Reproducir'}
              </button>
              <button
                onClick={() => navigate(hero.type === 'series' ? `/series/${hero.id}` : `/movie/${hero.id}`)}
                className="flex items-center gap-2 rounded bg-gray-600/70 px-5 py-2 text-sm font-semibold hover:bg-gray-600 sm:px-6 sm:text-base"
              >
                <Info size={18} /> Más información
              </button>
            </div>
          </div>

          {/* Indicadores (puntos) para saltar entre destacados */}
          {bannerItems.length > 1 && (
            <div className="absolute bottom-6 right-8 flex gap-2">
              {bannerItems.map((f, i) => (
                <button
                  key={f.id}
                  onClick={() => setHeroIndex(i)}
                  aria-label={`Destacado ${i + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    i === heroIndex ? 'w-6 bg-brand' : 'w-2 bg-white/50 hover:bg-white/80'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* -------- Carruseles -------- */}
      <div className="relative z-10 mt-8">
        {/* Fila "Continuar viendo": títulos empezados y sin terminar */}
        {continueWatching.length > 0 && (
          <Carousel title="Continuar viendo" items={continueWatching} />
        )}
        {/* Fila "Recién añadidos": los últimos títulos subidos */}
        {recentlyAdded.length > 0 && (
          <Carousel title="Recién añadidos" items={recentlyAdded} />
        )}
        {/* Fila "Estelares": destacados elegidos por el admin */}
        {stellar.length > 0 && (
          <Carousel title="✨ Estelares" items={stellar} />
        )}
        {rails.map((rail) => (
          <Carousel key={rail.genre} title={rail.genre} items={rail.items} />
        ))}
      </div>
    </div>
  );
}
