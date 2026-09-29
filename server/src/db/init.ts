import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { loadSettingsCache, seedSettingsDefaults } from '../core/settingsCache.js';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  await pool.query(schema);
  await seedAdmin();
  await seedSettingsDefaults();
  await loadSettingsCache();
}

async function seedAdmin() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  if (rows[0].count > 0) return;

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    console.warn('ADMIN_USERNAME/ADMIN_PASSWORD not set — skipping admin seed. Set them and restart to create the admin user.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    "INSERT INTO users (username, password_hash, full_name, role) VALUES ($1, $2, 'Администратор', 'admin')",
    [username, passwordHash],
  );
  console.log(`Admin user "${username}" created.`);
}
