import { useState } from 'react';
import { ApiError } from '@/api/client';
import { clientsHooks, useAddBotClientLink, useBotClientLinks, useDeleteBotClientLink, useAddBotManager, useBotConfig, useBotManagers, useDeleteBotManager, useRemoveBot, useSaveBotToken } from '@/api/modules';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/ui/button';
import { PlainSelect } from '@/components/form';
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
  const clients = clientsHooks.useList();
  const links = useBotClientLinks();
  const addLink = useAddBotClientLink();
  const delLink = useDeleteBotClientLink();
  const [clientId, setClientId] = useState('');
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
            Клиент может сам смотреть в боте свой баланс, покупки и платежи. Выберите клиента — система выдаст код. Передайте код клиенту: он открывает бота{username ? ` @${username}` : ''} и отправляет его.
            Клиент видит только свои данные, закупочных цен и маржи ему не показывается. Одному клиенту можно выдать несколько кодов (для разных сотрудников).
          </p>
          <div className="flex gap-2">
            <PlainSelect
              value={clientId}
              onValueChange={setClientId}
              placeholder="Выберите клиента"
              className="min-w-0 flex-1"
              options={(clients.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
            />
            <Button
              disabled={addLink.isPending || !clientId}
              onClick={() =>
                addLink
                  .mutateAsync(Number(clientId))
                  .then(() => setClientId(''))
                  .catch(err)
              }
            >
              Создать код
            </Button>
          </div>
          <div className="space-y-2">
            {(links.data ?? []).map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
                <span className="font-medium">{l.client_name}</span>
                {l.linked ? (
                  <Badge tone="green">Подключён</Badge>
                ) : (
                  <span>
                    Код: <b className="font-mono tracking-wider">{l.link_code}</b>
                  </span>
                )}
                <Button variant="outline" size="sm" className="ml-auto" onClick={() => delLink.mutateAsync(l.id).catch(err)}>
                  {l.linked ? 'Отключить' : 'Удалить'}
                </Button>
              </div>
            ))}
            {(links.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Клиентов в боте пока нет.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
