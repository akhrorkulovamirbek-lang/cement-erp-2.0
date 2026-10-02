import { useEffect, useState } from 'react';
import { ApiError } from '@/api/client';
import { useAppSettings, useModuleSettings, usePermissionMatrix, useSetPermission, useToggleModule, useUpdateAppSettings } from '@/api/modules';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
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
