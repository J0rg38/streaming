// ----------------------------------------------------------------------------
//  Login.jsx — Inicio de sesión (mismo formulario para usuario y admin).
// ----------------------------------------------------------------------------
import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogIn, Loader2, Mail, Lock } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';

const inputCls =
  'w-full rounded-lg border border-white/10 bg-white/5 py-3 pl-11 pr-3 text-white placeholder-gray-400 outline-none transition focus:border-brand focus:bg-white/10';

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
      const dest = from.startsWith('/admin') && user.role !== 'admin' ? '/' : from;
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-surface px-4">
      {/* -------- Fondo cinematográfico -------- */}
      <div className="pointer-events-none absolute inset-0">
        {/* Resplandores terracota */}
        <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-brand/25 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[32rem] w-[32rem] rounded-full bg-brand/20 blur-[120px]" />
        {/* Rejilla sutil */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-surface/60" />
      </div>

      {/* -------- Tarjeta -------- */}
      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-black/50 p-8 shadow-2xl backdrop-blur-xl sm:p-10">
          <div className="mb-8 flex flex-col items-center text-center">
            <img src="/logo.svg" alt="Mi VOD" className="h-14 w-auto drop-shadow-[0_4px_20px_rgba(227,83,54,0.4)]" />
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white">
              MI <span className="text-brand">VOD</span>
            </h1>
            <p className="mt-1 text-sm text-gray-400">Tu cine, tus series, donde quieras.</p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="relative">
              <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="Email" required autoComplete="email" className={inputCls}
              />
            </div>
            <div className="relative">
              <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña" required autoComplete="current-password" className={inputCls}
              />
            </div>
            <button
              type="submit" disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-3 font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-brand-dark disabled:opacity-50"
            >
              {submitting ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />}
              Entrar
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-400">
            ¿No tienes cuenta?{' '}
            <Link to="/register" className="font-medium text-brand hover:underline">Regístrate</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
