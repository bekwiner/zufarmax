# ZufarMax Backend

Telegram bot + Express API backend.

## Ishga tushirish

```bash
cd backend
npm install
npm start
```

Production uchun `NODE_ENV=production` ishlating.

## Environment

`backend/.env` faylni to'ldiring:

- `DATABASE_URL` - PostgreSQL connection string
- `PG_SSL` - `true/false` (cloud postgres uchun odatda `true`)
- `NODE_ENV` - productionda `production`
- `TELEGRAM_BOT_TOKEN` - @BotFather dan olingan token
- `WEB_APP_URL` - Telegram WebApp URL
- `ADMIN_WEB_APP_URL` - admin panel URL, default: `WEB_APP_URL + /admin`
- `ADMIN_CHAT_ID` - admin chat ID (ixtiyoriy)
- `SUPER_ADMIN_CHAT_ID` - super admin ID(lar)i
- `TELEGRAM_WEBHOOK_URL` - webhook ishlatsangiz public backend URL
- `TELEGRAM_WEBHOOK_SECRET` - webhook endpoint maxfiy yo'li
- `FF_INFO_API_URL` - Free Fire ID check API (`account_data.nickname` olinadi)
- `DISABLE_TELEGRAM_BOT` - `true` bo'lsa backend API ishlaydi, lekin Telegram bot ishga tushmaydi
- `ALLOW_LOCAL_ADMIN_BYPASS` - faqat local dev uchun `true`, productionda `false`
- `DEV_ADMIN_KEY` - xohlansa `x-dev-admin-key` header bilan admin API ga kirish kaliti

## Production tavsiya

- `ALLOW_LOCAL_ADMIN_BYPASS=false`
- `DISABLE_TELEGRAM_BOT=false`
- `WEB_APP_URL`, `ADMIN_WEB_APP_URL`, `TELEGRAM_WEBHOOK_URL` bir xil domen bilan sozlansin
- reverse proxy (`nginx`) orqali TLS terminatsiya qiling
- process manager (`systemd` yoki `pm2`) ishlating
- deploydan oldin `node --check src/main.js` bilan syntax tekshiring

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
