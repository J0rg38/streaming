// ----------------------------------------------------------------------------
//  middleware/auth.js — Utilidades de autenticación con JWT en cookie httpOnly.
//
//  Estrategia de seguridad:
//    - El token JWT se guarda en una cookie httpOnly (no accesible desde JS),
//      lo que mitiga el robo de sesión por XSS.
//    - sameSite='lax' reduce el riesgo de CSRF.
//    - En producción (HTTPS) la cookie es Secure.
// ----------------------------------------------------------------------------
import jwt from 'jsonwebtoken';

const JWT_SECRET  = process.env.JWT_SECRET  || 'dev-secret-cambia-esto';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';
const COOKIE_NAME = 'vod_token';

// Firma un token con los datos mínimos del usuario.
export function signToken(user) {
  return jwt.sign(
    {
      id: user.id, email: user.email, role: user.role,
      name: user.display_name, adult: user.adult_access === true,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

// Envía el token como cookie httpOnly segura.
export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 días
    path: '/',
  });
}

// Borra la cookie (logout).
export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

// Lee y valida el token de la cookie. Devuelve el payload o null.
function readToken(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// --- Middleware: exige usuario autenticado ---------------------------------
export function requireAuth(req, res, next) {
  const payload = readToken(req);
  if (!payload) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  req.user = payload; // { id, email, role, name }
  next();
}

// --- Middleware: exige rol de administrador --------------------------------
export function requireAdmin(req, res, next) {
  const payload = readToken(req);
  if (!payload) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  if (payload.role !== 'admin') {
    return res.status(403).json({ error: 'Se requieren permisos de administrador' });
  }
  req.user = payload;
  next();
}

// ¿El usuario puede ver contenido para adultos?
//  SÓLO quien tenga el acceso habilitado explícitamente. Ser administrador NO
//  concede acceso: un admin sin el check tampoco puede ver ni gestionar +18.
export const canAccessAdult = (user) => user?.adult === true;
