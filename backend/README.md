# ZufarMax Backend

Telegram bot + Express API backend.

## Ishga tushirish

```bash
cd backend
npm install
npm start
```

## Environment

`backend/.env` faylni to'ldiring:

- `DATABASE_URL` - PostgreSQL connection string
- `PG_SSL` - `true/false` (cloud postgres uchun odatda `true`)
- `TELEGRAM_BOT_TOKEN` - @BotFather dan olingan token
- `WEB_APP_URL` - Telegram WebApp URL
- `ADMIN_CHAT_ID` - admin chat ID (ixtiyoriy)
- `TELEGRAM_WEBHOOK_URL` - webhook ishlatsangiz public backend URL
- `TELEGRAM_WEBHOOK_SECRET` - webhook endpoint maxfiy yo'li
- `DISABLE_TELEGRAM_BOT` - `true` bo'lsa backend API ishlaydi, lekin Telegram bot ishga tushmaydi
- `ALLOW_LOCAL_ADMIN_BYPASS` - `true` bo'lsa localhost dan admin API authsiz ishlaydi (dev uchun)
- `DEV_ADMIN_KEY` - xohlansa `x-dev-admin-key` header bilan admin API ga kirish kaliti

## PostgreSQL

Loyiha avtomatik quyidagi jadvallarni yaratadi:

- `orders`
- `referrals`

## API

- `GET /health`
- `GET /api/catalog`
- `POST /api/orders`
- `GET /api/orders/:telegramId`
- `GET /api/referrals/:telegramId`

## Bot komandalar

- `/start` (referal payload bilan ham ishlaydi)
- `/catalog`
- `/help`
