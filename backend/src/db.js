// ----------------------------------------------------------------------------
//  db.js — Pool de conexiones PostgreSQL (librería 'pg').
//  Un único pool compartido por toda la app. Lee credenciales de .env.
// ----------------------------------------------------------------------------
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

export const pool = new Pool({
  host:     process.env.PGHOST     || 'localhost',
  port:     Number(process.env.PGPORT) || 5432,
  user:     process.env.PGUSER     || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'vod',
});

pool.on('error', (err) => {
  console.error('[pg] Error inesperado en el pool:', err);
});

// Helper cómodo para hacer queries: const { rows } = await query(sql, params)
export const query = (text, params) => pool.query(text, params);
