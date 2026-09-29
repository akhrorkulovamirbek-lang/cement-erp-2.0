import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '@/api/client';
import { useResetUserPassword, usersHooks } from '@/api/modules';
import { RHFButtonGroup } from '@/components/ButtonGroup';
import { Badge } from '@/components/Badge';
import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { SidePanel } from '@/components/SidePanel';
import { FormRow, Input, RHFCheckbox } from '@/components/form';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { ROLE_LABELS, ROLES, type AppUser, type UserRole } from '@/types';

const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

interface FormValues {
  fullName: string;
  username: string;
  password: string;
  role: UserRole;
  phone: string;
  active: boolean;
}

const emptyForm = (): FormValues => ({ fullName: '', username: '', password: '', role: 'operator', phone: '', active: true });

export function Users() {
  const { notify } = useToast();
  const list = usersHooks.useList();
  const create = usersHooks.useCreate();
  const update = usersHooks.useUpdate();
  const resetPassword = useResetUserPassword();

  const [editing, setEditing] = useState<AppUser | 'new' | null>(null);
  const [resetting, setResetting] = useState<AppUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const { register, control, handleSubmit, reset, formState } = useForm<FormValues>({ defaultValues: emptyForm() });

  function openNew() {
    reset(emptyForm());
    setEditing('new');
  }
  function openEdit(row: AppUser) {
    reset({ fullName: row.full_name, username: row.username, password: '', role: row.role, phone: row.phone ?? '', active: row.active });
    setEditing(row);
  }

  async function onSubmit(data: FormValues) {
    try {
      if (editing === 'new') {
        await create.mutateAsync({
          fullName: data.fullName,
          username: data.username,
          password: data.password,
          role: data.role,
          phone: data.phone || null,
          active: data.active,
        });
        notify('Пользователь добавлен');
      } else if (editing) {
        await update.mutateAsync({
          id: editing.id,
          data: { fullName: data.fullName, role: data.role, phone: data.phone || null, active: data.active },
        });
        notify('Сохранено');
      }
      setEditing(null);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  async function onResetPassword() {
    if (!resetting || newPassword.length < 6) return;
    try {
      await resetPassword.mutateAsync({ id: resetting.id, newPassword });
      notify('Пароль сброшен');
      setResetting(null);
      setNewPassword('');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  const columns: Column<AppUser>[] = [
    { key: 'full_name', header: 'ФИО', sortValue: (r) => r.full_name },
    { key: 'username', header: 'Логин' },
    { key: 'role', header: 'Роль', render: (r) => ROLE_LABELS[r.role] },
    { key: 'phone', header: 'Телефон', render: (r) => r.phone || '—' },
    {
      key: 'active',
      header: 'Статус',
      render: (r) => (r.active ? <Badge tone="green">Активен</Badge> : <Badge tone="slate">Деактивирован</Badge>),
    },
    { key: 'created_at', header: 'Создан', sortValue: (r) => r.created_at, render: (r) => formatDate(r.created_at) },
  ];

  return (
    <div>
      <PageHeader title="Пользователи" subtitle="Регистрации нет — пользователей создаёт администратор" action={<Button onClick={openNew}>+ Добавить пользователя</Button>} />

      <DataTable
        columns={columns}
        rows={list.data ?? []}
        loading={list.isLoading}
        getRowId={(r) => r.id}
        onEdit={openEdit}
        extraRowAction={(r) => (
          <Button variant="ghost" size="icon" onClick={() => setResetting(r)} aria-label="Сбросить пароль">
            <KeyRound className="size-4" />
          </Button>
        )}
      />

      {editing && (
        <SidePanel title={editing === 'new' ? 'Новый пользователь' : 'Изменить пользователя'} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormRow label="ФИО" error={formState.errors.fullName?.message}>
              <Input autoFocus {...register('fullName', { required: 'Укажите ФИО' })} />
            </FormRow>
            <FormRow label="Логин" error={formState.errors.username?.message}>
              <Input {...register('username', { required: 'Укажите логин' })} disabled={editing !== 'new'} />
            </FormRow>
            {editing === 'new' && (
              <FormRow label="Пароль" error={formState.errors.password?.message}>
                <Input type="password" {...register('password', { required: 'Укажите пароль', minLength: { value: 6, message: 'Не короче 6 символов' } })} />
              </FormRow>
            )}
            <FormRow label="Роль">
              <RHFButtonGroup control={control} name="role" options={ROLE_OPTIONS} />
            </FormRow>
            <FormRow label="Телефон (необязательно)">
              <Input {...register('phone')} placeholder="+998 90 123 45 67" />
            </FormRow>
            <RHFCheckbox control={control} name="active" label="Активен" />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Отмена
              </Button>
              <Button type="submit" disabled={formState.isSubmitting}>
                Сохранить
              </Button>
            </div>
          </form>
        </SidePanel>
      )}

      {resetting && (
        <SidePanel title={`Сбросить пароль: ${resetting.full_name}`} onClose={() => setResetting(null)}>
          <div className="space-y-4">
            <FormRow label="Новый пароль">
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoFocus />
            </FormRow>
            {newPassword.length > 0 && newPassword.length < 6 && (
              <p className="text-xs text-destructive">Пароль должен быть не короче 6 символов</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setResetting(null)}>
                Отмена
              </Button>
              <Button type="button" onClick={onResetPassword} disabled={newPassword.length < 6}>
                Сбросить пароль
              </Button>
            </div>
          </div>
        </SidePanel>
      )}
    </div>
  );
}
