import cookieParser from 'cookie-parser';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditResource } from './core/audit.js';
import { authRouter } from './modules/auth/routes.js';
import { auditLogRouter } from './modules/auditLog/routes.js';
import { bankAccountsRouter } from './modules/bankAccounts/routes.js';
import { brokerRouter } from './modules/broker/routes.js';
import { cashExpenseRouter, cashIncomeRouter } from './modules/cash/routes.js';
import { cashServiceRouter } from './modules/cashService/routes.js';
import { cementMarksRouter } from './modules/cementMarks/routes.js';
import { clientsRouter } from './modules/clients/routes.js';
import { logisticsExpenseCategoriesRouter } from './modules/expenseCategories/routes.js';
import { importRouter } from './modules/import/routes.js';
import { incomingRouter } from './modules/incoming/routes.js';
import { machinesRouter } from './modules/machines/routes.js';
import { reportsRouter } from './modules/reports/routes.js';
import { salesRouter } from './modules/sales/routes.js';
import { myAccessRouter } from './modules/settings/publicRoutes.js';
import { settingsRouter } from './modules/settings/routes.js';
import { ticketsRouter } from './modules/tickets/routes.js';
import { usersRouter } from './modules/users/routes.js';
import { warehouseRouter } from './modules/warehouse/routes.js';
import { zavodyRouter } from './modules/zavody/routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requireAuth } from './middleware/auth.js';
import { requireAnyPermission, requirePermission } from './middleware/permission.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use(cookieParser());

  app.use('/api/auth', authRouter);

  app.use('/api', requireAuth);

  // Справочники (Контрагенты)
  const refPermission = requirePermission('references');
  app.use('/api/zavody', refPermission, auditResource('zavod', { table: 'zavody', label: 'Завод', nameColumn: 'name' }), zavodyRouter);
  app.use('/api/clients', refPermission, auditResource('client', { table: 'clients', label: 'Клиент', nameColumn: 'name' }), clientsRouter);
  app.use(
    '/api/cement-marks',
    refPermission,
    auditResource('cement_mark', { table: 'cement_marks', label: 'Марка цемента', nameColumn: 'name' }),
    cementMarksRouter,
  );
  app.use('/api/machines', refPermission, auditResource('machine', { table: 'machines', label: 'Машина', nameColumn: 'number' }), machinesRouter);
  app.use(
    '/api/bank-accounts',
    refPermission,
    auditResource('bank_account', { table: 'bank_accounts', label: 'Банковский счёт', nameColumn: 'display_name' }),
    bankAccountsRouter,
  );
  app.use(
    '/api/logistics-expense-categories',
    refPermission,
    auditResource('logistics_expense_category', { table: 'logistics_expense_categories', label: 'Категория расходов логистики', nameColumn: 'name' }),
    logisticsExpenseCategoriesRouter,
  );

  // Приход (Факт/Напрямую/Тикет — тикет теперь часть Прихода, раздел 2 ТЗ) и Продажа (Цемент/Логистика)
  app.use('/api/broker-account', requireAnyPermission('incoming', 'broker'), brokerRouter);
  app.use(
    '/api/tickets',
    requireAnyPermission('incoming', 'broker'),
    auditResource('ticket', { table: 'tickets', label: 'Тикет', nameColumn: 'ticket_number' }),
    ticketsRouter,
  );
  app.use('/api/incoming', requirePermission('incoming'), auditResource('incoming', { table: 'incoming', label: 'Приход' }), incomingRouter);
  app.use('/api/warehouse-balance', requireAnyPermission('incoming', 'sales', 'reports'), warehouseRouter);
  app.use('/api/sales', requirePermission('sales'), auditResource('sale', { table: 'sales', label: 'Продажа' }), salesRouter);
  app.use('/api/cash-income', requirePermission('cash'), auditResource('cash_income', { table: 'cash_income', label: 'Приход кассы' }), cashIncomeRouter);
  app.use('/api/cash-expense', requirePermission('cash'), auditResource('cash_expense', { table: 'cash_expense', label: 'Расход кассы' }), cashExpenseRouter);
  app.use(
    '/api/cash-service',
    requirePermission('cashService'),
    auditResource('cash_service_operation', { table: 'cash_service_operations', label: 'Обналичивание' }),
    cashServiceRouter,
  );
  app.use('/api/report', requirePermission('reports'), reportsRouter);

  // Ядро
  app.use('/api/my-access', myAccessRouter);
  app.use('/api/users', requirePermission('users'), usersRouter);
  app.use('/api/settings', requirePermission('settings'), settingsRouter);
  app.use('/api/audit-log', requirePermission('auditLog'), auditLogRouter);
  // Импорт данных — административная операция, то же право, что открывает Настройки.
  app.use('/api/import', requirePermission('settings'), importRouter);

  app.use(errorHandler);

  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  return app;
}
