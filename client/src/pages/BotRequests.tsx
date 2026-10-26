import { useState } from 'react';
import { useDecideRequest, useSaleRequests, type SaleRequest } from '@/api/modules';
import { ApiError } from '@/api/client';
import { Badge } from '@/components/Badge';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/lib/toast';

function when(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
}

/** Заявки на продажу, присланные менеджерами через Телеграм-бота. Пока оператор не подтвердил,
 * заявка ни на что не влияет; после подтверждения создаётся обычная продажа «Ждёт погрузки». */
export function BotRequests() {
  const { notify } = useToast();
  const list = useSaleRequests();
  const decide = useDecideRequest();
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  const rows = list.data ?? [];
  const pending = rows.filter((r) => r.status === 'pending');
  const done = rows.filter((r) => r.status !== 'pending');

  async function approve(r: SaleRequest) {
    try {
      await decide.mutateAsync({ id: r.id, approve: true });
      notify(`Заявка №${r.id} подтверждена — продажа ждёт погрузки`);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }
  async function reject(r: SaleRequest) {
    try {
      await decide.mutateAsync({ id: r.id, approve: false, reason });
      notify(`Заявка №${r.id} отклонена`);
      setRejecting(null);
      setReason('');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  return (
    <div>
      <PageHeader title="Заявки" subtitle="Заявки на продажу от менеджеров из Телеграм-бота" />

      <h2 className="mb-2 text-sm font-semibold">Ждут подтверждения ({pending.length})</h2>
      {pending.length === 0 && <p className="mb-6 text-sm text-muted-foreground">Новых заявок нет.</p>}
      <div className="mb-8 grid gap-3 md:grid-cols-2">
        {pending.map((r) => (
          <Card key={r.id}>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">Заявка №{r.id}</span>
                <span className="text-muted-foreground">
                  {r.manager_name} · {when(r.created_at)}
                </span>
              </div>
              <pre className="font-sans text-sm whitespace-pre-wrap">{r.summary}</pre>
              {rejecting === r.id ? (
                <div className="flex flex-wrap gap-2">
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Причина (менеджер увидит её в боте)" className="min-w-0 flex-1" />
                  <Button variant="destructive" onClick={() => reject(r)} disabled={decide.isPending}>
                    Отклонить
                  </Button>
                  <Button variant="outline" onClick={() => setRejecting(null)}>
                    Назад
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={() => approve(r)} disabled={decide.isPending}>
                    Подтвердить
                  </Button>
                  <Button variant="outline" onClick={() => setRejecting(r.id)}>
                    Отклонить
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {done.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold">Обработанные</h2>
          <div className="space-y-2">
            {done.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-3 text-sm">
                <span className="font-medium">№{r.id}</span>
                <Badge tone={r.status === 'approved' ? 'green' : 'red'}>{r.status === 'approved' ? 'Подтверждена' : 'Отклонена'}</Badge>
                <span className="text-muted-foreground">{r.manager_name}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.summary.split('\n').slice(1, 4).join(', ')}</span>
                {r.reject_reason && <span className="text-destructive">{r.reject_reason}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
