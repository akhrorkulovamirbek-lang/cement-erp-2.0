import cookieParser from 'cookie-parser';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRouter } from './modules/auth/routes.js';
import { brokerRouter } from './modules/broker/routes.js';
import { cashExpenseRouter, cashIncomeRouter } from './modules/cash/routes.js';
import { cementMarksRouter } from './modules/cementMarks/routes.js';
import { clientsRouter } from './modules/clients/routes.js';
import { incomingRouter } from './modules/incoming/routes.js';
import { logisticsRouter } from './modules/logistics/routes.js';
import { machinesRouter } from './modules/machines/routes.js';
import { reportsRouter } from './modules/reports/routes.js';
import { salesRouter } from './modules/sales/routes.js';
import { ticketsRouter } from './modules/tickets/routes.js';
import { warehouseRouter } from './modules/warehouse/routes.js';
import { zavodyRouter } from './modules/zavody/routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requireAuth } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.use('/api/auth', authRouter);

  app.use('/api', requireAuth);
  app.use('/api/zavody', zavodyRouter);
  app.use('/api/clients', clientsRouter);
  app.use('/api/cement-marks', cementMarksRouter);
  app.use('/api/machines', machinesRouter);
  app.use('/api/broker-account', brokerRouter);
  app.use('/api/tickets', ticketsRouter);
  app.use('/api/incoming', incomingRouter);
  app.use('/api/warehouse-balance', warehouseRouter);
  app.use('/api/sales', salesRouter);
  app.use('/api/logistics', logisticsRouter);
  app.use('/api/cash-income', cashIncomeRouter);
  app.use('/api/cash-expense', cashExpenseRouter);
  app.use('/api/report', reportsRouter);

  app.use(errorHandler);

  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  return app;
}
