import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, buildQuery } from './client';
import { createCrudHooks } from './crud';
import type {
  BrokerAccount,
  BrokerOperation,
  CashExpense,
  CashIncome,
  CementMark,
  Client,
  ClientBalance,
  Incoming,
  Logistics,
  Machine,
  ReportSummary,
  Sale,
  Ticket,
  WarehouseBalance,
  Zavod,
  ZavodBalance,
} from '../types';

const REPORT_KEYS = ['report-summary', 'report-client-balance', 'report-zavod-balance'];

export const zavodyHooks = createCrudHooks<Zavod, { name: string }>('zavody', '/zavody');
export const clientsHooks = createCrudHooks<Client, { name: string; phone?: string | null }>('clients', '/clients');
export const cementMarksHooks = createCrudHooks<CementMark, { name: string }>('cement-marks', '/cement-marks');
export const machinesHooks = createCrudHooks<Machine, { number: string }>('machines', '/machines');
export const incomingHooks = createCrudHooks<Incoming>('incoming', '/incoming', ['warehouse-balance', ...REPORT_KEYS]);
export const salesHooks = createCrudHooks<Sale>('sales', '/sales', ['warehouse-balance', 'tickets', 'broker-account', ...REPORT_KEYS]);
export const logisticsHooks = createCrudHooks<Logistics>('logistics', '/logistics', REPORT_KEYS);
export const cashIncomeHooks = createCrudHooks<CashIncome>('cash-income', '/cash-income', REPORT_KEYS);
export const cashExpenseHooks = createCrudHooks<CashExpense>('cash-expense', '/cash-expense', REPORT_KEYS);
export const ticketsHooks = createCrudHooks<Ticket>('tickets', '/tickets', ['broker-account', ...REPORT_KEYS]);

export function useWarehouseBalance() {
  return useQuery({
    queryKey: ['warehouse-balance'],
    queryFn: () => api.get<WarehouseBalance[]>('/warehouse-balance'),
  });
}

export function useBrokerAccount() {
  return useQuery({
    queryKey: ['broker-account'],
    queryFn: () => api.get<{ account: BrokerAccount; operations: BrokerOperation[] }>('/broker-account'),
  });
}

export function useReplenishBroker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { date: string; amount: number; description?: string }) =>
      api.post<BrokerOperation>('/broker-account/replenish', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broker-account'] }),
  });
}

export function useCloseTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<Ticket>(`/tickets/${id}/close`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['broker-account'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
    },
  });
}

export function useReportSummary(params: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ['report-summary', params],
    queryFn: () => api.get<ReportSummary>(`/report/summary${buildQuery(params)}`),
  });
}

export function useClientBalances() {
  return useQuery({
    queryKey: ['report-client-balance'],
    queryFn: () => api.get<ClientBalance[]>('/report/client-balance'),
  });
}

export function useZavodBalances() {
  return useQuery({
    queryKey: ['report-zavod-balance'],
    queryFn: () => api.get<ZavodBalance[]>('/report/zavod-balance'),
  });
}
