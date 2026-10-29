import { Router } from 'express';
import { z } from 'zod';
import { recordAudit } from '../../core/audit.js';
import { withTransaction } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { AppError } from '../../lib/errors.js';

export const adminRouter = Router();

// Всё, что вводилось в работе: справочники, документы, касса, остатки. НЕ трогаем users, permissions,
// module_settings, app_settings и audit_log (журнал действий неизменяем по ТЗ).
const DATA_TABLES = [
  'sale_requests',
  'client_debt_adjustments',
  'zavod_debt_adjustments',
  'cash_service_operations',
  'cash_income',
  'cash_expense',
  'sales',
  'incoming',
  'warehouse_balance',
  'tickets',
  'broker_operations',
  'stock_movement',
  'settlement_movement',
  'money_movement',
  'bank_accounts',
  'logistics_expense_categories',
  'machines',
  'cement_marks',
  'clients',
  'zavody',
  'factories',
];

adminRouter.post(
  '/clear-data',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin') throw new AppError(403, 'Очистить данные может только администратор');
    const { confirm } = z.object({ confirm: z.string() }).parse(req.body);
    if (confirm !== 'УДАЛИТЬ') {
      res.status(400).json({ error: 'Для подтверждения впишите слово УДАЛИТЬ' });
      return;
    }
    await withTransaction(async (client) => {
      await client.query(`TRUNCATE ${DATA_TABLES.join(', ')} RESTART IDENTITY`);
      await client.query('UPDATE broker_account SET balance = 0, updated_at = now() WHERE id = 1');
    });
    await recordAudit({
      userId: req.user?.userId ?? null,
      action: 'clear_data',
      objectType: 'system',
      objectLabel: 'Очистка всех данных',
      req,
    });
    res.json({ ok: true });
  }),
);
