import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '@/api/client';
import { type OrganizationRow, useCreateOrganization, useOrganizations, useUpdateOrganization } from '@/api/modules';
import { Badge } from '@/components/Badge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { SidePanel } from '@/components/SidePanel';
import { FormRow, Input } from '@/components/form';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import { useToast } from '@/lib/toast';

interface FormValues {
  name: string;
  adminFullName: string;
  adminUsername: string;
  adminPassword: string;
}

const emptyForm = (): FormValues => ({ name: '', adminFullName: '', adminUsername: '', adminPassword: '' });

/** Раздел владельца платформы: у каждой организации своя отдельная база данных, организации
 * друг друга не видят. Здесь их создают и временно отключают. */
export function Organizations() {
  const { notify } = useToast();
  const list = useOrganizations();
  const create = useCreateOrganization();
  const update = useUpdateOrganization();
  const [open, setOpen] = useState(false);
  const [toggling, setToggling] = useState<OrganizationRow | null>(null);
  const { register, handleSubmit, reset, formState } = useForm<FormValues>({ defaultValues: emptyForm() });

  async function onSubmit(data: FormValues) {
    try {
      await create.mutateAsync({
        name: data.name,
        adminUsername: data.adminUsername,
        adminPassword: data.adminPassword,
        adminFullName: data.adminFullName || undefined,
      });
      notify('Организация создана — администратор может входить');
      setOpen(false);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  async function onToggle() {
    if (!toggling) return;
    try {
      await update.mutateAsync({ id: toggling.id, active: !toggling.active });
      notify(toggling.active ? 'Доступ организации приостановлен' : 'Доступ организации восстановлен');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    } finally {
      setToggling(null);
    }
  }

  const columns: Column<OrganizationRow>[] = [
    { key: 'name', header: 'Организация', sortValue: (r) => r.name },
    { key: 'admins', header: 'Администратор', render: (r) => r.admins ?? '—' },
    { key: 'users_count', header: 'Пользователей', align: 'right', sortValue: (r) => r.users_count },
    {
      key: 'active',
      header: 'Статус',
      render: (r) => (r.active ? <Badge tone="green">Работает</Badge> : <Badge tone="amber">Приостановлена</Badge>),
    },
    { key: 'created_at', header: 'Создана', sortValue: (r) => r.created_at, render: (r) => formatDate(r.created_at) },
  ];

  return (
    <div>
      <PageHeader
        title="Организации"
        subtitle="У каждой организации свои данные и свои пользователи — они не видят друг друга"
        action={
          <Button
            onClick={() => {
              reset(emptyForm());
              setOpen(true);
            }}
          >
            + Новая организация
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={list.data ?? []}
        loading={list.isLoading}
        getRowId={(r) => r.id}
        extraRowAction={(r) => (
          <Button variant="ghost" size="sm" onClick={() => setToggling(r)}>
            {r.active ? 'Приостановить' : 'Включить'}
          </Button>
        )}
      />

      {open && (
        <SidePanel title="Новая организация" onClose={() => setOpen(false)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Создаётся пустая база данных организации и её администратор. Администратор потом сам заводит сотрудников.
            </p>
            <FormRow label="Название организации" error={formState.errors.name?.message}>
              <Input {...register('name', { required: 'Укажите название' })} />
            </FormRow>
            <FormRow label="Имя администратора (необязательно)">
              <Input {...register('adminFullName')} />
            </FormRow>
            <FormRow label="Логин администратора" error={formState.errors.adminUsername?.message}>
              <Input {...register('adminUsername', { required: 'Укажите логин', minLength: { value: 3, message: 'Не короче 3 символов' } })} autoComplete="off" />
            </FormRow>
            <FormRow label="Пароль администратора" error={formState.errors.adminPassword?.message}>
              <Input
                type="text"
                {...register('adminPassword', { required: 'Укажите пароль', minLength: { value: 6, message: 'Не короче 6 символов' } })}
                autoComplete="off"
              />
            </FormRow>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={formState.isSubmitting}>
                Создать
              </Button>
            </div>
          </form>
        </SidePanel>
      )}

      {toggling && (
        <ConfirmDialog
          title={toggling.active ? 'Приостановить организацию?' : 'Включить организацию?'}
          message={
            toggling.active
              ? `Сотрудники «${toggling.name}» не смогут войти, пока вы не включите её снова. Данные не удаляются.`
              : `Сотрудники «${toggling.name}» снова смогут входить.`
          }
          onConfirm={onToggle}
          onCancel={() => setToggling(null)}
        />
      )}
    </div>
  );
}
