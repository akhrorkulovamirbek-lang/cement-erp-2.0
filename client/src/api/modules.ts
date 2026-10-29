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
  CarrierBalance,
  SupplierReportRow,
  CashBalances,
  CashExpense,
  CashIncome,
  CashServiceOperation,
  CashServiceSummary,
  ClientDebtAdjustment,
  ZavodDebtAdjustment,
  Suggestions,
  TicketReturnInfo,
  CementMark,
  CementReportRow,
  Client,
  ClientBalance,
  DebtsSummary,
  ExpenseCategory,
  Factory,
  Incoming,
  Logist,
  LogistDetailData,
  Machine,
  ModuleSetting,
  PermissionRoleRow,
  ReportSummary,
  Sale,
  Ticket,
  VehicleReportRow,
  WarehouseBalance,
  Zavod,
  ZavodBalance,
} from '../types';

const REPORT_KEYS = [
  'report-summary',
  'report-client-balance',
  'report-zavod-balance',
  'report-debts-summary',
  'report-cash-balances',
  'carrier-balances',
  'report-carriers',
  'report-suppliers',
];

// TInput разрешает числа/булевы, где ответ API (T) хранит их как строки NUMERIC из Postgres —
// не переиспользуем сам T как тип формы записи.
export const zavodyHooks = createCrudHooks<Zavod, Record<string, unknown>>('zavody', '/zavody');
export const factoriesHooks = createCrudHooks<Factory, Record<string, unknown>>('factories', '/factories', ['incoming', 'tickets']);
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
// Операция создаёт/правит связанную строку cash_expense и меняет баланс банковского счёта —
// инвалидируем обе 'cash-expense' (единый список Кассы её подтянет) и 'bank-accounts'.
export const cashServiceHooks = createCrudHooks<CashServiceOperation, Record<string, unknown>>(
  'cash-service',
  '/cash-service',
  ['bank-accounts', 'cash-expense', 'cash-service-summary', ...REPORT_KEYS],
);

export function useCashServiceSummary(params: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ['cash-service-summary', params],
    queryFn: () => api.get<CashServiceSummary>(`/cash-service/summary${buildQuery(params)}`),
  });
}

export function useCementReport(params: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ['report-cement', params],
    queryFn: () => api.get<CementReportRow[]>(`/report/cement${buildQuery(params)}`),
  });
}

export function useVehiclesReport(params: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ['report-vehicles', params],
    queryFn: () => api.get<VehicleReportRow[]>(`/report/vehicles${buildQuery(params)}`),
  });
}

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

// Пополнение брокерского счёта теперь ещё и расход кассы (category='брокер') — обновляем и кассу.
export interface VehicleHistory {
  number: string;
  machine: { id: number; number: string; model: string | null; driver: string | null; capacity_tons: string | null; active: boolean } | null;
  carriers: string[];
  trips: {
    id: number;
    date: string;
    sale_type: 'CEMENT' | 'LOGISTICS';
    vehicle_type: 'CLIENT' | 'OWN' | 'HIRED';
    tonnage: string;
    freight_price_per_ton: string | null;
    hire_price_per_ton: string | null;
    carrier_name: string | null;
    route: string | null;
    total_sum: string;
    awaiting_shipment: boolean;
    client_name: string | null;
    zavod_name: string | null;
    cement_mark_name: string | null;
  }[];
  expenses: {
    id: number;
    date: string;
    category: string;
    expense_type: string | null;
    amount: string;
    currency: 'UZS' | 'USD';
    usd_rate: string | null;
    payment_type: string;
    comment: string | null;
    amount_uzs: string;
  }[];
  summary: { tripCount: number; tonnage: number; revenue: number; hireCost: number; expensesTotal: number; margin: number };
}

export function useVehicleHistory(number: string) {
  return useQuery({
    queryKey: ['vehicle-history', number],
    queryFn: () => api.get<VehicleHistory>(`/vehicles/${encodeURIComponent(number)}/history`),
    enabled: number.length > 0,
  });
}

export function useShipSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<unknown>(`/sales/${id}/ship`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['vehicle-history'] });
    },
  });
}

export function useSetDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: number; status: 'yes' | 'no' | null }) => api.post<unknown>(`/sales/${p.id}/delivery`, { status: p.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useReplenishBroker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      date: string;
      amount: number;
      currency: 'UZS' | 'USD';
      usd_rate?: number | null;
      payment_type: 'перечисление' | 'наличка' | 'карта';
      description?: string;
    }) => api.post<BrokerOperation>('/broker-account/replenish', data),
    onSuccess: () => {
      for (const key of ['broker-account', 'cash-expense', ...REPORT_KEYS]) qc.invalidateQueries({ queryKey: [key] });
    },
  });
}

export function useTicketReturns(params: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ['ticket-returns', params],
    queryFn: () => api.get<TicketReturnInfo[]>(`/cash-income/ticket-returns${buildQuery(params)}`),
  });
}

export const clientAdjustmentsHooks = createCrudHooks<ClientDebtAdjustment, Record<string, unknown>>(
  'client-adjustments',
  '/client-adjustments',
  REPORT_KEYS,
);

export const zavodAdjustmentsHooks = createCrudHooks<ZavodDebtAdjustment, Record<string, unknown>>(
  'zavod-adjustments',
  '/zavod-adjustments',
  REPORT_KEYS,
);

export function useSuggestions() {
  return useQuery({
    queryKey: ['suggestions'],
    queryFn: () => api.get<Suggestions>('/suggestions'),
    staleTime: 30_000,
  });
}

export function useCloseTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<Ticket>(`/tickets/${id}/close`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['broker-account'] });
      qc.invalidateQueries({ queryKey: ['ticket-returns'] });
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

export function useCarrierBalances() {
  return useQuery({
    queryKey: ['carrier-balances'],
    queryFn: () => api.get<CarrierBalance[]>('/cash-expense/carrier-balances'),
  });
}

export function useSuppliersReport() {
  return useQuery({
    queryKey: ['report-suppliers'],
    queryFn: () => api.get<SupplierReportRow[]>('/report/suppliers'),
  });
}

export function useCarriersReport() {
  return useQuery({
    queryKey: ['report-carriers'],
    queryFn: () => api.get<CarrierBalance[]>('/report/carriers'),
  });
}

export function useDebtsSummary() {
  return useQuery({
    queryKey: ['report-debts-summary'],
    queryFn: () => api.get<DebtsSummary>('/report/debts-summary'),
  });
}

export function useCashBalances() {
  return useQuery({
    queryKey: ['report-cash-balances'],
    queryFn: () => api.get<CashBalances>('/report/cash-balances'),
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
    mutationFn: (data: {
      session_timeout_minutes?: number;
      broker_allow_negative?: boolean;
      cash_service_default_commission_percent?: number;
    }) => api.put<AppSettingsMap>('/settings/app', data),
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

// Импорт данных: Приход/Продажи/Касса/Остаток склада грузятся файлом в один запрос-транзакцию
// (см. server/src/modules/import) — Клиенты/Заводы переиспользуют обычные useCreate() хуков выше.
function useImportMutation(path: string, invalidateKeys: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: Record<string, unknown>[]) => api.post<{ count: number }>(path, { rows }),
    onSuccess: () => invalidateKeys.forEach((key) => qc.invalidateQueries({ queryKey: [key] })),
  });
}

export function useImportIncoming() {
  return useImportMutation('/import/incoming', ['incoming', 'warehouse-balance', ...REPORT_KEYS]);
}

export function useImportSales() {
  return useImportMutation('/import/sales', ['sales', 'warehouse-balance', 'tickets', 'broker-account', ...REPORT_KEYS]);
}

export function useImportCash() {
  return useImportMutation('/import/cash', ['cash-income', 'cash-expense', ...REPORT_KEYS]);
}

export function useImportWarehouseSnapshot() {
  return useImportMutation('/import/warehouse-snapshot', ['warehouse-balance', ...REPORT_KEYS]);
}

// Опасная зона в Настройках: стирает все рабочие данные (пользователи, права и настройки остаются).
export function useClearAllData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (confirm: string) => api.post<{ ok: boolean }>('/admin/clear-data', { confirm }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

// Владелец платформы: реестр организаций.
export interface OrganizationRow {
  id: number;
  name: string;
  active: boolean;
  created_at: string;
  users_count: number;
  admins: string | null;
}

export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: () => api.get<OrganizationRow[]>('/platform/organizations'),
  });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; adminUsername: string; adminPassword: string; adminFullName?: string }) =>
      api.post<{ id: number; name: string }>('/platform/organizations', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  });
}

export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; active?: boolean }) =>
      api.put<{ id: number; name: string; active: boolean }>(`/platform/organizations/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  });
}

// Логисты (перевозчики с машинами).
export const logistsHooks = createCrudHooks<Logist, Record<string, unknown>>('logists', '/logists', ['logist-detail', 'suggestions', ...REPORT_KEYS]);

export function useLogistDetail(id: number) {
  return useQuery({
    queryKey: ['logist-detail', id],
    queryFn: () => api.get<LogistDetailData>(`/logists/${id}`),
    enabled: id > 0,
  });
}

export function useLogistAction() {
  const qc = useQueryClient();
  const done = () => {
    for (const key of ['logists', 'logist-detail', ...REPORT_KEYS]) qc.invalidateQueries({ queryKey: [key] });
  };
  return {
    addMachine: useMutation({
      mutationFn: ({ id, ...data }: { id: number; number: string; model?: string | null; driver?: string | null }) =>
        api.post(`/logists/${id}/machines`, data),
      onSuccess: done,
    }),
    removeMachine: useMutation({ mutationFn: (machineId: number) => api.delete(`/logists/machines/${machineId}`), onSuccess: done }),
    addAdjustment: useMutation({
      mutationFn: ({ id, ...data }: { id: number; date: string; amount: number; comment: string }) =>
        api.post(`/logists/${id}/adjustments`, data),
      onSuccess: done,
    }),
    removeAdjustment: useMutation({ mutationFn: (adjId: number) => api.delete(`/logists/adjustments/${adjId}`), onSuccess: done }),
  };
}

// ---- Телеграм-бот: заявки на продажу от менеджеров ----
export interface SaleRequest {
  id: number;
  manager_name: string;
  summary: string;
  status: 'pending' | 'approved' | 'rejected';
  reject_reason: string | null;
  problems: string | null;
  form: Record<string, unknown> | null;
  sale_id: number | null;
  created_at: string;
  decided_at: string | null;
}
export interface BotManager {
  id: number;
  name: string;
  link_code: string | null;
  linked: boolean;
  active: boolean;
}

export function useSaleRequests(status?: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['bot-requests', status ?? 'all'],
    queryFn: () => api.get<SaleRequest[]>(`/bot/requests${buildQuery({ status })}`),
    refetchInterval: 30_000,
    enabled: options.enabled ?? true,
  });
}

export function useUpdateSaleRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: number; data: Record<string, unknown> }) => api.put<{ ok: boolean; incomplete: boolean }>(`/bot/requests/${p.id}`, p.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bot-requests'] }),
  });
}

export function useDecideRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: number; approve: boolean; reason?: string }) =>
      api.post<unknown>(`/bot/requests/${p.id}/${p.approve ? 'approve' : 'reject'}`, p.approve ? {} : { reason: p.reason ?? '' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bot-requests'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      for (const k of REPORT_KEYS) qc.invalidateQueries({ queryKey: [k] });
    },
  });
}

export function useBotConfig() {
  return useQuery({ queryKey: ['bot-config'], queryFn: () => api.get<{ connected: boolean; username: string | null }>('/bot/config') });
}
export function useSaveBotToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.put<{ connected: boolean; username: string }>('/bot/config', { token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bot-config'] }),
  });
}
export function useRemoveBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>('/bot/config'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bot-config'] }),
  });
}
export function useBotManagers() {
  return useQuery({ queryKey: ['bot-managers'], queryFn: () => api.get<BotManager[]>('/bot/managers') });
}
export function useAddBotManager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<{ id: number; name: string; link_code: string }>('/bot/managers', { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bot-managers'] }),
  });
}
export function useDeleteBotManager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/bot/managers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bot-managers'] }),
  });
}

export function useSubmitQuickOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post<{ id: number }>('/bot/requests', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bot-requests'] }),
  });
}

export interface BotClientLink {
  client_id: number;
  client_name: string;
  bot_code: string;
  linked_count: number;
}
export function useBotClientLinks() {
  return useQuery({ queryKey: ['bot-client-links'], queryFn: () => api.get<BotClientLink[]>('/bot/client-links') });
}
export function useRegenerateBotCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (clientId: number) => api.post<{ bot_code: string }>(`/bot/client-links/${clientId}/regenerate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bot-client-links'] }),
  });
}
export function useDisconnectBotClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (clientId: number) => api.delete<void>(`/bot/client-links/${clientId}/people`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bot-client-links'] }),
  });
}

export interface SurveySettings {
  enabled: boolean;
  hour: number;
  lastRun: string | null;
}
export function useSurveySettings() {
  return useQuery({ queryKey: ['bot-survey'], queryFn: () => api.get<SurveySettings>('/bot/survey') });
}
export function useUpdateSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { enabled?: boolean; hour?: number }) => api.put<SurveySettings>('/bot/survey', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bot-survey'] }),
  });
}
export function useRunSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ asked: number }>('/bot/survey/run'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

// ---- Финансовые отчёты ----
export interface PnlData {
  cement: { source: string; deals: number; tonnage: number; revenue: number; cost: number; margin: number }[];
  logistics: {
    own: { trips: number; tonnage: number; revenue: number; cost: number };
    hired: { trips: number; tonnage: number; revenue: number; cost: number };
  };
  other: { cashServiceCommission: number; otherExpenses: number };
  excludedHistorical: number;
}
export interface DealMargin {
  id: number;
  date: string;
  client_id: number;
  client_name: string;
  mark: string | null;
  packaging: string | null;
  source: string;
  tonnage: string;
  price_per_ton: string;
  cost_per_ton: string;
  revenue: string;
  cost: string;
  margin: string;
}
export interface CashFlowData {
  opening: { UZS: number; USD: number };
  income: { category: string; UZS: number; USD: number }[];
  expense: { category: string; UZS: number; USD: number }[];
  closing: { UZS: number; USD: number };
}
export interface BrokerReportData {
  opening: number;
  replenish: number;
  purchases: number;
  returns: number;
  closing: number;
  currentBalance: number;
  rows: { id: number; date: string; type: 'replenish' | 'ticket_purchase' | 'ticket_return'; amount: number; description: string | null; ticket_number: string | null; balance: number }[];
}
export interface StockReportData {
  warehouse: { zavod_name: string; mark: string; packaging: string; tonnage: number; avg_cost_per_ton: number; value: number }[];
  tickets: { ticket_number: string; date: string; zavod_name: string; mark: string; packaging: string; tonnage: number; price_per_ton: number; value: number }[];
}
export interface MachineRow {
  label: string;
  type: 'own' | 'hired';
  trips: number;
  tonnage: number;
  revenue: number;
  cost: number;
  costs: { type: string; amount: number }[];
  profit: number;
}

type Period = { from?: string; to?: string };
export const usePnl = (p: Period) => useQuery({ queryKey: ['fin-pnl', p], queryFn: () => api.get<PnlData>(`/report/pnl${buildQuery(p)}`) });
export const useDealMargins = (p: Period) => useQuery({ queryKey: ['fin-deals', p], queryFn: () => api.get<DealMargin[]>(`/report/deal-margins${buildQuery(p)}`) });
export const useCashFlow = (p: Period) => useQuery({ queryKey: ['fin-cashflow', p], queryFn: () => api.get<CashFlowData>(`/report/cash-flow${buildQuery(p)}`) });
export const useBrokerReport = (p: Period) => useQuery({ queryKey: ['fin-broker', p], queryFn: () => api.get<BrokerReportData>(`/report/broker${buildQuery(p)}`) });
export const useStockReport = () => useQuery({ queryKey: ['fin-stock'], queryFn: () => api.get<StockReportData>('/report/stock') });
export const useMachinesReport = (p: Period) => useQuery({ queryKey: ['fin-machines', p], queryFn: () => api.get<MachineRow[]>(`/report/machines${buildQuery(p)}`) });

// ---- Сверка упаковки марок ----
export interface PackagingCheckMark {
  id: number;
  name: string;
  active: boolean;
  hint: 'MESHOK' | 'NAVAL' | null;
  by: Record<'MESHOK' | 'NAVAL', { incoming: number; sales: number; tickets: number; stockTon: number }>;
  wrong: number;
  stockWrong: number;
}
export interface PackagingMismatch {
  src: 'incoming' | 'sales' | 'tickets';
  id: number;
  date: string;
  mark: string;
  packaging: 'MESHOK' | 'NAVAL' | null;
  expected: 'MESHOK' | 'NAVAL';
  tonnage: number;
  who: string | null;
  price: number | null;
  sum: number | null;
  machine: string | null;
}
export function usePackagingCheck(enabled: boolean) {
  return useQuery({
    queryKey: ['packaging-check'],
    queryFn: () => api.get<{ marks: PackagingCheckMark[]; mismatches: PackagingMismatch[]; mismatchTotal: number }>('/cement-marks/packaging-check'),
    enabled,
  });
}

// ---- Контроль данных ----
export interface HealthCheck {
  key: string;
  title: string;
  severity: 'high' | 'medium' | 'low';
  why: string;
  fix: string;
  count: number;
  items: { title: string; detail: string }[];
}
export function useDataHealth() {
  return useQuery({ queryKey: ['data-health'], queryFn: () => api.get<{ checks: HealthCheck[]; generatedAt: string }>('/report/data-health'), staleTime: 0 });
}
