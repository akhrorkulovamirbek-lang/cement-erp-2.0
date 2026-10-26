import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { cementMarksHooks, clientsHooks, factoriesHooks, machinesHooks, useSubmitQuickOrder, zavodyHooks } from '@/api/modules';
import { ButtonGroup } from '@/components/ButtonGroup';
import { PlainSelect } from '@/components/form';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PACKAGING_OPTIONS } from '@/lib/constants';
import { useToast } from '@/lib/toast';

type Form = Record<string, string>;

const TYPE_OPTIONS = [
  { value: 'CEMENT', label: 'Со склада' },
  { value: 'DIRECT', label: 'Напрямую' },
  { value: 'LOGISTICS', label: 'Логистика' },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium">{label}</div>
      {children}
    </div>
  );
}

/** «Быстрая заявка» — одна форма на весь экран телефона. Заявка уходит оператору на подтверждение
 * (то же, что делает Телеграм-бот), в продажи попадает только после его «Подтвердить». */
export function QuickOrder() {
  const { notify } = useToast();
  const submit = useSubmitQuickOrder();
  const clients = clientsHooks.useList();
  const zavody = zavodyHooks.useList();
  const factories = factoriesHooks.useList();
  const marks = cementMarksHooks.useList();
  const machines = machinesHooks.useList();

  const [f, setF] = useState<Form>({ sale_type: 'CEMENT', vehicle_type: 'CLIENT' });
  const [sentId, setSentId] = useState<number | null>(null);
  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const txt = (k: string) => ({ value: f[k] ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k)(e.target.value) });
  const num = (k: string) => ({ ...txt(k), inputMode: 'decimal' as const, className: 'h-12 text-base' });
  // Короткие списки — обычные выпадающие, там нужна подпись «выберите», иначе поле выглядит пустым.
  const opts = (rows: { id: number; name?: string; number?: string }[] | undefined) => {
    const list = (rows ?? []).map((r) => ({ value: String(r.id), label: r.name ?? r.number ?? '' }));
    return list.length <= 6 ? [{ value: '', label: '— выберите —' }, ...list] : list;
  };
  const sel = 'h-12 w-full text-base';

  const type = f.sale_type;
  const isCement = type !== 'LOGISTICS';
  const vehicle = f.vehicle_type;

  function changeType(v: string) {
    // У логистики не бывает «машины клиента».
    setF((p) => ({ ...p, sale_type: v, vehicle_type: v === 'LOGISTICS' && p.vehicle_type === 'CLIENT' ? 'OWN' : p.vehicle_type }));
  }

  async function onSend() {
    const n = (k: string) => (f[k] ? Number(f[k].replace(/\s/g, '').replace(',', '.')) : null);
    const body: Record<string, unknown> = {
      sale_type: type,
      client_id: n('client_id'),
      tonnage: n('tonnage'),
      vehicle_type: vehicle,
      comment: f.comment?.trim() || null,
      machine_number: f.machine_number?.trim() || null,
      own_vehicle_id: n('own_vehicle_id'),
      carrier_name: f.carrier_name?.trim() || null,
      freight_price_per_ton: n('freight_price_per_ton'),
      hire_price_per_ton: n('hire_price_per_ton'),
    };
    if (isCement) {
      Object.assign(body, {
        zavod_id: n('zavod_id'),
        factory_id: n('factory_id'),
        cement_mark_id: n('cement_mark_id'),
        packaging: f.packaging || null,
        price_per_ton: n('price_per_ton'),
        sale_price_per_ton: n('sale_price_per_ton'),
      });
    }
    try {
      const r = await submit.mutateAsync(body);
      setSentId(r.id);
      setF({ sale_type: type, vehicle_type: type === 'LOGISTICS' ? 'OWN' : 'CLIENT' });
      window.scrollTo({ top: 0 });
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Не удалось отправить заявку', 'error');
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-24">
      <PageHeader title="Быстрая заявка" subtitle="Заполните и отправьте оператору на подтверждение" />

      {sentId && (
        <div className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm">
          Заявка №{sentId} отправлена оператору. Ниже можно оформить следующую.{' '}
          <Link to="/requests" className="text-primary hover:underline">
            Все заявки
          </Link>
        </div>
      )}

      <Field label="Что продаём">
        <ButtonGroup value={type} onChange={changeType} options={TYPE_OPTIONS} className="w-full [&>button]:h-11 [&>button]:flex-1" />
      </Field>

      <Field label="Клиент">
        <PlainSelect value={f.client_id ?? ''} onValueChange={set('client_id')} options={opts(clients.data)} placeholder="Выберите клиента" className={sel} />
      </Field>

      {isCement && (
        <>
          <Field label="Поставщик">
            <PlainSelect value={f.zavod_id ?? ''} onValueChange={set('zavod_id')} options={opts(zavody.data)} placeholder="Выберите поставщика" className={sel} />
          </Field>
          <Field label="Завод">
            <PlainSelect value={f.factory_id ?? ''} onValueChange={set('factory_id')} options={opts(factories.data)} placeholder="Выберите завод" className={sel} />
          </Field>
          <Field label="Марка цемента">
            <PlainSelect value={f.cement_mark_id ?? ''} onValueChange={set('cement_mark_id')} options={opts(marks.data)} placeholder="Выберите марку" className={sel} />
          </Field>
          <Field label="Упаковка">
            <ButtonGroup value={f.packaging ?? ''} onChange={set('packaging')} options={PACKAGING_OPTIONS} className="w-full [&>button]:h-11 [&>button]:flex-1" />
          </Field>
        </>
      )}

      <Field label="Тоннаж, т">
        <Input {...num('tonnage')} placeholder="например 25" />
      </Field>

      {type === 'CEMENT' && (
        <Field label="Цена продажи за тонну, сум">
          <Input {...num('price_per_ton')} placeholder="например 650000" />
        </Field>
      )}
      {type === 'DIRECT' && (
        <>
          <Field label="Цена закупки у поставщика за тонну, сум">
            <Input {...num('price_per_ton')} />
          </Field>
          <Field label="Цена продажи клиенту за тонну, сум">
            <Input {...num('sale_price_per_ton')} />
          </Field>
        </>
      )}

      <Field label="Машина">
        <ButtonGroup
          value={vehicle}
          onChange={set('vehicle_type')}
          options={[
            ...(isCement ? [{ value: 'CLIENT', label: 'Клиента' }] : []),
            { value: 'OWN', label: 'Своя' },
            { value: 'HIRED', label: 'Наёмная' },
          ]}
          className="w-full [&>button]:h-11 [&>button]:flex-1"
        />
      </Field>
      {vehicle === 'OWN' && (
        <Field label="Своя машина">
          <PlainSelect value={f.own_vehicle_id ?? ''} onValueChange={set('own_vehicle_id')} options={opts(machines.data)} placeholder="Выберите машину" className={sel} />
        </Field>
      )}
      {(vehicle === 'CLIENT' || vehicle === 'HIRED') && (
        <Field label="Номер машины">
          <Input {...txt('machine_number')} className="h-12 text-base uppercase" placeholder="01A123AA" autoCapitalize="characters" />
        </Field>
      )}
      {vehicle === 'HIRED' && (
        <Field label="Перевозчик">
          <Input {...txt('carrier_name')} className="h-12 text-base" />
        </Field>
      )}
      {vehicle !== 'CLIENT' && (
        <Field label="Цена перевозки за тонну, сум">
          <Input {...num('freight_price_per_ton')} />
        </Field>
      )}
      {vehicle === 'HIRED' && (
        <Field label="Цена найма за тонну, сум">
          <Input {...num('hire_price_per_ton')} />
        </Field>
      )}

      <Field label="Комментарий (необязательно)">
        <Input {...txt('comment')} className="h-12 text-base" />
      </Field>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-background p-3 md:static md:border-0 md:bg-transparent md:p-0">
        <Button className="h-12 w-full text-base" onClick={onSend} disabled={submit.isPending}>
          {submit.isPending ? 'Отправляю…' : 'Отправить оператору'}
        </Button>
      </div>
    </div>
  );
}
