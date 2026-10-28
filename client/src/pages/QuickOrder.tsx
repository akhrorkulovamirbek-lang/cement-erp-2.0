import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, buildQuery } from '@/api/client';
import { cementMarksHooks, clientsHooks, factoriesHooks, machinesHooks, ticketsHooks, useSubmitQuickOrder, useSuggestions, zavodyHooks } from '@/api/modules';
import { ButtonGroup } from '@/components/ButtonGroup';
import { PlainSelect } from '@/components/form';
import { PageHeader } from '@/components/PageHeader';
import { SuggestInput } from '@/components/SuggestInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PACKAGING_LABELS, PACKAGING_OPTIONS } from '@/lib/constants';
import { formatMoney, formatNumber } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { Sale } from '@/types';

type Form = Record<string, string>;
type Opt = { value: string; label: string };

const TYPE_OPTIONS: Opt[] = [
  { value: 'CEMENT', label: 'Со склада' },
  { value: 'TICKET', label: 'Из тикета' },
  { value: 'DIRECT', label: 'Напрямую' },
  { value: 'LOGISTICS', label: 'Логистика' },
];

const DRAFT_KEY = 'quickOrder.draft';
const RECENT_KEY = 'quickOrder.recentClients';
const typeButtons = 'w-full !grid grid-cols-2 [&>button]:h-12 [&>button]:text-base';
const wide = 'w-full flex-nowrap [&>button]:h-12 [&>button]:flex-1 [&>button]:px-2 [&>button]:text-base [&>button]:whitespace-nowrap';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* память браузера может быть недоступна — форма работает и без неё */
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, invalid, children, hint }: { label: string; invalid?: boolean; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className={cn('text-sm font-medium', invalid && 'text-destructive')}>
        {label}
        {invalid && <span className="ml-1.5 font-normal">— заполните</span>}
      </div>
      <div className={cn(invalid && 'rounded-lg ring-2 ring-destructive/60')}>{children}</div>
      {hint}
    </div>
  );
}

/** Короткий список — крупные кнопки (одно нажатие), длинный — выпадающий список с поиском. */
function Pick({ value, onChange, options, placeholder, maxChips = 6 }: { value: string; onChange: (v: string) => void; options: Opt[]; placeholder: string; maxChips?: number }) {
  if (options.length > maxChips) {
    return <PlainSelect value={value} onValueChange={onChange} options={options} placeholder={placeholder} className="h-12 w-full text-base" />;
  }
  if (options.length === 0) return <p className="text-sm text-muted-foreground">Список пуст — добавьте в «Контрагентах»</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-12 rounded-lg border px-4 text-base transition-colors active:scale-[0.98]',
            value === o.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const digits = (s: string) => s.replace(/[^\d]/g, '');
const spaced = (s: string) => (s ? Number(s).toLocaleString('ru-RU') : '');
const toNum = (s: string | undefined) => (s ? Number(s.replace(/\s/g, '').replace(',', '.')) : 0);

/** «Быстрая заявка» — одна форма на весь экран телефона. Заявка уходит оператору на подтверждение
 * (то же, что делает Телеграм-бот), в продажи попадает только после его «Подтвердить». */
export function QuickOrder() {
  return <QuickOrderForm />;
}

/** Сама форма заявки. На странице «Быстрая заявка» её заполняет менеджер (embedded = false); в разделе «Заявки»
 * оператор открывает ту же форму, чтобы исправить или дописать заявку перед подтверждением (embedded = true). */
export function QuickOrderForm({
  initial,
  embedded = false,
  onSave,
}: {
  initial?: Form;
  embedded?: boolean;
  onSave?: (body: Record<string, unknown>) => Promise<void>;
}) {
  const { notify } = useToast();
  const submit = useSubmitQuickOrder();
  const clients = clientsHooks.useList();
  const zavody = zavodyHooks.useList();
  const factories = factoriesHooks.useList();
  const marks = cementMarksHooks.useList();
  const machines = machinesHooks.useList();
  const suggestions = useSuggestions();
  const tickets = ticketsHooks.useList({ status: 'active' });

  const [f, setF] = useState<Form>(() => initial ?? load<Form>(DRAFT_KEY, { sale_type: 'CEMENT', vehicle_type: 'CLIENT' }));
  const [recent, setRecent] = useState<string[]>(() => load<string[]>(RECENT_KEY, []));
  const [sentId, setSentId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const set = (k: string) => (v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors.has(k)) setErrors((p) => new Set([...p].filter((x) => x !== k)));
  };
  useEffect(() => {
    if (!embedded) save(DRAFT_KEY, f);
  }, [f, embedded]);

  const type = f.sale_type ?? 'CEMENT';
  const isTicket = type === 'TICKET';
  const isCement = type === 'CEMENT' || type === 'DIRECT';
  const sellsCement = type !== 'LOGISTICS';
  const selectedTicket = isTicket ? (tickets.data ?? []).find((x) => String(x.id) === f.ticket_id) : undefined;
  const vehicle = f.vehicle_type ?? 'CLIENT';
  const opts = (rows: { id: number; name?: string; number?: string }[] | undefined): Opt[] =>
    (rows ?? []).map((r) => ({ value: String(r.id), label: r.name ?? r.number ?? '' }));

  // Если вариант всего один (один поставщик, одна марка…), выбирать нечего — ставим сразу.
  useEffect(() => {
    const single: [string, { id: number }[] | undefined][] = [
      ['zavod_id', zavody.data],
      ['factory_id', factories.data],
      ['cement_mark_id', marks.data],
    ];
    setF((p) => {
      let next = p;
      for (const [k, rows] of single) {
        if (rows?.length === 1 && !p[k]) next = { ...next, [k]: String(rows[0].id) };
      }
      return next;
    });
  }, [zavody.data, factories.data, marks.data]);

  // Прошлая цена этому клиенту на эту марку — подставляем сами, чтобы не вводить заново.
  const clientSales = useQuery({
    queryKey: ['quick-client-sales', f.client_id],
    queryFn: () => api.get<Sale[]>(`/sales${buildQuery({ client_id: f.client_id })}`),
    enabled: Boolean(f.client_id) && (type === 'CEMENT' || isTicket),
    staleTime: 60_000,
  });
  const lastPrice = useMemo(() => {
    const cement = (clientSales.data ?? []).filter((s) => s.sale_type === 'CEMENT' && Number(s.price_per_ton) > 0);
    const markId = isTicket ? String(selectedTicket?.cement_mark_id ?? '') : f.cement_mark_id;
    const sameMark = cement.find((s) => String(s.cement_mark_id) === markId);
    return Number((sameMark ?? cement[0])?.price_per_ton ?? 0) || null;
  }, [clientSales.data, f.cement_mark_id, isTicket, selectedTicket?.cement_mark_id]);
  const autofilled = useRef('');
  useEffect(() => {
    const key = `${f.client_id}|${f.cement_mark_id}|${f.ticket_id}`;
    if (!embedded && (type === 'CEMENT' || isTicket) && lastPrice && !f.price_per_ton && autofilled.current !== key) {
      autofilled.current = key;
      setF((p) => ({ ...p, price_per_ton: String(Math.round(lastPrice)) }));
    }
  }, [lastPrice, type, isTicket, f.client_id, f.cement_mark_id, f.ticket_id, f.price_per_ton]);

  // Завод у тикета обычно уже записан — подставляем; у старых тикетов его нет, тогда менеджер выбирает сам.
  useEffect(() => {
    if (selectedTicket) setF((p) => (p.factory_id === String(selectedTicket.factory_id ?? '') ? p : { ...p, factory_id: String(selectedTicket.factory_id ?? '') }));
  }, [selectedTicket?.id, selectedTicket?.factory_id]);

  function changeType(v: string) {
    // У логистики не бывает «машины клиента».
    setF((p) => ({ ...p, sale_type: v, vehicle_type: v === 'LOGISTICS' && p.vehicle_type === 'CLIENT' ? 'OWN' : (p.vehicle_type ?? 'CLIENT') }));
    setErrors(new Set());
  }

  const recentClients = recent
    .map((id) => (clients.data ?? []).find((c) => String(c.id) === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .slice(0, 5);

  // Что обязательно для выбранного типа — по тем же правилам, что и на сервере.
  function required(): [string, string][] {
    const r: [string, string][] = [['client_id', 'Клиент']];
    if (isTicket) r.push(['ticket_id', 'Тикет']);
    if (isTicket && selectedTicket && !selectedTicket.factory_id) r.push(['factory_id', 'Завод']);
    if (isCement) r.push(['zavod_id', 'Поставщик'], ['factory_id', 'Завод'], ['cement_mark_id', 'Марка'], ['packaging', 'Упаковка']);
    r.push(['tonnage', 'Тоннаж']);
    if (type === 'CEMENT' || isTicket) r.push(['price_per_ton', 'Цена продажи']);
    if (type === 'DIRECT') r.push(['price_per_ton', 'Цена закупки'], ['sale_price_per_ton', 'Цена продажи']);
    if (vehicle === 'OWN') r.push(['own_vehicle_id', 'Своя машина'], ['freight_price_per_ton', 'Цена перевозки']);
    if (vehicle === 'CLIENT') r.push(['machine_number', 'Номер машины']);
    if (vehicle === 'HIRED') r.push(['machine_number', 'Номер машины'], ['carrier_name', 'Перевозчик'], ['freight_price_per_ton', 'Цена перевозки'], ['hire_price_per_ton', 'Цена найма']);
    return r;
  }

  const t = toNum(f.tonnage);
  const freightTotal = vehicle === 'CLIENT' ? 0 : t * toNum(f.freight_price_per_ton);
  const total =
    type === 'CEMENT' || isTicket ? t * toNum(f.price_per_ton) + freightTotal : type === 'DIRECT' ? t * toNum(f.sale_price_per_ton) + freightTotal : freightTotal;
  const margin =
    isTicket && selectedTicket
      ? t * (toNum(f.price_per_ton) - Number(selectedTicket.price_per_ton))
      : type === 'DIRECT'
      ? t * (toNum(f.sale_price_per_ton) - toNum(f.price_per_ton))
      : type === 'LOGISTICS' && vehicle === 'HIRED'
        ? t * (toNum(f.freight_price_per_ton) - toNum(f.hire_price_per_ton))
        : null;

  async function onSend() {
    // Менеджер может отправить и неполную заявку — оператор допишет. Хоть что-то указать нужно: клиента или комментарий.
    if (!onSave) {
      if (!f.client_id && !f.comment?.trim()) {
        setErrors(new Set(['client_id']));
        notify('Укажите хотя бы клиента или напишите комментарий', 'error');
        return;
      }
      const missing = required().filter(([k]) => !f[k] || (toNum(f[k]) === 0 && /tonnage|price/.test(k)));
      if (missing.length > 0) {
        setErrors(new Set(missing.map(([k]) => k)));
        if (!window.confirm(`Не заполнено: ${missing.map(([, l]) => l).join(', ')}.\n\nОтправить заявку оператору как есть? Он сможет дописать недостающее.`)) return;
      }
    }
    const n = (k: string) => (f[k] ? toNum(f[k]) : null);
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
    if (isTicket) Object.assign(body, { ticket_id: n('ticket_id'), factory_id: n('factory_id'), price_per_ton: n('price_per_ton') });
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
      if (onSave) {
        await onSave(body);
        return;
      }
      const r = await submit.mutateAsync(body);
      setSentId(r.id);
      const nextRecent = [f.client_id, ...recent.filter((x) => x !== f.client_id)].slice(0, 8);
      setRecent(nextRecent);
      save(RECENT_KEY, nextRecent);
      // Повторные заказы похожи: товар, завод и тип машины оставляем, а клиента, тонны, цены и номер машины чистим.
      setF({
        sale_type: type,
        vehicle_type: vehicle,
        zavod_id: f.zavod_id ?? '',
        factory_id: f.factory_id ?? '',
        cement_mark_id: f.cement_mark_id ?? '',
        packaging: f.packaging ?? '',
        ticket_id: f.ticket_id ?? '',
      });
      autofilled.current = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Не удалось отправить заявку', 'error');
    }
  }

  const money = (k: string, label: string, hint?: ReactNode) => (
    <Field label={label} invalid={errors.has(k)} hint={hint}>
      <Input
        value={spaced(f[k] ?? '')}
        onChange={(e) => set(k)(digits(e.target.value))}
        inputMode="numeric"
        enterKeyHint="next"
        className="h-12 text-base tabular-nums"
        placeholder="0"
      />
    </Field>
  );

  const priceHint =
    (type === 'CEMENT' || isTicket) && lastPrice && Math.round(lastPrice) !== toNum(f.price_per_ton) ? (
      <button type="button" onClick={() => set('price_per_ton')(String(Math.round(lastPrice)))} className="text-xs text-primary">
        В прошлый раз этому клиенту: {formatMoney(lastPrice)} — нажмите, чтобы подставить
      </button>
    ) : null;

  return (
    <div className={embedded ? 'space-y-4 pb-2' : 'mx-auto max-w-lg space-y-4 pb-36 md:pb-6'}>
      {!embedded && <PageHeader title="Быстрая заявка" subtitle="Заполните и отправьте оператору на подтверждение. Можно отправить и неполную — оператор допишет." />}

      {!embedded && sentId && (
        <div className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm">
          Заявка №{sentId} отправлена оператору. Товар и машина остались — можно сразу оформить следующую.{' '}
          <Link to="/requests" className="text-primary hover:underline">
            Все заявки
          </Link>
        </div>
      )}

      <ButtonGroup value={type} onChange={changeType} options={TYPE_OPTIONS} className={typeButtons} />

      <Section title="Кому">
        {!embedded && recentClients.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {recentClients.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => set('client_id')(String(c.id))}
                className={cn(
                  'min-h-10 rounded-full border px-3 text-sm',
                  f.client_id === String(c.id) ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        <Field label="Клиент" invalid={errors.has('client_id')}>
          <PlainSelect value={f.client_id ?? ''} onValueChange={set('client_id')} options={opts(clients.data)} placeholder="Найти клиента…" className="h-12 w-full text-base" />
        </Field>
      </Section>

      {isTicket && (
        <Section title="Тикет">
          <Field label="Выберите тикет" invalid={errors.has('ticket_id')}>
            <Pick
              value={f.ticket_id ?? ''}
              onChange={set('ticket_id')}
              options={(tickets.data ?? []).map((x) => ({
                value: String(x.id),
                label: `№${x.ticket_number} · ${x.cement_mark_name} · ${formatNumber(x.remaining_tonnage, 1)} т`,
              }))}
              placeholder="Выберите тикет"
              maxChips={8}
            />
          </Field>
          {selectedTicket && (
            <p className="text-sm text-muted-foreground">
              {selectedTicket.factory_name ?? selectedTicket.zavod_name} · {PACKAGING_LABELS[selectedTicket.packaging]} · остаток {formatNumber(selectedTicket.remaining_tonnage, 3)} т · цена покупки{' '}
              {formatMoney(selectedTicket.price_per_ton)}/т
            </p>
          )}
          {selectedTicket && !selectedTicket.factory_id && (
            <Field label="Завод (у тикета не указан)" invalid={errors.has('factory_id')}>
              <Pick value={f.factory_id ?? ''} onChange={set('factory_id')} options={opts(factories.data)} placeholder="Выберите завод" />
            </Field>
          )}
          {(tickets.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Активных тикетов нет.</p>}
        </Section>
      )}

      {isCement && (
        <Section title="Цемент">
          <Field label="Поставщик" invalid={errors.has('zavod_id')}>
            <Pick value={f.zavod_id ?? ''} onChange={set('zavod_id')} options={opts(zavody.data)} placeholder="Выберите поставщика" />
          </Field>
          <Field label="Завод" invalid={errors.has('factory_id')}>
            <Pick value={f.factory_id ?? ''} onChange={set('factory_id')} options={opts(factories.data)} placeholder="Выберите завод" />
          </Field>
          <Field label="Марка" invalid={errors.has('cement_mark_id')}>
            <Pick value={f.cement_mark_id ?? ''} onChange={set('cement_mark_id')} options={opts(marks.data)} placeholder="Выберите марку" maxChips={30} />
          </Field>
          <Field label="Упаковка" invalid={errors.has('packaging')}>
            <ButtonGroup value={f.packaging ?? ''} onChange={set('packaging')} options={PACKAGING_OPTIONS} className={wide} />
          </Field>
        </Section>
      )}

      <Section title="Количество и цена">
        <Field label="Тоннаж, т" invalid={errors.has('tonnage')}>
          <Input
            value={f.tonnage ?? ''}
            onChange={(e) => set('tonnage')(e.target.value.replace(/[^\d.,]/g, ''))}
            inputMode="decimal"
            enterKeyHint="next"
            className="h-12 text-base tabular-nums"
            placeholder="0"
          />
        </Field>
        {(type === 'CEMENT' || isTicket) && money('price_per_ton', 'Цена продажи за тонну, сум', priceHint)}
        {type === 'DIRECT' && (
          <>
            {money('price_per_ton', 'Цена закупки у поставщика за тонну, сум')}
            {money('sale_price_per_ton', 'Цена продажи клиенту за тонну, сум')}
          </>
        )}
      </Section>

      <Section title="Машина">
        <ButtonGroup
          value={vehicle}
          onChange={set('vehicle_type')}
          options={[...(sellsCement ? [{ value: 'CLIENT', label: 'Клиента' }] : []), { value: 'OWN', label: 'Своя' }, { value: 'HIRED', label: 'Наёмная' }]}
          className={wide}
        />
        {vehicle === 'OWN' && (
          <Field label="Своя машина" invalid={errors.has('own_vehicle_id')}>
            <Pick value={f.own_vehicle_id ?? ''} onChange={set('own_vehicle_id')} options={opts(machines.data)} placeholder="Выберите машину" />
          </Field>
        )}
        {(vehicle === 'CLIENT' || vehicle === 'HIRED') && (
          <Field label="Номер машины" invalid={errors.has('machine_number')}>
            <SuggestInput
              options={suggestions.data?.plates ?? []}
              value={f.machine_number ?? ''}
              onChange={(e) => set('machine_number')(e.target.value.toUpperCase())}
              className="h-12 text-base uppercase"
              placeholder="01A123AA"
              autoCapitalize="characters"
              enterKeyHint="next"
            />
          </Field>
        )}
        {vehicle === 'HIRED' && (
          <Field label="Перевозчик" invalid={errors.has('carrier_name')}>
            <SuggestInput
              options={suggestions.data?.carriers ?? []}
              value={f.carrier_name ?? ''}
              onChange={(e) => set('carrier_name')(e.target.value)}
              className="h-12 text-base"
              enterKeyHint="next"
            />
          </Field>
        )}
        {vehicle !== 'CLIENT' && money('freight_price_per_ton', 'Цена перевозки за тонну, сум')}
        {vehicle === 'HIRED' && money('hire_price_per_ton', 'Цена найма за тонну, сум')}
      </Section>

      <Field label="Комментарий (необязательно)">
        <Input value={f.comment ?? ''} onChange={(e) => set('comment')(e.target.value)} className="h-12 text-base" />
      </Field>

      <div
        className={
          embedded
            ? 'sticky bottom-0 z-10 space-y-2 border-t bg-background py-3'
            : 'fixed inset-x-0 bottom-16 z-30 space-y-2 border-t bg-background p-3 md:static md:border-0 md:bg-transparent md:p-0'
        }
      >
        {total > 0 && (
          <div className="flex items-baseline justify-between px-1 text-sm">
            <span className="text-muted-foreground">
              Сумма заявки{t > 0 ? ` · ${formatNumber(t, 2)} т` : ''}
              {margin !== null && margin !== 0 && (
                <span className={margin > 0 ? 'ml-2 text-emerald-600' : 'ml-2 text-destructive'}>маржа {formatMoney(margin)}</span>
              )}
            </span>
            <span className="text-base font-semibold tabular-nums">{formatMoney(total)}</span>
          </div>
        )}
        <Button className="h-12 w-full text-base" onClick={onSend} disabled={submit.isPending}>
          {submit.isPending ? 'Отправляю…' : embedded ? 'Сохранить изменения' : 'Отправить оператору'}
        </Button>
      </div>
    </div>
  );
}
