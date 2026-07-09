// ----------------------------------------------------------------------------
//  Login.jsx — Inicio de sesión (mismo formulario para usuario y admin).
//  Tras entrar, si el usuario es admin y venía del panel, lo lleva allí;
//  si no, al catálogo (o a la ruta que intentaba visitar).
// ----------------------------------------------------------------------------
import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogIn, Loader2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';

const inputCls =
  'w-full rounded border border-gray-600 bg-black/40 px-3 py-2.5 text-white placeholder-gray-500 focus:border-brand focus:outline-none';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(email, password);
      // Si intentaba ir a /admin pero no es admin, mándalo al inicio.
      const dest = from.startsWith('/admin') && user.role !== 'admin' ? '/' : from;
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-surface px-4">
      <div className="w-full max-w-md rounded-xl bg-black/50 p-8 shadow-2xl backdrop-blur">
        <h1 className="mb-1 text-3xl font-extrabold text-brand">MI VOD</h1>
        <p className="mb-6 text-gray-400">Inicia sesión para continuar</p>

        {error && (
          <div className="mb-4 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Email" required autoComplete="email" className={inputCls}
          />
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña" required autoComplete="current-password" className={inputCls}
          />
          <button
            type="submit" disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded bg-brand py-2.5 font-semibold hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />}
            Entrar
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="text-white hover:underline">Regístrate</Link>
        </p>
      </div>
    </div>
  );
}
