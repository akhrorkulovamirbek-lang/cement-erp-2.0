import bcrypt from 'bcryptjs';
import { publicPool, schemaNameFor } from '../../db/tenant.js';
import { prepareTenant } from '../../db/init.js';
import { conflict } from '../../lib/errors.js';

/** Новая организация: запись в реестре, своя схема с пустыми таблицами, первый администратор. */
export async function createOrganization(params: {
  name: string;
  adminUsername: string;
  adminPassword: string;
  adminFullName?: string;
}) {
  const { rows: taken } = await publicPool.query('SELECT 1 FROM users WHERE username = $1', [params.adminUsername]);
  if (taken.length > 0) throw conflict('Такой логин уже занят — выберите другой');

  const { rows } = await publicPool.query(
    `INSERT INTO organizations (name, schema_name) VALUES ($1, 'org_tmp') RETURNING id`,
    [params.name],
  );
  const orgId = rows[0].id as number;
  await publicPool.query('UPDATE organizations SET schema_name = $1 WHERE id = $2', [schemaNameFor(orgId), orgId]);

  await prepareTenant(orgId);

  const passwordHash = await bcrypt.hash(params.adminPassword, 10);
  await publicPool.query(
    `INSERT INTO users (username, password_hash, full_name, role, organization_id)
     VALUES ($1, $2, $3, 'admin', $4)`,
    [params.adminUsername, passwordHash, params.adminFullName ?? 'Администратор', orgId],
  );
  return { id: orgId, name: params.name };
}
