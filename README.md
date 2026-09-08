# Cement ERP 2.0

CRM/ERP для дилера цемента: биржа (тикеты), склад, продажи, логистика, касса, долги клиентов и заводов.

## Стек

- **Backend:** Node.js + Express + TypeScript, PostgreSQL (`pg`), zod-валидация, JWT-авторизация (httpOnly cookie).
- **Frontend:** React + TypeScript + Tailwind CSS v4, React Router, TanStack Query, React Hook Form, Recharts.
- В production сервер раздаёт собранный фронт (`client/dist`) — один деплой, один процесс.

## Локальный запуск

1. Установите PostgreSQL локально (или используйте облачную БД, например Supabase) и создайте базу:
   ```bash
   createdb cement_erp
   ```
2. Скопируйте `server/.env.example` в `server/.env` и заполните:
   ```
   DATABASE_URL=postgres://localhost:5432/cement_erp
   JWT_SECRET=любая-длинная-случайная-строка
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=ваш-пароль
   ```
3. Установите зависимости из корня проекта:
   ```bash
   npm install
   ```
4. Запустите backend и frontend в двух терминалах:
   ```bash
   npm run dev:server
   npm run dev:client
   ```
5. Откройте http://localhost:5173 — фронтенд проксирует `/api` на backend (порт 3000).

При первом запуске сервер сам создаёт таблицы (`schema.sql`) и учётную запись администратора из `ADMIN_USERNAME`/`ADMIN_PASSWORD`.

## Продакшн-сборка

```bash
npm run build   # соберёт client и server
npm start       # запустит собранный сервер (раздаёт API и фронт)
```

## Деплой

- **База данных:** Supabase Postgres (бесплатный тариф без ограничения по времени жизни) — создайте проект, возьмите `DATABASE_URL` (pooled connection) из настроек.
- **Приложение:** Render Web Service.
  - Build Command: `npm install && npm run build`
  - Start Command: `npm start`
  - Environment: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`

Free-план Render засыпает при неактивности (первый запрос после простоя будет медленным) — это касается только самого сервера, данные в Supabase не теряются.

## Структура

```
server/   Express API (модуль на бизнес-сущность: zavody, clients, tickets, sales, ...)
client/   React SPA (pages/, components/, api/ — react-query хуки)
```

Подробности бизнес-логики (маржа, автоматический возврат остатка тикета, долги клиентов/заводов) — см. `server/src/modules/*/service.ts`.
