import { useState } from 'react';
import { useAuditLog, usersHooks } from '@/api/modules';
import { DataTable, type Column } from '@/components/DataTable';
import { FilterBar } from '@/components/FilterBar';
import { PageHeader } from '@/components/PageHeader';
import { PlainSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import type { AuditLogEntry } from '@/types';

const ACTION_LABELS: Record<string, string> = {
  create: 'Создание',
  update: 'Изменение',
  delete: 'Удаление',
  login_success: 'Вход',
  login_failed: 'Неудачный вход',
  login_locked: 'Блокировка входа',
  login_blocked: 'Вход заблокирован',
  login_blocked_inactive: 'Вход (деактивирован)',
  logout: 'Выход',
  reset_password: 'Сброс пароля',
  change_password: 'Смена пароля',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function summarizeChange(entry: AuditLogEntry): string {
  if (!entry.before || !entry.after || typeof entry.before !== 'object' || typeof entry.after !== 'object') return '—';
  const before = entry.before as Record<string, unknown>;
  const after = entry.after as Record<string, unknown>;
  const diffs: string[] = [];
  for (const key of Object.keys(after)) {
    if (key === 'updated_at' || key === 'created_at' || key === 'password_hash') continue;
    const b = before[key];
    const a = after[key];
    if (JSON.stringify(b) !== JSON.stringify(a) && b !== undefined) {
      diffs.push(`${key}: ${String(b)} → ${String(a)}`);
    }
  }
  return diffs.length ? diffs.join('; ') : '—';
}

export function AuditLog() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [userId, setUserId] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const users = usersHooks.useList();
  const log = useAuditLog({ from: from || undefined, to: to || undefined, userId: userId || undefined, action: action || undefined, page });

  const columns: Column<AuditLogEntry>[] = [
    { key: 'at', header: 'Когда', render: (r) => new Date(r.at).toLocaleString('ru-RU') },
    { key: 'user_full_name', header: 'Пользователь', render: (r) => r.user_full_name || r.user_username || '—' },
    { key: 'action', header: 'Действие', render: (r) => actionLabel(r.action) },
    { key: 'object_label', header: 'Объект', render: (r) => r.object_label || `${r.object_type} #${r.object_id ?? ''}` },
    { key: 'diff', header: 'Было / стало', render: summarizeChange },
    { key: 'ip', header: 'IP', render: (r) => r.ip || '—' },
  ];

  const totalPages = log.data ? Math.max(1, Math.ceil(log.data.total / log.data.pageSize)) : 1;

  return (
    <div>
      <PageHeader title="Журнал действий" subtitle="Нельзя изменить или удалить, даже администратору" />

      <FilterBar from={from} to={to} onFromChange={setFrom} onToChange={setTo}>
        <PlainSelect
          value={userId}
          onValueChange={setUserId}
          className="w-48"
          placeholder="Все пользователи"
          options={[{ value: '', label: 'Все пользователи' }, ...(users.data ?? []).map((u) => ({ value: String(u.id), label: u.full_name }))]}
        />
        <PlainSelect
          value={action}
          onValueChange={setAction}
          className="w-48"
          placeholder="Все действия"
          options={[{ value: '', label: 'Все действия' }, ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))]}
        />
      </FilterBar>

      <DataTable columns={columns} rows={log.data?.rows ?? []} loading={log.isLoading} getRowId={(r) => r.id} />

      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>Всего записей: {log.data?.total ?? 0}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Назад
          </Button>
          <span>
            Стр. {page} из {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Вперёд
          </Button>
        </div>
      </div>
    </div>
  );
}
