// ----------------------------------------------------------------------------
//  routes/auth.js — Registro, login, logout y sesión actual.
//
//  Seguridad:
//    - Contraseñas hasheadas con bcrypt (coste 12).
//    - Rate limiting en login/registro para frenar ataques de fuerza bruta.
//    - Mensajes de error genéricos en login (no revelan si el email existe).
//    - Validación de entrada (email y longitud de contraseña).
// ----------------------------------------------------------------------------
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { query } from '../db.js';
import {
  signToken, setAuthCookie, clearAuthCookie, requireAuth,
} from '../middleware/auth.js';

const router = Router();

// Máx. 10 intentos por IP cada 15 min sobre las rutas sensibles.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Inténtalo de nuevo en unos minutos.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Normaliza el objeto de usuario que devolvemos al cliente (sin el hash).
const publicUser = (u) => ({
  id: u.id, email: u.email, name: u.display_name, role: u.role,
});

// ===========================================================================
//  POST /api/auth/register  — alta de usuario normal (role='user').
// ===========================================================================
router.post('/register', authLimiter, async (req, res) => {
  const { email, password, name } = req.body || {};

  if (!EMAIL_RE.test(email || '')) {
    return res.status(400).json({ error: 'Email no válido' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, display_name, role)
       VALUES (lower($1), $2, $3, 'user')
       RETURNING id, email, display_name, role`,
      [email, hash, name || null]
    );

    const user = rows[0];
    const token = signToken(user);
    setAuthCookie(res, token);
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    if (err.code === '23505') { // email duplicado
      return res.status(409).json({ error: 'Ese email ya está registrado' });
    }
    console.error('[POST /register]', err);
    res.status(500).json({ error: 'Error al registrar' });
  }
});

// ===========================================================================
//  POST /api/auth/login  — inicia sesión (usuario o admin, mismo endpoint).
// ===========================================================================
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
  }

  try {
    const { rows } = await query(
      `SELECT id, email, password_hash, display_name, role
         FROM users WHERE email = lower($1)`,
      [email]
    );

    const user = rows[0];
    // Comparación siempre contra un hash (aunque el usuario no exista) para
    // no filtrar por tiempo si el email está o no registrado.
    const hash = user?.password_hash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalid';
    const ok = await bcrypt.compare(password, hash);

    if (!user || !ok) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('[POST /login]', err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// ===========================================================================
//  POST /api/auth/logout
// ===========================================================================
router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// ===========================================================================
//  GET /api/auth/me  — devuelve el usuario de la sesión actual.
// ===========================================================================
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role } });
});

export default router;
