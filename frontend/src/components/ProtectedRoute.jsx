// ----------------------------------------------------------------------------
//  ProtectedRoute.jsx — Guarda de rutas.
//    - requireAdmin=false: exige usuario autenticado.
//    - requireAdmin=true : exige además rol de administrador.
//  Redirige a /login (o a / si no es admin) cuando corresponde.
// ----------------------------------------------------------------------------
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function ProtectedRoute({ children, requireAdmin = false, requireAdult = false }) {
  const { user, loading, isAdmin, canAdult } = useAuth();
  const location = useLocation();

  // Mientras comprobamos la sesión, evitamos parpadeos.
  if (loading) {
    return <div className="grid h-screen place-items-center bg-surface text-gray-400">Cargando…</div>;
  }

  // No autenticado -> a login (recordando a dónde quería ir).
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Autenticado pero sin permisos de admin -> al catálogo.
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // Sin acceso a la sección de adultos -> al catálogo.
  if (requireAdult && !canAdult) {
    return <Navigate to="/" replace />;
  }

  return children;
}
