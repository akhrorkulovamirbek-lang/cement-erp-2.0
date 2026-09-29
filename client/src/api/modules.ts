import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, buildQuery } from './client';
import { createCrudHooks } from './crud';
import type {
  AppSettingsMap,
  AppUser,
  AuditLogEntry,
  BankAccount,
  BrokerAccount,
  BrokerOperation,
  CashExpense,
  CashIncome,
  CementMark,
  Client,
  ClientBalance,
  ExpenseCategory,
  Incoming,
  Machine,
  ModuleSetting,
  PermissionRoleRow,
  ReportSummary,
  Sale,
  Ticket,
  WarehouseBalance,
  Zavod,
  ZavodBalance,
} from '../types';

const REPORT_KEYS = ['report-summary', 'report-client-balance', 'report-zavod-balance'];

// TInput разрешает числа/булевы, где ответ API (T) хранит их как строки NUMERIC из Postgres —
// не переиспользуем сам T как тип формы записи.
export const zavodyHooks = createCrudHooks<Zavod, Record<string, unknown>>('zavody', '/zavody');
export const clientsHooks = createCrudHooks<Client, Record<string, unknown>>('clients', '/clients');
export const cementMarksHooks = createCrudHooks<CementMark, Record<string, unknown>>('cement-marks', '/cement-marks');
export const machinesHooks = createCrudHooks<Machine, Record<string, unknown>>('machines', '/machines');
export const bankAccountsHooks = createCrudHooks<BankAccount, Record<string, unknown>>('bank-accounts', '/bank-accounts');
export const logisticsExpenseCategoriesHooks = createCrudHooks<ExpenseCategory, Record<string, unknown>>(
  'logistics-expense-categories',
  '/logistics-expense-categories',
);
export const usersHooks = createCrudHooks<AppUser, Record<string, unknown>>('users', '/users');
export const incomingHooks = createCrudHooks<Incoming, Record<string, unknown>>('incoming', '/incoming', [
  'warehouse-balance',
  'broker-account',
  'tickets',
  ...REPORT_KEYS,
]);
export const salesHooks = createCrudHooks<Sale, Record<string, unknown>>('sales', '/sales', [
  'warehouse-balance',
  'tickets',
  'broker-account',
  ...REPORT_KEYS,
]);
export const cashIncomeHooks = createCrudHooks<CashIncome>('cash-income', '/cash-income', REPORT_KEYS);
export const cashExpenseHooks = createCrudHooks<CashExpense>('cash-expense', '/cash-expense', REPORT_KEYS);
export const ticketsHooks = createCrudHooks<Ticket, Record<string, unknown>>('tickets', '/tickets', ['broker-account', ...REPORT_KEYS]);

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

// Ядро: права текущего пользователя, включённые модули, настройки, журнал действий.

export function useMyPermissions() {
  return useQuery({
    queryKey: ['my-permissions'],
    queryFn: () => api.get<{ role: string; resources: Record<string, boolean> }>('/my-access/permissions'),
    staleTime: 60_000,
  });
}

export function useMyEnabledModules() {
  return useQuery({
    queryKey: ['my-modules'],
    queryFn: () => api.get<Record<string, boolean>>('/my-access/modules'),
    staleTime: 60_000,
  });
}

export function useModuleSettings() {
  return useQuery({
    queryKey: ['module-settings'],
    queryFn: () => api.get<ModuleSetting[]>('/settings/modules'),
  });
}

export function useToggleModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, enabled }: { code: string; enabled: boolean }) =>
      api.put<{ code: string; enabled: boolean }>(`/settings/modules/${code}`, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['module-settings'] });
      qc.invalidateQueries({ queryKey: ['my-modules'] });
    },
  });
}

export function usePermissionMatrix() {
  return useQuery({
    queryKey: ['permission-matrix'],
    queryFn: () => api.get<PermissionRoleRow[]>('/settings/permissions'),
  });
}

export function useSetPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { role: string; resourceCode: string; allowed: boolean }) => api.put('/settings/permissions', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permission-matrix'] });
      qc.invalidateQueries({ queryKey: ['my-permissions'] });
    },
  });
}

export function useAppSettings() {
  return useQuery({
    queryKey: ['app-settings'],
    queryFn: () => api.get<AppSettingsMap>('/settings/app'),
  });
}

export function useUpdateAppSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { session_timeout_minutes?: number; broker_allow_negative?: boolean }) =>
      api.put<AppSettingsMap>('/settings/app', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-settings'] }),
  });
}

export function useAuditLog(params: {
  from?: string;
  to?: string;
  userId?: string;
  action?: string;
  objectType?: string;
  page?: number;
} = {}) {
  return useQuery({
    queryKey: ['audit-log', params],
    queryFn: () =>
      api.get<{ rows: AuditLogEntry[]; total: number; page: number; pageSize: number }>(`/audit-log${buildQuery(params)}`),
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, newPassword }: { id: number; newPassword: string }) =>
      api.post<void>(`/users/${id}/reset-password`, { newPassword }),
  });
}

export function useChangeOwnPassword() {
  return useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) => api.post<void>('/auth/change-password', data),
  });
}
