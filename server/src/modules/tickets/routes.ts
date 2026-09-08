import { Router } from 'express';
import { pool, withTransaction } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { createTicketSchema, updateTicketSchema } from './schema.js';
import { closeTicket, createTicket, deleteTicket, updateTicket } from './service.js';

export const ticketsRouter = Router();

ticketsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { zavod_id, status } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (zavod_id) {
      params.push(Number(zavod_id));
      conditions.push(`t.zavod_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT t.*, z.name AS zavod_name, cm.name AS cement_mark_name
       FROM tickets t
       JOIN zavody z ON z.id = t.zavod_id
       JOIN cement_marks cm ON cm.id = t.cement_mark_id
       ${where}
       ORDER BY t.created_at DESC`,
      params,
    );
    res.json(rows);
  }),
);

ticketsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createTicketSchema.parse(req.body);
    const ticket = await withTransaction((client) => createTicket(client, data));
    res.status(201).json(ticket);
  }),
);

ticketsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = updateTicketSchema.parse(req.body);
    const ticket = await withTransaction((client) => updateTicket(client, Number(req.params.id), data));
    res.json(ticket);
  }),
);

ticketsRouter.post(
  '/:id/close',
  asyncHandler(async (req, res) => {
    const ticket = await withTransaction((client) => closeTicket(client, Number(req.params.id)));
    res.json(ticket);
  }),
);

ticketsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await withTransaction((client) => deleteTicket(client, Number(req.params.id)));
    res.status(204).end();
  }),
);
