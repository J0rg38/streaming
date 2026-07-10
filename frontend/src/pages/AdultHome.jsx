// ----------------------------------------------------------------------------
//  AdultHome.jsx — Vista EXCLUSIVA de la sección de adultos.
//  Sólo accesible por usuarios con acceso concedido (o administradores); la
//  ruta está protegida con requireAdult. Muestra únicamente contenido adulto.
// ----------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, Lock } from 'lucide-react';
import { fetchAdultCatalog } from '../api.js';
import Carousel from '../components/Carousel.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

export default function AdultHome() {
  const [rails, setRails] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const [recentlyAdded, setRecentlyAdded] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    fetchAdultCatalog()
      .then((data) => {
        setRails(data.rails || []);
        setContinueWatching(data.continueWatching || []);
        setRecentlyAdded(data.recentlyAdded || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const doLogout = async () => { await logout(); navigate('/login'); };

  return (
    <div className="min-h-screen bg-black pb-12">
      {/* -------- Barra superior propia de la sección -------- */}
      <nav className="sticky top-0 z-30 flex items-center justify-between border-b border-brand/40 bg-black/90 px-4 py-3 backdrop-blur sm:px-8">
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-brand" />
          <span className="text-lg font-extrabold text-brand sm:text-xl">Sección +18</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 rounded bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20 sm:px-4"
          >
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Catálogo principal</span>
          </Link>
          <button
            onClick={doLogout}
            className="flex items-center gap-2 rounded bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20 sm:px-4"
          >
            <LogOut size={16} /> <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </nav>

      {/* -------- Encabezado -------- */}
      <div className="border-b border-brand/30 bg-gradient-to-b from-brand/20 to-transparent px-4 py-8 sm:px-8">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Contenido para adultos</h1>
        <p className="mt-1 text-sm text-gray-400">
          Acceso exclusivo · Sesión: {user?.name || user?.email}
        </p>
      </div>

      {/* -------- Contenido -------- */}
      <div className="mt-6">
        {loading ? (
          <p className="px-4 text-gray-400 sm:px-8">Cargando…</p>
        ) : rails.length === 0 ? (
          <p className="px-4 text-gray-400 sm:px-8">
            Aún no hay contenido en esta sección. Sube títulos con el género «Adultos» desde el panel.
          </p>
        ) : (
          <>
            {continueWatching.length > 0 && (
              <Carousel title="Continuar viendo" items={continueWatching} />
            )}
            {recentlyAdded.length > 0 && (
              <Carousel title="Recién añadidos" items={recentlyAdded} />
            )}
            {rails.map((rail) => (
              <Carousel key={rail.genre} title={rail.genre} items={rail.items} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
