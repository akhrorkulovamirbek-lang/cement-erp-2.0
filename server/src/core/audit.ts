import type { NextFunction, Request, Response } from 'express';
import { pool } from '../db/pool.js';

export interface AuditParams {
  userId: number | null;
  action: string;
  objectType: string;
  objectId?: number | string | null;
  objectLabel?: string | null;
  before?: unknown;
  after?: unknown;
  req?: Request;
}

/** Раздел 8.4 ТЗ: каждое действие учитывается. Никогда не должен ронять основной запрос —
 * пишем best-effort и логируем сбой в консоль. */
export async function recordAudit(params: AuditParams): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, action, object_type, object_id, object_label, before, after, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        params.userId,
        params.action,
        params.objectType,
        params.objectId != null ? String(params.objectId) : null,
        params.objectLabel ?? null,
        params.before != null ? JSON.stringify(params.before) : null,
        params.after != null ? JSON.stringify(params.after) : null,
        params.req?.ip ?? null,
        params.req?.headers['user-agent'] ?? null,
      ],
    );
  } catch (err) {
    console.error('Не удалось записать журнал действий:', err);
  }
}

const SENSITIVE_FIELDS = ['password', 'password_hash', 'newPassword'];

function redact(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const f of SENSITIVE_FIELDS) delete clone[f];
  return clone;
}

interface ResourceMeta {
  /** Таблица, из которой читается состояние "до" перед PUT/DELETE. */
  table: string;
  /** Человекочитаемое имя объекта для журнала, например "Завод". */
  label: string;
  /** Колонка, из которой берётся название объекта (например name). */
  nameColumn?: string;
}

/** Общий middleware для логирования мутаций простых модулей (справочники и Tier C документы),
 * не требующий правки бизнес-логики каждого модуля — вешается рядом с router'ом в app.ts.
 * Для DELETE/PUT читает состояние "до" по id из пути, для POST/PUT — состояние "после" из
 * ответа сервиса (перехватывает res.json), т.к. тело запроса не содержит сгенерированный id. */
export function auditResource(objectType: string, meta: ResourceMeta) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!['POST', 'PUT', 'DELETE'].includes(req.method)) {
      next();
      return;
    }

    const idMatch = req.path.match(/\/(\d+)\/?$/);
    const pathId = idMatch ? Number(idMatch[1]) : null;

    let before: Record<string, unknown> | null = null;
    if (pathId && req.method !== 'POST') {
      try {
        const { rows } = await pool.query(`SELECT * FROM ${meta.table} WHERE id = $1`, [pathId]);
        before = rows[0] ?? null;
      } catch {
        before = null;
      }
    }

    let responseBody: Record<string, unknown> | null = null;
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      responseBody = (body as Record<string, unknown>) ?? null;
      return originalJson(body);
    }) as typeof res.json;

    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      const action = req.method === 'POST' ? 'create' : req.method === 'PUT' ? 'update' : 'delete';
      const id = pathId ?? (responseBody?.id as number | undefined) ?? null;
      const labelSource = responseBody ?? before ?? (req.body as Record<string, unknown>);
      const name = meta.nameColumn ? String(labelSource?.[meta.nameColumn] ?? '') : '';
      void recordAudit({
        userId: req.user?.userId ?? null,
        action,
        objectType,
        objectId: id,
        objectLabel: name ? `${meta.label} «${name}»` : `${meta.label} #${id ?? ''}`,
        before,
        after: action === 'delete' ? null : redact(responseBody ?? req.body),
        req,
      });
    });

    next();
  };
}
