# Deploy Guide

## 1. Server prerequisites

- Ubuntu/Debian server
- Node.js 20+
- PostgreSQL
- Nginx
- TLS certificate (`certbot` tavsiya)

## 2. Environment

`backend/.env` ni production qiymatlar bilan to'ldiring:

```env
NODE_ENV=production
PORT=8888
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
PG_SSL=false
TELEGRAM_BOT_TOKEN=...
WEB_APP_URL=https://your-domain.com
ADMIN_WEB_APP_URL=https://your-domain.com/admin
ADMIN_CHAT_ID=123456789
SUPER_ADMIN_CHAT_ID=123456789
TELEGRAM_WEBHOOK_URL=https://your-domain.com
TELEGRAM_WEBHOOK_SECRET=strong_random_secret
SUPPORT_USERNAME=your_support_username
DISABLE_TELEGRAM_BOT=false
ALLOW_LOCAL_ADMIN_BYPASS=false
DEV_ADMIN_KEY=
```

`ALLOW_LOCAL_ADMIN_BYPASS` productionda `false` bo'lishi shart.

## 3. Install

```bash
cd /opt/zufarmax/backend
npm ci
node --check src/main.js
```

## 4. systemd service

`/etc/systemd/system/zufarmax.service`

```ini
[Unit]
Description=ZufarMax backend
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/zufarmax/backend
ExecStart=/usr/bin/node src/main.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable zufarmax
sudo systemctl restart zufarmax
sudo systemctl status zufarmax
```

## 5. Nginx

Repo ichidagi [nginx-zufarmax.conf](/d:/zufarmax/nginx-zufarmax.conf) ni domeningizga moslab qo'ying va yoqing.

Muhim: bu config barcha so'rovlarni Node backendga proxy qiladi. Frontend va admin static fayllarini Node serve qiladi, shuning uchun `frontend/` va `admin/` ni alohida nginx root bilan sync qilish shart emas.

## 6. Post-deploy checks

```bash
curl -I http://127.0.0.1:8888/health
curl -I https://your-domain.com/health
curl https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo
```

Tekshiring:

- `/health` `bootstrapOk: true`
- `getWebhookInfo.url` sizning domeningizga qaragan bo'lsin
- `/` va `/admin` ochilsin
- Telegram bot `/start` ishlasin
- Admin panel Telegram ichida ochilsin

## 7. Safe deploy checklist

- `backend/.env` ichida ngrok URL qolmagan
- `DISABLE_TELEGRAM_BOT=false`
- `ALLOW_LOCAL_ADMIN_BYPASS=false`
- `TELEGRAM_WEBHOOK_URL` production domen
- `WEB_APP_URL` production domen
- PostgreSQL ulanishi ishlaydi
- Nginx reload qilingan
- `systemctl status zufarmax` healthy
