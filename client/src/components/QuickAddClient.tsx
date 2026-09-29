import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '@/api/client';
import { clientsHooks } from '@/api/modules';
import { Button } from '@/components/ui/button';
import { useToast } from '@/lib/toast';
import type { Client } from '@/types';
import { FormRow, Input } from './form';

/** Раздел 1 ТЗ: «клиента можно добавить прямо из формы продажи, не уходя со страницы». */
export function QuickAddClient({ onCreated }: { onCreated: (client: Client) => void }) {
  const { notify } = useToast();
  const create = clientsHooks.useCreate();
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, formState } = useForm<{ name: string; phone: string }>({
    defaultValues: { name: '', phone: '' },
  });

  if (!open) {
    return (
      <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setOpen(true)}>
        + Добавить нового клиента
      </Button>
    );
  }

  async function onSubmit(data: { name: string; phone: string }) {
    try {
      const client = (await create.mutateAsync({ name: data.name, phone: data.phone || null })) as Client;
      notify('Клиент добавлен');
      onCreated(client);
      reset({ name: '', phone: '' });
      setOpen(false);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  return (
    <div className="space-y-2 rounded-md border bg-muted p-3">
      <FormRow label="Имя нового клиента" error={formState.errors.name?.message}>
        <Input autoFocus {...register('name', { required: 'Укажите имя' })} />
      </FormRow>
      <FormRow label="Телефон (необязательно)">
        <Input {...register('phone')} placeholder="+998 90 123 45 67" />
      </FormRow>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
          Отмена
        </Button>
        <Button type="button" size="sm" onClick={handleSubmit(onSubmit)} disabled={formState.isSubmitting}>
          Добавить
        </Button>
      </div>
    </div>
  );
}
