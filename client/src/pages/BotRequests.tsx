import { useState } from 'react';
import { useDecideRequest, useSaleRequests, useUpdateSaleRequest, type SaleRequest } from '@/api/modules';
import { ApiError } from '@/api/client';
import { Badge } from '@/components/Badge';
import { PageHeader } from '@/components/PageHeader';
import { SidePanel } from '@/components/SidePanel';
import { QuickOrderForm } from './QuickOrder';
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
  const updateRequest = useUpdateSaleRequest();
  const [editing, setEditing] = useState<SaleRequest | null>(null);
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
  async function saveEdit(body: Record<string, unknown>) {
    if (!editing) return;
    try {
      const r = await updateRequest.mutateAsync({ id: editing.id, data: body });
      notify(r.incomplete ? `Заявка №${editing.id} сохранена, но ещё есть что дописать` : `Заявка №${editing.id} сохранена — можно подтверждать`);
      setEditing(null);
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
              {r.problems && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-sm">
                  <b>Заявка неполная.</b> Нужно дописать — {r.problems}. Нажмите «Изменить», допишите и подтвердите.
                </div>
              )}
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
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => approve(r)} disabled={decide.isPending}>
                    Подтвердить
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(r)}>
                    Изменить
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

      {editing && (
        <SidePanel title={`Изменить заявку №${editing.id}`} onClose={() => setEditing(null)} widthClass="sm:max-w-xl">
          <p className="mb-4 text-sm text-muted-foreground">
            От: {editing.manager_name}. Исправьте ошибки и допишите недостающее, затем сохраните и подтвердите заявку.
          </p>
          <QuickOrderForm embedded initial={formToStrings(editing.form)} onSave={saveEdit} />
        </SidePanel>
      )}
    </div>
  );
}

/** Ответы из заявки → значения полей формы (всё — строками, как в форме). */
function formToStrings(form: Record<string, unknown> | null): Record<string, string> {
  const out: Record<string, string> = { sale_type: 'CEMENT', vehicle_type: 'CLIENT' };
  for (const [k, v] of Object.entries(form ?? {})) if (v !== null && v !== undefined && v !== '') out[k] = String(v);
  return out;
}
