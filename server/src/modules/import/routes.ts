import { Router } from 'express';
import { withTransaction } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { importCashSchema, importIncomingSchema, importSaleSchema, importWarehouseSnapshotSchema } from './schema.js';
import { importCash, importIncoming, importSales, importWarehouseSnapshot } from './service.js';

export const importRouter = Router();

importRouter.post(
  '/incoming',
  asyncHandler(async (req, res) => {
    const data = importIncomingSchema.parse(req.body);
    const count = await withTransaction((client) => importIncoming(client, data.rows));
    res.status(201).json({ count });
  }),
);

importRouter.post(
  '/sales',
  asyncHandler(async (req, res) => {
    const data = importSaleSchema.parse(req.body);
    const count = await withTransaction((client) => importSales(client, data.rows));
    res.status(201).json({ count });
  }),
);

importRouter.post(
  '/cash',
  asyncHandler(async (req, res) => {
    const data = importCashSchema.parse(req.body);
    const count = await withTransaction((client) => importCash(client, data.rows));
    res.status(201).json({ count });
  }),
);

importRouter.post(
  '/warehouse-snapshot',
  asyncHandler(async (req, res) => {
    const data = importWarehouseSnapshotSchema.parse(req.body);
    const count = await withTransaction((client) => importWarehouseSnapshot(client, data.rows));
    res.status(201).json({ count });
  }),
);
