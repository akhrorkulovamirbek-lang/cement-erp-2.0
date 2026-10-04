import { useEffect, useState } from 'react';
import { ApiError } from '@/api/client';
import {
  clientsHooks,
  useAppSettings,
  useImportCash,
  useImportIncoming,
  useImportSales,
  useImportWarehouseSnapshot,
  useModuleSettings,
  usePermissionMatrix,
  useSetPermission,
  useToggleModule,
  useUpdateAppSettings,
  zavodyHooks,
} from '@/api/modules';
import { FileImport } from '@/components/FileImport';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { Users } from './Users';

export function Settings() {
  return (
    <div>
      <PageHeader title="Настройки" subtitle="Модули, права ролей, пользователи и общие параметры системы" />
      <Tabs defaultValue="modules">
        <TabsList>
          <TabsTrigger value="modules">Модули</TabsTrigger>
          <TabsTrigger value="permissions">Права ролей</TabsTrigger>
          <TabsTrigger value="users">Пользователи</TabsTrigger>
          <TabsTrigger value="general">Общие</TabsTrigger>
          <TabsTrigger value="import">Импорт данных</TabsTrigger>
        </TabsList>
        <TabsContent value="modules" className="mt-4">
          <ModulesTab />
        </TabsContent>
        <TabsContent value="permissions" className="mt-4">
          <PermissionsTab />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <Users />
        </TabsContent>
        <TabsContent value="general" className="mt-4">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="import" className="mt-4">
          <ImportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ModulesTab() {
  const { notify } = useToast();
  const modules = useModuleSettings();
  const toggle = useToggleModule();

  async function onToggle(code: string, enabled: boolean) {
    try {
      await toggle.mutateAsync({ code, enabled });
      notify(enabled ? 'Модуль включён' : 'Модуль выключен');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  return (
    <div className="space-y-3">
      {(modules.data ?? []).map((m) => (
        <Card key={m.code}>
          <CardContent className="flex items-start justify-between gap-4 p-4">
            <div>
              <div className="font-medium">{m.name}</div>
              <p className="mt-0.5 text-sm text-muted-foreground">{m.description}</p>
              {!m.enabled && <p className="mt-1 text-xs text-muted-foreground">При выключении: {m.whenDisabled}</p>}
            </div>
            <Switch checked={m.enabled} onCheckedChange={(v) => onToggle(m.code, v)} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PermissionsTab() {
  const { notify } = useToast();
  const matrix = usePermissionMatrix();
  const setPermission = useSetPermission();

  async function onChange(role: string, resourceCode: string, allowed: boolean) {
    try {
      await setPermission.mutateAsync({ role, resourceCode, allowed });
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="p-3 text-left font-medium">Раздел</th>
            {(matrix.data ?? []).map((row) => (
              <th key={row.role} className="p-3 text-center font-medium">
                {row.roleLabel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(matrix.data?.[0]?.resources ?? []).map((res, i) => (
            <tr key={res.resourceCode} className="border-b last:border-0">
              <td className="p-3">{res.resourceLabel}</td>
              {(matrix.data ?? []).map((row) => (
                <td key={row.role} className="p-3 text-center">
                  <Checkbox
                    checked={row.resources[i].allowed}
                    disabled={row.role === 'admin'}
                    onCheckedChange={(v) => onChange(row.role, res.resourceCode, v === true)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-3 text-xs text-muted-foreground">У администратора права ограничить нельзя.</p>
    </div>
  );
}

function GeneralTab() {
  const { notify } = useToast();
  const settings = useAppSettings();
  const update = useUpdateAppSettings();
  const [sessionMinutes, setSessionMinutes] = useState('720');
  const [commissionPercent, setCommissionPercent] = useState('');

  useEffect(() => {
    if (settings.data?.session_timeout_minutes) setSessionMinutes(settings.data.session_timeout_minutes);
  }, [settings.data?.session_timeout_minutes]);

  useEffect(() => {
    if (settings.data?.cash_service_default_commission_percent) {
      setCommissionPercent(settings.data.cash_service_default_commission_percent);
    }
  }, [settings.data?.cash_service_default_commission_percent]);

  const brokerAllowNegative = settings.data?.broker_allow_negative === 'true';

  async function saveSessionMinutes() {
    try {
      await update.mutateAsync({ session_timeout_minutes: Number(sessionMinutes) });
      notify('Сохранено');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  async function onToggleBrokerNegative(v: boolean) {
    try {
      await update.mutateAsync({ broker_allow_negative: v });
      notify('Сохранено');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  async function saveCommissionPercent() {
    try {
      await update.mutateAsync({ cash_service_default_commission_percent: Number(commissionPercent || 0) });
      notify('Сохранено');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="font-medium">Время сессии</div>
          <p className="mt-0.5 mb-3 text-sm text-muted-foreground">
            Сессия завершается после стольких минут без активности.
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={5}
              max={10080}
              value={sessionMinutes}
              onChange={(e) => setSessionMinutes(e.target.value)}
              className="w-32"
            />
            <Button variant="outline" onClick={saveSessionMinutes}>
              Сохранить
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-start justify-between gap-4 p-4">
          <div>
            <div className="font-medium">Разрешить минус на брокерском счёте</div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Если выключено, покупка тикета на сумму больше баланса блокируется предупреждением.
            </p>
          </div>
          <Switch checked={brokerAllowNegative} onCheckedChange={onToggleBrokerNegative} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="font-medium">Комиссия обналичивания по умолчанию</div>
          <p className="mt-0.5 mb-3 text-sm text-muted-foreground">
            Подставляется в новую операцию в разделе «Обналичивание», можно изменить на каждой операции отдельно.
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(e.target.value)}
              className="w-32"
              placeholder="например 2"
            />
            <span className="text-sm text-muted-foreground">%</span>
            <Button variant="outline" onClick={saveCommissionPercent}>
              Сохранить
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Импорт данных --------------------------------------------------------
// Раздел «Импорт данных»: загрузка .xlsx/.csv для больших объёмов исторических данных —
// см. server/src/modules/import. Приход/Продажи — только история и долги, текущий остаток
// склада не трогают (is_historical=true исключает их из recomputeWarehouseBalance); чтобы
// задать текущий остаток, используется отдельный блок «Остаток склада» снимком.

function toNumber(v: string | undefined): number | null {
  if (!v) return null;
  const cleaned = v.replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

const PACKAGING_REVERSE: Record<string, 'MESHOK' | 'NAVAL'> = { мешок: 'MESHOK', навал: 'NAVAL' };
function toPackaging(v: string): 'MESHOK' | 'NAVAL' | null {
  return PACKAGING_REVERSE[v.trim().toLowerCase()] ?? null;
}

const SALE_TYPE_REVERSE: Record<string, 'CEMENT' | 'LOGISTICS'> = { цемент: 'CEMENT', логистика: 'LOGISTICS' };
const VEHICLE_REVERSE: Record<string, 'CLIENT' | 'OWN' | 'HIRED'> = {
  клиент: 'CLIENT',
  своя: 'OWN',
  наёмная: 'HIRED',
  наемная: 'HIRED',
};
const CASH_TYPE_REVERSE: Record<string, 'income' | 'expense'> = { приход: 'income', расход: 'expense' };
const CURRENCY_REVERSE: Record<string, 'UZS' | 'USD'> = {
  сум: 'UZS',
  сумы: 'UZS',
  uzs: 'UZS',
  usd: 'USD',
  доллар: 'USD',
  доллары: 'USD',
  $: 'USD',
};
const PAYMENT_TYPES = ['перечисление', 'наличка', 'карта'];
const CASH_INCOME_CATEGORIES = ['цемент', 'логистика', 'возврат_биржи', 'прочее'];
const CASH_EXPENSE_CATEGORIES = ['цемент', 'логистика', 'перевозчик', 'прочее'];

const CLIENT_HEADERS = ['Имя', 'Телефон', 'Контактное лицо', 'ИНН', 'Начальный долг', 'Комментарий'] as const;
const ZAVOD_HEADERS = ['Название', 'Регион', 'Телефон', 'Начальный долг'] as const;
const INCOMING_HEADERS = ['Дата', 'Завод', 'Марка', 'Упаковка', 'Тоннаж', 'Цена за тонну', 'Номер машины', 'Комментарий'] as const;
const SALE_HEADERS = [
  'Дата',
  'Тип',
  'Клиент',
  'Завод',
  'Марка',
  'Упаковка',
  'Тоннаж',
  'Цена за тонну',
  'Тип машины',
  'Номер машины',
  'Перевозчик',
  'Цена перевозки/т',
  'Цена найма/т',
  'Комментарий',
] as const;
const CASH_HEADERS = [
  'Дата',
  'Тип',
  'Категория',
  'Клиент',
  'Завод',
  'Перевозчик',
  'Сумма',
  'Валюта',
  'Курс доллара',
  'Способ оплаты',
  'Комментарий',
] as const;
const SNAPSHOT_HEADERS = ['Завод', 'Марка', 'Упаковка', 'Тоннаж', 'Себестоимость за тонну'] as const;

function parseClientRow(raw: Record<string, string>) {
  const name = raw['Имя']?.trim();
  if (!name) return null;
  const debt = toNumber(raw['Начальный долг']) ?? 0;
  return {
    label: `${name}${debt ? ', долг ' + formatMoney(debt) : ''}`,
    payload: {
      name,
      phone: raw['Телефон']?.trim() || null,
      contact_person: raw['Контактное лицо']?.trim() || null,
      inn: raw['ИНН']?.trim() || null,
      initial_debt: debt,
      comment: raw['Комментарий']?.trim() || null,
      active: true,
    },
  };
}

function parseZavodRow(raw: Record<string, string>) {
  const name = raw['Название']?.trim();
  if (!name) return null;
  const debt = toNumber(raw['Начальный долг']) ?? 0;
  return {
    label: `${name}${debt ? ', долг ' + formatMoney(debt) : ''}`,
    payload: {
      name,
      region: raw['Регион']?.trim() || null,
      phone: raw['Телефон']?.trim() || null,
      initial_debt: debt,
      active: true,
    },
  };
}

function parseIncomingRow(raw: Record<string, string>) {
  const date = raw['Дата']?.trim();
  const zavod = raw['Завод']?.trim();
  const cement_mark = raw['Марка']?.trim();
  const packaging = toPackaging(raw['Упаковка'] ?? '');
  const tonnage = toNumber(raw['Тоннаж']);
  const price_per_ton = toNumber(raw['Цена за тонну']);
  if (!date || !zavod || !cement_mark || !packaging || !tonnage || !price_per_ton) return null;
  return {
    label: `${date}, ${zavod}, ${cement_mark}, ${tonnage} т`,
    payload: {
      date,
      zavod,
      cement_mark,
      packaging,
      tonnage,
      price_per_ton,
      machine_number: raw['Номер машины']?.trim() || null,
      comment: raw['Комментарий']?.trim() || null,
    },
  };
}

function parseSaleRow(raw: Record<string, string>) {
  const date = raw['Дата']?.trim();
  const saleType = SALE_TYPE_REVERSE[raw['Тип']?.trim().toLowerCase() ?? ''];
  const client = raw['Клиент']?.trim();
  const tonnage = toNumber(raw['Тоннаж']);
  if (!date || !saleType || !client || !tonnage) return null;

  const vehicleRaw = raw['Тип машины']?.trim().toLowerCase();
  const vehicle_type = vehicleRaw ? VEHICLE_REVERSE[vehicleRaw] : 'CLIENT';
  if (!vehicle_type) return null;

  // Цена перевозки/найма — часть суммы продажи (computeFreightTotal на бэкенде), не просто
  // справочная деталь: без неё строка «молча» импортировалась бы с заниженным total_sum
  // (ценой 0 за доставку), искажая долг клиента. Те же обязательные поля, что в обычной форме
  // Продажи (sales/schema.ts), см. superRefine в server/src/modules/import/schema.ts.
  let freight_price_per_ton: number | null = null;
  if (vehicle_type !== 'CLIENT') {
    freight_price_per_ton = toNumber(raw['Цена перевозки/т']);
    if (!freight_price_per_ton) return null;
  }
  let hire_price_per_ton: number | null = null;
  let carrier_name: string | null = null;
  if (vehicle_type === 'HIRED') {
    hire_price_per_ton = toNumber(raw['Цена найма/т']);
    if (!hire_price_per_ton) return null;
    carrier_name = raw['Перевозчик']?.trim() || null;
    if (!carrier_name) return null;
  }

  const payload: Record<string, unknown> = {
    date,
    sale_type: saleType,
    client,
    vehicle_type,
    tonnage,
    machine_number: raw['Номер машины']?.trim() || null,
    carrier_name,
    freight_price_per_ton,
    hire_price_per_ton,
    comment: raw['Комментарий']?.trim() || null,
  };

  if (saleType === 'CEMENT') {
    const zavod = raw['Завод']?.trim();
    const cement_mark = raw['Марка']?.trim();
    const packaging = toPackaging(raw['Упаковка'] ?? '');
    const price_per_ton = toNumber(raw['Цена за тонну']);
    if (!zavod || !cement_mark || !packaging || !price_per_ton) return null;
    payload.zavod = zavod;
    payload.cement_mark = cement_mark;
    payload.packaging = packaging;
    payload.price_per_ton = price_per_ton;
  }

  return {
    label: `${date}, ${client}, ${saleType === 'CEMENT' ? 'Цемент' : 'Логистика'}, ${tonnage} т`,
    payload,
  };
}

function parseCashRow(raw: Record<string, string>) {
  const date = raw['Дата']?.trim();
  const type = CASH_TYPE_REVERSE[raw['Тип']?.trim().toLowerCase() ?? ''];
  const category = raw['Категория']?.trim().toLowerCase();
  const amount = toNumber(raw['Сумма']);
  const payment_type = raw['Способ оплаты']?.trim().toLowerCase();
  if (!date || !type || !category || !amount || !payment_type) return null;
  if (!PAYMENT_TYPES.includes(payment_type)) return null;

  const currencyRaw = raw['Валюта']?.trim().toLowerCase();
  const currency = currencyRaw ? CURRENCY_REVERSE[currencyRaw] : 'UZS';
  if (!currency) return null;
  const usd_rate = toNumber(raw['Курс доллара']);
  if (currency === 'USD' && !usd_rate) return null;

  if (type === 'income' && !CASH_INCOME_CATEGORIES.includes(category)) return null;
  if (type === 'expense' && !CASH_EXPENSE_CATEGORIES.includes(category)) return null;

  const payload: Record<string, unknown> = {
    date,
    type,
    category,
    amount,
    currency,
    usd_rate,
    payment_type,
    comment: raw['Комментарий']?.trim() || null,
  };
  if (type === 'income') {
    payload.client = raw['Клиент']?.trim() || null;
  } else {
    payload.zavod = raw['Завод']?.trim() || null;
    payload.carrier_name = raw['Перевозчик']?.trim() || null;
  }

  return {
    label: `${date}, ${type === 'income' ? 'Приход' : 'Расход'}, ${category}, ${formatMoney(amount, currency)}`,
    payload,
  };
}

function parseSnapshotRow(raw: Record<string, string>) {
  const zavod = raw['Завод']?.trim();
  const cement_mark = raw['Марка']?.trim();
  const packaging = toPackaging(raw['Упаковка'] ?? '');
  const tonnage = toNumber(raw['Тоннаж']);
  const avg_cost_per_ton = toNumber(raw['Себестоимость за тонну']);
  if (!zavod || !cement_mark || !packaging || tonnage === null || avg_cost_per_ton === null) return null;
  return {
    label: `${zavod}, ${cement_mark}, ${tonnage} т`,
    payload: { zavod, cement_mark, packaging, tonnage, avg_cost_per_ton },
  };
}

function ImportTab() {
  const createClient = clientsHooks.useCreate();
  const createZavod = zavodyHooks.useCreate();
  const importIncoming = useImportIncoming();
  const importSales = useImportSales();
  const importCash = useImportCash();
  const importSnapshot = useImportWarehouseSnapshot();

  async function createOneByOne(create: { mutateAsync: (data: Record<string, unknown>) => Promise<unknown> }, payloads: Record<string, unknown>[]) {
    let count = 0;
    try {
      for (const payload of payloads) {
        await create.mutateAsync(payload);
        count++;
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Ошибка';
      throw new Error(`${message} (добавлено ${count} из ${payloads.length})`);
    }
    return count;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Сначала загрузите Клиентов и Заводы, если их ещё нет в системе — остальные файлы ссылаются на них по
        названию (неизвестные имена создаются автоматически). Приход и Продажи — это только история и долги, они
        не меняют текущий остаток склада; чтобы задать сам остаток — используйте блок «Остаток склада» внизу.
      </p>
      <FileImport
        title="Клиенты"
        hint="Имя обязательно. Начальный долг — число, можно оставить пустым."
        templateFilename="Клиенты_шаблон.xlsx"
        templateHeaders={[...CLIENT_HEADERS]}
        parseRow={parseClientRow}
        onImport={(payloads) => createOneByOne(createClient, payloads)}
      />
      <FileImport
        title="Заводы"
        hint="Название обязательно."
        templateFilename="Заводы_шаблон.xlsx"
        templateHeaders={[...ZAVOD_HEADERS]}
        parseRow={parseZavodRow}
        onImport={(payloads) => createOneByOne(createZavod, payloads)}
      />
      <FileImport
        title="Приход"
        hint="Упаковка — «Мешок» или «Навал». Только история — остаток склада не меняет."
        templateFilename="Приход_шаблон.xlsx"
        templateHeaders={[...INCOMING_HEADERS]}
        parseRow={parseIncomingRow}
        onImport={(payloads) => importIncoming.mutateAsync(payloads).then((r) => r.count)}
      />
      <FileImport
        title="Продажи"
        hint="Тип — «Цемент» или «Логистика» (для Цемента нужны завод/марка/упаковка). Тип машины — «Клиент»/«Своя»/«Наёмная»."
        templateFilename="Продажи_шаблон.xlsx"
        templateHeaders={[...SALE_HEADERS]}
        parseRow={parseSaleRow}
        onImport={(payloads) => importSales.mutateAsync(payloads).then((r) => r.count)}
      />
      <FileImport
        title="Касса"
        hint="Тип — «Приход» или «Расход». Категория и способ оплаты — как в обычной форме Кассы (например: цемент, логистика, перечисление, наличка)."
        templateFilename="Касса_шаблон.xlsx"
        templateHeaders={[...CASH_HEADERS]}
        parseRow={parseCashRow}
        onImport={(payloads) => importCash.mutateAsync(payloads).then((r) => r.count)}
      />
      <FileImport
        title="Остаток склада"
        hint="Текущий остаток на сегодня — отдельный снимок, не связан с историческим Приходом выше."
        templateFilename="Остаток_склада_шаблон.xlsx"
        templateHeaders={[...SNAPSHOT_HEADERS]}
        parseRow={parseSnapshotRow}
        onImport={(payloads) => importSnapshot.mutateAsync(payloads).then((r) => r.count)}
      />
    </div>
  );
}
