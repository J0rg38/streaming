// ----------------------------------------------------------------------------
//  seedAdmin.js — Crea la cuenta de administrador al arrancar si no existe.
//  Toma las credenciales de las variables de entorno ADMIN_EMAIL / ADMIN_PASSWORD.
// ----------------------------------------------------------------------------
import bcrypt from 'bcryptjs';
import { query } from './db.js';

export async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Administrador';

  if (!email || !password) {
    console.warn('[seedAdmin] ADMIN_EMAIL/ADMIN_PASSWORD no definidos; se omite.');
    return;
  }

  const { rows } = await query(`SELECT id FROM users WHERE email = lower($1)`, [email]);
  if (rows.length > 0) {
    console.log(`[seedAdmin] Admin ya existe: ${email}`);
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  await query(
    `INSERT INTO users (email, password_hash, display_name, role)
     VALUES (lower($1), $2, $3, 'admin')`,
    [email, hash, name]
  );
  console.log(`[seedAdmin] Admin creado: ${email}`);
}
