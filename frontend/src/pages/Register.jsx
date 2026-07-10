// ----------------------------------------------------------------------------
//  Register.jsx — Alta de usuario normal.
// ----------------------------------------------------------------------------
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Loader2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';

const inputCls =
  'w-full rounded border border-gray-600 bg-black/40 px-3 py-2.5 text-white placeholder-gray-500 focus:border-brand focus:outline-none';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    setSubmitting(true);
    try {
      await register(form.email, form.password, form.name);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'No se pudo crear la cuenta');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-surface px-4">
      <div className="w-full max-w-md rounded-xl bg-black/50 p-8 shadow-2xl backdrop-blur">
        <h1 className="mb-1 text-3xl font-extrabold text-brand">Crear cuenta</h1>
        <p className="mb-6 text-gray-400">Regístrate para ver el catálogo</p>

        {error && (
          <div className="mb-4 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <input value={form.name} onChange={update('name')} placeholder="Nombre (opcional)" className={inputCls} />
          <input type="email" value={form.email} onChange={update('email')} placeholder="Email" required autoComplete="email" className={inputCls} />
          <input type="password" value={form.password} onChange={update('password')} placeholder="Contraseña (mín. 8 caracteres)" required autoComplete="new-password" className={inputCls} />
          <button
            type="submit" disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50"
          >
            {submitting ? <Loader2 className="animate-spin" size={18} /> : <UserPlus size={18} />}
            Crear cuenta
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="text-white hover:underline">Inicia sesión</Link>
        </p>
      </div>
    </div>
  );
}
