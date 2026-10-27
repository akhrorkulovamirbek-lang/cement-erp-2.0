import { useState } from 'react';
import { ApiError } from '@/api/client';
import { useBotClientLinks, useDisconnectBotClient, useRegenerateBotCode, useAddBotManager, useBotConfig, useBotManagers, useDeleteBotManager, useRemoveBot, useSaveBotToken } from '@/api/modules';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/lib/toast';

/** Настройки Телеграм-бота: ключ бота от @BotFather и список менеджеров, которым разрешено присылать заявки. */
export function BotSettings() {
  const { notify } = useToast();
  const config = useBotConfig();
  const managers = useBotManagers();
  const saveToken = useSaveBotToken();
  const removeBot = useRemoveBot();
  const addManager = useAddBotManager();
  const delManager = useDeleteBotManager();
  const links = useBotClientLinks();
  const regenerate = useRegenerateBotCode();
  const disconnect = useDisconnectBotClient();
  const [clientSearch, setClientSearch] = useState('');
  const [token, setToken] = useState('');
  const [name, setName] = useState('');

  const username = config.data?.username;
  const err = (e: unknown) => notify(e instanceof ApiError ? e.message : 'Ошибка', 'error');

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardContent className="space-y-3">
          <h3 className="font-semibold">1. Подключение бота</h3>
          {config.data?.connected ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge tone="green">Подключён</Badge>
              <span>@{username}</span>
              <Button variant="outline" size="sm" onClick={() => removeBot.mutateAsync().then(() => notify('Бот отключён')).catch(err)}>
                Отключить
              </Button>
            </div>
          ) : (
            <>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>В Телеграме откройте @BotFather и отправьте ему /newbot.</li>
                <li>Придумайте название и имя бота — он пришлёт длинный ключ.</li>
                <li>Вставьте этот ключ сюда и нажмите «Подключить».</li>
              </ol>
              <div className="flex gap-2">
                <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Ключ бота от BotFather" className="min-w-0 flex-1" />
                <Button
                  disabled={saveToken.isPending || !token.trim()}
                  onClick={() =>
                    saveToken
                      .mutateAsync(token.trim())
                      .then((r) => {
                        notify(`Бот @${r.username} подключён`);
                        setToken('');
                      })
                      .catch(err)
                  }
                >
                  Подключить
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <h3 className="font-semibold">2. Менеджеры</h3>
          <p className="text-sm text-muted-foreground">
            Добавьте менеджера — система выдаст ему код. Менеджер открывает бота{username ? ` @${username}` : ''} и отправляет этот код. Чужие люди с ботом работать не смогут.
          </p>
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя менеджера" className="min-w-0 flex-1" />
            <Button
              disabled={addManager.isPending || !name.trim()}
              onClick={() =>
                addManager
                  .mutateAsync(name.trim())
                  .then(() => setName(''))
                  .catch(err)
              }
            >
              Добавить
            </Button>
          </div>
          <div className="space-y-2">
            {(managers.data ?? []).map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
                <span className="font-medium">{m.name}</span>
                {m.linked ? (
                  <Badge tone="green">Подключён</Badge>
                ) : (
                  <span>
                    Код: <b className="font-mono tracking-wider">{m.link_code}</b>
                  </span>
                )}
                <Button variant="outline" size="sm" className="ml-auto" onClick={() => delManager.mutateAsync(m.id).catch(err)}>
                  Удалить
                </Button>
              </div>
            ))}
            {(managers.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Менеджеров пока нет.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <h3 className="font-semibold">3. Клиенты</h3>
          <p className="text-sm text-muted-foreground">
            У каждого клиента уже есть свой постоянный код. Передайте его клиенту: он открывает бота{username ? ` @${username}` : ''} и отправляет код — после этого видит свой баланс и может получить выписку в Excel.
            По одному коду могут подключиться несколько сотрудников клиента. Клиент видит только свои данные. Если код попал не к тому человеку — нажмите «Новый код», а лишних людей отключите.
          </p>
          <Input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Найти клиента…" />
          <div className="max-h-[28rem] space-y-2 overflow-y-auto">
            {(links.data ?? [])
              .filter((l) => l.client_name.toLowerCase().includes(clientSearch.trim().toLowerCase()))
              .map((l) => (
                <div key={l.client_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border p-3 text-sm">
                  <span className="min-w-0 flex-1 font-medium">{l.client_name}</span>
                  <button
                    type="button"
                    title="Нажмите, чтобы скопировать"
                    className="rounded bg-muted px-2 py-1 font-mono tracking-wider hover:bg-muted/70"
                    onClick={() => navigator.clipboard?.writeText(l.bot_code).then(() => notify('Код скопирован'))}
                  >
                    {l.bot_code}
                  </button>
                  {l.linked_count > 0 && <Badge tone="green">Подключено: {l.linked_count}</Badge>}
                  <Button variant="outline" size="sm" onClick={() => regenerate.mutateAsync(l.client_id).then(() => notify('Код заменён')).catch(err)}>
                    Новый код
                  </Button>
                  {l.linked_count > 0 && (
                    <Button variant="outline" size="sm" onClick={() => disconnect.mutateAsync(l.client_id).then(() => notify('Все отключены')).catch(err)}>
                      Отключить всех
                    </Button>
                  )}
                </div>
              ))}
            {(links.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Клиентов пока нет.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
