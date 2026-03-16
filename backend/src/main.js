require("dotenv").config();

const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const { pool, initDb } = require("./services/db");
const { createBot } = require("./services/telegramBot");

const app = express();
let bootstrapStatus = { ok: false, error: null };

const NODE_ENV = String(process.env.NODE_ENV || "development").trim().toLowerCase();
const PORT = Number(process.env.PORT || 3000);
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const WEB_APP_URL = process.env.WEB_APP_URL || "https://t.me";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "";
const WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL || "";
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "zufarmax_secret";
const REFERRAL_BONUS_PER_USER = Number(process.env.REFERRAL_BONUS_PER_USER || 4);
const INFO_API_URL = process.env.INFO_API_URL || "";
const INFO_API_KEY = process.env.INFO_API_KEY || "";
const DISABLE_TELEGRAM_BOT = String(process.env.DISABLE_TELEGRAM_BOT || "").trim().toLowerCase() === "true";
const ADMIN_PAYMENT_CARD = process.env.ADMIN_PAYMENT_CARD || "8600 1234 5678 9012";
const DEFAULT_PAYMENT_CONFIG = {
  cardLabel: "Humo / Uzcard",
  cardNumber: ADMIN_PAYMENT_CARD,
  cardOwner: "Ism Familiya"
};
const DEFAULT_MANDATORY_CHANNELS = [];
const DEFAULT_DEVICE_SETTINGS = [];
const DEFAULT_HERO_BANNERS = [
  {
    id: "hero-1",
    title: "FREE FIRE DIAMONDS",
    image: "assets/banner/Almas.webp",
    actionTarget: "sub-dia",
    buttonText: "Xarid qilish",
    buttonIcon: "fa-solid fa-gem",
    buttonBg: ""
  },
  {
    id: "hero-2",
    title: "NASTROYKA",
    image: "assets/banner/accaunt.jpeg",
    actionTarget: "page-acc",
    buttonText: "Katalog",
    buttonIcon: "fa-solid fa-sliders",
    buttonBg: ""
  },
  {
    id: "hero-3",
    title: "PUBG MOBILE UC",
    image: "assets/banner/pubg-uc.webp",
    actionTarget: "sub-uc",
    buttonText: "Xarid qilish",
    buttonIcon: "fa-solid fa-parachute-box",
    buttonBg: "#ffcc00"
  },
  {
    id: "hero-4",
    title: "STANDOFF 2 GOLD",
    image: "assets/banner/standoff-2-gold.webp",
    actionTarget: "sub-gold",
    buttonText: "Xarid qilish",
    buttonIcon: "fa-solid fa-crosshairs",
    buttonBg: "#00f0ff"
  }
];
const DEFAULT_HOME_NEWS = [];
const DEFAULT_HOT_PRODUCTS = [];
const DEFAULT_CATALOG_CATEGORIES = [
  { key: "diamonds", name: "Free Fire", badge: "Almazlar", icon: "assets/img/freefire.webp", active: true },
  { key: "uc", name: "PUBG Mobile", badge: "UC Paketlar", icon: "assets/img/pubg.png", active: true },
  { key: "gold", name: "Standoff 2", badge: "Gold & Promo", icon: "assets/img/standoff.png", active: true },
  { key: "telegram", name: "Telegram", badge: "Premium & Stars", icon: "assets/img/telegram.png", active: true }
];
const ADMIN_IDS = String(process.env.ADMIN_CHAT_ID || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const SUPER_ADMIN_IDS = String(process.env.SUPER_ADMIN_CHAT_ID || ADMIN_IDS[0] || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const ADMIN_WEB_APP_URL = process.env.ADMIN_WEB_APP_URL
  || (WEB_APP_URL ? `${WEB_APP_URL.replace(/\/+$/, "")}/admin` : "");
const ALLOW_LOCAL_ADMIN_BYPASS = String(process.env.ALLOW_LOCAL_ADMIN_BYPASS || "").trim().toLowerCase() === "true";
const DEV_ADMIN_KEY = String(process.env.DEV_ADMIN_KEY || "").trim();
const DEFAULT_ADMIN_ACCESS = { admins: [], superAdmins: [] };
let dynamicAdminIds = new Set();
let dynamicSuperAdminIds = new Set();
let adminAccessLoaded = false;
let runtimeTelegramToken = TELEGRAM_TOKEN;

app.set("trust proxy", 1);
app.use(express.json({ limit: "20mb" }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-telegram-init-data, x-dev-admin-key");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "zufarmax-backend",
    bootstrapOk: bootstrapStatus.ok,
    bootstrapError: bootstrapStatus.error
  });
});

async function fetchCatalogData(options = {}) {
  const includeInactive = options.includeInactive === true;
  const whereProducts = includeInactive ? "" : "WHERE active = TRUE";
  const whereAccounts = includeInactive ? "" : "WHERE active = TRUE";
  const hotSet = await getHotProductsSetting();
  const categoryRows = await getCatalogCategoriesSetting();

  const [productsRows, accountsRows] = await Promise.all([
    pool.query(
      `
      SELECT id, category, title, price::FLOAT8 AS price, qty, icon, description, active, sort_order AS "sortOrder"
      FROM catalog_products
      ${whereProducts}
      ORDER BY category ASC, sort_order ASC, created_at ASC
      `
    ),
    pool.query(
      `
      SELECT id, title, price::FLOAT8 AS price, level, active, meta
      FROM catalog_accounts
      ${whereAccounts}
      ORDER BY created_at ASC
      `
    )
  ]);

  const grouped = {
    diamonds: [],
    uc: [],
    gold: [],
    telegram: [],
    tg: [],
    accounts: []
  };
  const categoryMap = new Map(categoryRows.map((item) => [item.key, item]));

  for (const row of productsRows.rows) {
    const item = {
      id: row.id,
      title: row.title,
      price: Number(row.price || 0),
      qty: Number(row.qty || 0),
      icon: row.icon || "assets/img/logo.JPG",
      description: String(row.description || ""),
      hot: hotSet.has(String(row.id))
    };
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push(item);
    if (!categoryMap.has(row.category)) {
      categoryMap.set(row.category, normalizeCatalogCategory({ key: row.category, name: row.category, icon: item.icon }));
    }
  }

  grouped.tg = [...(grouped.telegram || [])];
  if (categoryMap.has("telegram") && !categoryMap.has("tg")) {
    categoryMap.set("tg", { ...categoryMap.get("telegram"), key: "tg" });
  }

  grouped.accounts = accountsRows.rows.map((row) => ({
    id: row.id,
    title: row.title,
    price: Number(row.price || 0),
    level: row.level,
    ...((row.meta && typeof row.meta === "object") ? row.meta : {})
  }));

  grouped.categoryMeta = Object.fromEntries([...categoryMap.entries()].map(([key, value]) => [key, value]));

  return grouped;
}

app.get("/api/catalog", async (req, res) => {
  const data = await fetchCatalogData({ includeInactive: false });
  res.json({ ok: true, data });
});

app.get("/api/bot-info", async (req, res) => {
  let username = app.locals.botUsername || null;

  if (!username && typeof app.locals.getBotUsername === "function") {
    username = await app.locals.getBotUsername();
    app.locals.botUsername = username || null;
  }

  res.json({
    ok: true,
    data: {
      username
    }
  });
});

app.post("/api/player/lookup", async (req, res) => {
  const uid = String(req.body?.uid || "").trim();
  const game = String(req.body?.game || "").trim();
  if (!uid) return res.status(400).json({ ok: false, message: "uid majburiy." });

  try {
    const result = await lookupPlayer(game, uid);
    if (!result.ok) return res.status(404).json({ ok: false, message: result.message || "Player topilmadi." });
    res.json({ ok: true, data: { uid, game, nickname: result.nickname } });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Lookup xatosi.", detail: error.message });
  }
});

async function refreshAdminAccessCache() {
  const value = await getSetting("admin_access", DEFAULT_ADMIN_ACCESS);
  const admins = Array.isArray(value?.admins) ? value.admins : [];
  const superAdmins = Array.isArray(value?.superAdmins) ? value.superAdmins : [];
  dynamicAdminIds = new Set(admins.map((x) => String(x || "").trim()).filter(Boolean));
  dynamicSuperAdminIds = new Set(superAdmins.map((x) => String(x || "").trim()).filter(Boolean));
  adminAccessLoaded = true;
  return {
    admins: [...dynamicAdminIds],
    superAdmins: [...dynamicSuperAdminIds]
  };
}

function isSuperAdminId(telegramId) {
  const id = String(telegramId || "").trim();
  if (!id) return false;
  return SUPER_ADMIN_IDS.includes(id) || dynamicSuperAdminIds.has(id);
}

function isAdminId(telegramId) {
  const id = String(telegramId || "").trim();
  if (!id) return false;
  return ADMIN_IDS.includes(id) || dynamicAdminIds.has(id) || isSuperAdminId(id);
}

function verifyTelegramWebAppInitData(initData, botToken) {
  if (!initData || !botToken) return { ok: false, reason: "MISSING_DATA" };
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "MISSING_HASH" };

  const entries = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    entries.push(`${key}=${value}`);
  }
  entries.sort();
  const dataCheckString = entries.join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (calculatedHash.length !== hash.length) return { ok: false, reason: "BAD_HASH" };
  const ok = crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(hash));
  if (!ok) return { ok: false, reason: "BAD_HASH" };

  let user = null;
  try {
    user = JSON.parse(params.get("user") || "null");
  } catch {
    user = null;
  }

  return { ok: true, user };
}

async function requireAdminWebApp(req, res, next) {
  if (!adminAccessLoaded) {
    await refreshAdminAccessCache();
  }
  const remote = String(req.ip || req.socket?.remoteAddress || "");
  const isLocalRequest = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].some((x) => remote.includes(x));
  const devHeaderKey = String(req.header("x-dev-admin-key") || "").trim();

  if ((ALLOW_LOCAL_ADMIN_BYPASS && isLocalRequest) || (DEV_ADMIN_KEY && devHeaderKey === DEV_ADMIN_KEY)) {
    req.adminUser = {
      id: "local-admin",
      username: "local_admin",
      first_name: "Local",
      last_name: "Admin",
      isSuperAdmin: true
    };
    return next();
  }

  const initData = req.header("x-telegram-init-data") || req.body?.initData || "";
  const verify = verifyTelegramWebAppInitData(initData, runtimeTelegramToken || TELEGRAM_TOKEN);
  if (!verify.ok) {
    return res.status(401).json({ ok: false, message: "Telegram auth xatosi.", code: verify.reason });
  }

  const telegramId = String(verify.user?.id || "");
  if (!isAdminId(telegramId)) {
    return res.status(403).json({ ok: false, message: "Admin ruxsati yo'q." });
  }

  req.adminUser = {
    ...(verify.user || {}),
    isSuperAdmin: isSuperAdminId(telegramId)
  };
  next();
}

async function requireSuperAdminWebApp(req, res, next) {
  await requireAdminWebApp(req, res, async () => {
    if (!req.adminUser?.isSuperAdmin) {
      return res.status(403).json({ ok: false, message: "Super admin ruxsati kerak." });
    }
    next();
  });
}

async function getSetting(key, fallback = {}) {
  const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = $1`, [key]);
  if (!rows[0]) return fallback;
  return rows[0].value || fallback;
}

async function setSetting(key, value) {
  await pool.query(
    `
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ($1, $2::jsonb, NOW())
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [key, JSON.stringify(value || {})]
  );
}

function normalizePaymentConfig(input = {}) {
  const cardLabel = String(input?.cardLabel || DEFAULT_PAYMENT_CONFIG.cardLabel).trim() || DEFAULT_PAYMENT_CONFIG.cardLabel;
  const rawCardNumber = String(input?.cardNumber || DEFAULT_PAYMENT_CONFIG.cardNumber).trim();
  const cardDigits = rawCardNumber.replace(/\D+/g, "");
  const cardNumber = cardDigits
    ? (cardDigits.match(/.{1,4}/g) || [cardDigits]).join(" ").trim()
    : DEFAULT_PAYMENT_CONFIG.cardNumber;
  const cardOwner = String(input?.cardOwner || DEFAULT_PAYMENT_CONFIG.cardOwner).trim() || DEFAULT_PAYMENT_CONFIG.cardOwner;
  return { cardLabel, cardNumber, cardOwner };
}

function normalizeMandatoryChannel(item = {}) {
  const id = String(item?.id || crypto.randomUUID()).trim();
  const title = String(item?.title || "").trim();
  const urlRaw = String(item?.url || "").trim();
  const usernameFromUrl = (() => {
    const m = urlRaw.match(/t\.me\/([A-Za-z0-9_]{4,})/i);
    return m ? String(m[1]).trim() : "";
  })();
  const usernameRaw = String(item?.username || usernameFromUrl || "").trim().replace(/^@+/, "");
  const username = usernameRaw ? `@${usernameRaw}` : "";
  const url = urlRaw || (usernameRaw ? `https://t.me/${usernameRaw}` : "");
  const active = item?.active !== false;
  return { id, title, username, url, active };
}

function normalizeDeviceSetting(item = {}) {
  const id = String(item?.id || crypto.randomUUID()).trim();
  const brand = String(item?.brand || "").trim();
  const model = String(item?.model || "").trim();
  const imagePhone = String(item?.imagePhone || item?.image_phone || "").trim();
  const toNum = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    id,
    brand,
    model,
    imagePhone,
    general: toNum(item?.general),
    redDot: toNum(item?.redDot),
    x2: toNum(item?.x2),
    x4: toNum(item?.x4),
    awm: toNum(item?.awm),
    freeLook: toNum(item?.freeLook),
    dpi: toNum(item?.dpi)
  };
}

function normalizeHeroBanner(item = {}) {
  const id = String(item?.id || crypto.randomUUID()).trim();
  const title = String(item?.title || "").trim();
  const image = String(item?.image || "").trim();
  const actionTarget = String(item?.actionTarget || "page-home").trim();
  const buttonText = String(item?.buttonText || "Xarid qilish").trim();
  const buttonIcon = String(item?.buttonIcon || "fa-solid fa-bolt").trim();
  const buttonBg = String(item?.buttonBg || "").trim();
  return { id, title, image, actionTarget, buttonText, buttonIcon, buttonBg };
}

function normalizeHomeNews(item = {}) {
  const id = String(item?.id || crypto.randomUUID()).trim();
  const title = String(item?.title || "").trim();
  const time = String(item?.time || "Hozirgina").trim();
  const active = item?.active !== false;
  return { id, title, time, active };
}

async function getMandatoryChannelsSetting() {
  const value = await getSetting("mandatory_channels", DEFAULT_MANDATORY_CHANNELS);
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((item) => normalizeMandatoryChannel(item))
    .filter((item) => item.title && (item.username || item.url));
}

async function setMandatoryChannelsSetting(rows = []) {
  const next = (Array.isArray(rows) ? rows : [])
    .map((item) => normalizeMandatoryChannel(item))
    .filter((item) => item.title && (item.username || item.url));
  await setSetting("mandatory_channels", next);
  return next;
}

async function getDeviceSettingsSetting() {
  const value = await getSetting("device_settings", DEFAULT_DEVICE_SETTINGS);
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((item) => normalizeDeviceSetting(item))
    .filter((item) => item.brand && item.model);
}

async function setDeviceSettingsSetting(rows = []) {
  const next = (Array.isArray(rows) ? rows : [])
    .map((item) => normalizeDeviceSetting(item))
    .filter((item) => item.brand && item.model);
  await setSetting("device_settings", next);
  return next;
}

async function getHeroBannersSetting() {
  const value = await getSetting("hero_banners", DEFAULT_HERO_BANNERS);
  const rows = Array.isArray(value) ? value : [];
  const normalized = rows
    .map((item) => normalizeHeroBanner(item))
    .filter((item) => item.title && item.image && item.actionTarget);
  if (normalized.length > 0) return normalized;
  return DEFAULT_HERO_BANNERS.map((x) => normalizeHeroBanner(x));
}

async function setHeroBannersSetting(rows = []) {
  const next = (Array.isArray(rows) ? rows : [])
    .map((item) => normalizeHeroBanner(item))
    .filter((item) => item.title && item.image && item.actionTarget);
  await setSetting("hero_banners", next);
  return next;
}

async function getHomeNewsSetting(options = {}) {
  const includeInactive = options.includeInactive === true;
  const value = await getSetting("home_news", DEFAULT_HOME_NEWS);
  const rows = Array.isArray(value) ? value : [];
  const normalized = rows
    .map((item) => normalizeHomeNews(item))
    .filter((item) => item.title);
  return includeInactive ? normalized : normalized.filter((item) => item.active !== false);
}

async function setHomeNewsSetting(rows = []) {
  const next = (Array.isArray(rows) ? rows : [])
    .map((item) => normalizeHomeNews(item))
    .filter((item) => item.title);
  await setSetting("home_news", next);
  return next;
}

function slugifyCategoryKey(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) return "";
  return normalized === "tg" ? "telegram" : normalized;
}

function normalizeCatalogCategory(item = {}) {
  const rawKey = item?.key ?? item?.id ?? item?.name ?? item?.title ?? "";
  const key = slugifyCategoryKey(rawKey) || `cat-${Date.now()}`;
  const fallback = DEFAULT_CATALOG_CATEGORIES.find((row) => row.key === key);
  const name = String(item?.name || item?.title || fallback?.name || key).trim() || fallback?.name || key;
  const badge = String(item?.badge || fallback?.badge || "Xizmatlar").trim() || "Xizmatlar";
  const icon = String(item?.icon || fallback?.icon || "assets/img/logo.JPG").trim() || "assets/img/logo.JPG";
  const active = item?.active !== false;
  return { key, name, badge, icon, active };
}

async function getCatalogCategoriesSetting() {
  const value = await getSetting("catalog_categories", DEFAULT_CATALOG_CATEGORIES);
  const rows = Array.isArray(value) ? value : [];
  const merged = new Map(DEFAULT_CATALOG_CATEGORIES.map((item) => {
    const normalized = normalizeCatalogCategory(item);
    return [normalized.key, normalized];
  }));
  rows.forEach((item) => {
    const normalized = normalizeCatalogCategory(item);
    merged.set(normalized.key, normalized);
  });
  return [...merged.values()];
}

async function setCatalogCategoriesSetting(rows = []) {
  const nextMap = new Map();
  (Array.isArray(rows) ? rows : []).forEach((item) => {
    const normalized = normalizeCatalogCategory(item);
    if (normalized.key && normalized.name) nextMap.set(normalized.key, normalized);
  });
  const next = [...nextMap.values()];
  await setSetting("catalog_categories", next);
  return next;
}

async function getHotProductsSetting() {
  const value = await getSetting("hot_products", DEFAULT_HOT_PRODUCTS);
  const rows = Array.isArray(value) ? value : [];
  return new Set(rows.map((x) => String(x || "").trim()).filter(Boolean));
}

async function setHotProductsSetting(rows = []) {
  const next = Array.from(new Set((Array.isArray(rows) ? rows : []).map((x) => String(x || "").trim()).filter(Boolean)));
  await setSetting("hot_products", next);
  return next;
}

async function upsertUserProfile(user = {}) {
  if (!user.telegramId) return;
  await pool.query(
    `
    INSERT INTO users (telegram_id, first_name, last_name, username, updated_at)
    VALUES ($1,$2,$3,$4,NOW())
    ON CONFLICT (telegram_id)
    DO UPDATE SET
      first_name = COALESCE(EXCLUDED.first_name, users.first_name),
      last_name = COALESCE(EXCLUDED.last_name, users.last_name),
      username = COALESCE(EXCLUDED.username, users.username),
      updated_at = NOW()
    `,
    [
      String(user.telegramId),
      user.firstName ? String(user.firstName) : null,
      user.lastName ? String(user.lastName) : null,
      user.username ? String(user.username) : null
    ]
  );
}

async function lookupPlayer(game, uid) {
  const trimmedUid = String(uid || "").trim();
  if (!trimmedUid) return { ok: false, message: "UID bo'sh." };

  // Fallback mode: if INFO_API_URL yo'q bo'lsa, test nickname qaytadi.
  if (!INFO_API_URL) {
    return {
      ok: true,
      nickname: `PLAYER_${trimmedUid.slice(0, 6)}`,
      raw: { source: "fallback" }
    };
  }

  const url = new URL(INFO_API_URL);
  url.searchParams.set("uid", trimmedUid);
  if (game) url.searchParams.set("game", String(game));

  const headers = { Accept: "application/json" };
  if (INFO_API_KEY) headers.Authorization = `Bearer ${INFO_API_KEY}`;

  const resp = await fetch(url, { method: "GET", headers });
  if (!resp.ok) {
    return { ok: false, message: `Info API xato: ${resp.status}` };
  }

  const payload = await resp.json().catch(() => ({}));
  const nickname = payload?.nickname
    || payload?.data?.nickname
    || payload?.player?.nickname
    || payload?.player?.name
    || payload?.name
    || null;

  if (!nickname) return { ok: false, message: "Nickname topilmadi." };
  return { ok: true, nickname: String(nickname), raw: payload };
}

app.post("/api/admin/session", requireAdminWebApp, async (req, res) => {
  res.json({
    ok: true,
    data: {
      telegramId: String(req.adminUser?.id || ""),
      username: req.adminUser?.username || null,
      firstName: req.adminUser?.first_name || "Admin",
      isSuperAdmin: req.adminUser?.isSuperAdmin === true
    }
  });
});

app.get("/api/admin/super-tools/status", requireSuperAdminWebApp, async (req, res) => {
  const masked = String(runtimeTelegramToken || "").trim();
  const tokenMasked = masked.length > 10
    ? `${masked.slice(0, 6)}...${masked.slice(-4)}`
    : (masked ? "***" : "");
  res.json({
    ok: true,
    data: {
      botRunning: Boolean(botInstance),
      tokenMasked,
      botUsername: app.locals.botUsername || null
    }
  });
});

app.get("/api/admin/super-tools/admins", requireSuperAdminWebApp, async (req, res) => {
  if (!adminAccessLoaded) await refreshAdminAccessCache();
  const admins = Array.from(new Set([...ADMIN_IDS, ...dynamicAdminIds])).filter(Boolean);
  const superAdmins = Array.from(new Set([...SUPER_ADMIN_IDS, ...dynamicSuperAdminIds])).filter(Boolean);
  res.json({ ok: true, data: { admins, superAdmins } });
});

app.post("/api/admin/super-tools/admins/add", requireSuperAdminWebApp, async (req, res) => {
  const rawIdentifier = String(req.body?.telegramId || req.body?.identifier || "").trim();
  const role = String(req.body?.role || "admin").trim().toLowerCase();
  if (!rawIdentifier) return res.status(400).json({ ok: false, message: "telegramId yoki username majburiy." });
  if (!["admin", "superadmin"].includes(role)) {
    return res.status(400).json({ ok: false, message: "role admin yoki superadmin bo'lishi kerak." });
  }

  let telegramId = rawIdentifier;
  let resolvedUsername = null;
  const looksLikeUsername = /[A-Za-z_@]/.test(rawIdentifier);
  if (looksLikeUsername) {
    const username = rawIdentifier.replace(/^@+/, "").trim().toLowerCase();
    if (!username) return res.status(400).json({ ok: false, message: "Username noto'g'ri." });
    const lookup = await pool.query(
      `
      SELECT telegram_id AS "telegramId", username
      FROM users
      WHERE LOWER(COALESCE(username, '')) = $1
      LIMIT 1
      `,
      [username]
    );
    const row = lookup.rows[0];
    if (!row?.telegramId) {
      return res.status(404).json({ ok: false, message: "Username bo'yicha user topilmadi." });
    }
    telegramId = String(row.telegramId).trim();
    resolvedUsername = row.username ? String(row.username).trim() : username;
  }

  const value = await getSetting("admin_access", DEFAULT_ADMIN_ACCESS);
  const admins = new Set((Array.isArray(value?.admins) ? value.admins : []).map((x) => String(x || "").trim()).filter(Boolean));
  const superAdmins = new Set((Array.isArray(value?.superAdmins) ? value.superAdmins : []).map((x) => String(x || "").trim()).filter(Boolean));

  if (role === "superadmin") superAdmins.add(telegramId);
  else admins.add(telegramId);

  await setSetting("admin_access", {
    admins: [...admins],
    superAdmins: [...superAdmins]
  });
  await refreshAdminAccessCache();

  res.json({ ok: true, data: { telegramId, role, username: resolvedUsername } });
});

app.post("/api/admin/super-tools/bot-stop", requireSuperAdminWebApp, async (req, res) => {
  if (botInstance) {
    try {
      botInstance.stop("STOP_BY_SUPERADMIN");
    } catch {}
    botInstance = null;
  }
  app.locals.bot = null;
  app.locals.botUsername = null;
  bootstrapStatus = { ok: false, error: "Bot super admin tomonidan to'xtatildi." };
  res.json({ ok: true, data: { botRunning: false } });
});

app.put("/api/admin/super-tools/bot-token", requireSuperAdminWebApp, async (req, res) => {
  const token = String(req.body?.token || "").trim();
  if (!token || !token.includes(":")) {
    return res.status(400).json({ ok: false, message: "Yaroqli bot token kiriting." });
  }

  const current = await getSetting("super_admin", {});
  await setSetting("super_admin", { ...(current || {}), botToken: token });
  runtimeTelegramToken = token;

  if (botInstance) {
    try {
      botInstance.stop("TOKEN_CHANGE");
    } catch {}
    botInstance = null;
  }

  try {
    botInstance = await bootstrap();
    bootstrapStatus = { ok: true, error: null };
    res.json({ ok: true, data: { botRunning: Boolean(botInstance) } });
  } catch (error) {
    bootstrapStatus = { ok: false, error: error.message };
    res.status(500).json({ ok: false, message: "Botni yangi token bilan ishga tushirib bo'lmadi.", detail: error.message });
  }
});

app.get("/api/admin/dashboard", requireAdminWebApp, async (req, res) => {
  const [
    ordersCount,
    pendingCount,
    revenueSum,
    usersCount,
    referralsCount,
    todayOrders,
    topProducts,
    weeklySales,
    recentActivity,
    latestOrders,
    revenueByCategory
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*)::INT AS count FROM orders`),
    pool.query(`SELECT COUNT(*)::INT AS count FROM orders WHERE status = 'pending'`),
    pool.query(`SELECT COALESCE(SUM(amount), 0)::FLOAT8 AS total FROM orders WHERE status = 'done'`),
    pool.query(`SELECT COUNT(*)::INT AS count FROM users`),
    pool.query(`SELECT COUNT(*)::INT AS count FROM referrals`),
    pool.query(`
      SELECT COUNT(*)::INT AS count
      FROM orders
      WHERE created_at::date = CURRENT_DATE
    `),
    pool.query(`
      SELECT product_title AS "title", COUNT(*)::INT AS "count", COALESCE(SUM(amount),0)::FLOAT8 AS "revenue"
      FROM orders
      WHERE status = 'done'
      GROUP BY product_title
      ORDER BY "count" DESC
      LIMIT 5
    `),
    pool.query(`
      SELECT
        TO_CHAR(day::date, 'YYYY-MM-DD') AS day,
        COALESCE(SUM(amount),0)::FLOAT8 AS revenue
      FROM (
        SELECT generate_series(CURRENT_DATE - INTERVAL '6 day', CURRENT_DATE, INTERVAL '1 day') AS day
      ) d
      LEFT JOIN orders o ON o.created_at::date = d.day::date AND o.status = 'done'
      GROUP BY day
      ORDER BY day ASC
    `),
    pool.query(`
      SELECT
        id,
        telegram_id AS "telegramId",
        product_title AS "productTitle",
        status,
        created_at AS "createdAt"
      FROM orders
      ORDER BY created_at DESC
      LIMIT 10
    `),
    pool.query(`
      SELECT
        id,
        telegram_id AS "telegramId",
        product_title AS "productTitle",
        amount::FLOAT8 AS amount,
        category,
        status,
        created_at AS "createdAt"
      FROM orders
      ORDER BY created_at DESC
      LIMIT 4
    `),
    pool.query(`
      SELECT category, COALESCE(SUM(amount),0)::FLOAT8 AS revenue
      FROM orders
      WHERE status = 'done'
      GROUP BY category
      ORDER BY revenue DESC
    `)
  ]);

  res.json({
    ok: true,
    data: {
      totalOrders: ordersCount.rows[0]?.count || 0,
      pendingOrders: pendingCount.rows[0]?.count || 0,
      totalRevenue: revenueSum.rows[0]?.total || 0,
      totalUsers: usersCount.rows[0]?.count || 0,
      totalReferrals: referralsCount.rows[0]?.count || 0,
      todayOrders: todayOrders.rows[0]?.count || 0,
      topProducts: topProducts.rows,
      weeklySales: weeklySales.rows,
      recentActivity: recentActivity.rows,
      latestOrders: latestOrders.rows,
      revenueByCategory: revenueByCategory.rows
    }
  });
});

app.get("/api/admin/orders", requireAdminWebApp, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 30), 1), 100);
  const status = String(req.query.status || "all").trim();
  const search = String(req.query.search || "").trim();
  const where = [];
  const params = [];

  if (status !== "all") {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(id ILIKE $${params.length} OR telegram_id ILIKE $${params.length} OR product_title ILIKE $${params.length})`);
  }

  params.push(limit);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `
    SELECT
      id,
      telegram_id AS "telegramId",
      product_id AS "productId",
      product_title AS "productTitle",
      amount::FLOAT8 AS amount,
      game_uid AS "gameUid",
      player_nickname AS "playerNickname",
      receipt_image AS "receiptImage",
      payment_card AS "paymentCard",
      payment_status AS "paymentStatus",
      category,
      status,
      created_at AS "createdAt"
    FROM orders
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${params.length}
    `,
    params
  );

  res.json({ ok: true, data: rows });
});

app.patch("/api/admin/orders/:id/status", requireAdminWebApp, async (req, res) => {
  const allowed = new Set(["pending", "processing", "done", "cancelled"]);
  const allowedPaymentStatus = new Set([
    "uploaded",
    "processing",
    "approved",
    "cancelled",
    "id_error",
    "fake_receipt"
  ]);
  const id = String(req.params.id);
  const current = await pool.query(`SELECT status, payment_status FROM orders WHERE id = $1`, [id]);
  if (!current.rows[0]) {
    return res.status(404).json({ ok: false, message: "Order topilmadi." });
  }
  const row = current.rows[0];

  const statusRaw = req.body?.status != null ? String(req.body.status).trim() : String(row.status || "pending");
  const paymentStatusRaw = req.body?.paymentStatus != null
    ? String(req.body.paymentStatus).trim()
    : String(row.payment_status || "uploaded");

  if (!allowed.has(statusRaw)) {
    return res.status(400).json({ ok: false, message: "Noto'g'ri status." });
  }
  if (!allowedPaymentStatus.has(paymentStatusRaw)) {
    return res.status(400).json({ ok: false, message: "Noto'g'ri paymentStatus." });
  }

  const { rows } = await pool.query(
    `
    UPDATE orders
    SET status = $1, payment_status = $2, updated_at = NOW()
    WHERE id = $3
    RETURNING
      id,
      telegram_id AS "telegramId",
      product_title AS "productTitle",
      amount::FLOAT8 AS amount,
      status,
      payment_status AS "paymentStatus",
      created_at AS "createdAt"
    `,
    [statusRaw, paymentStatusRaw, id]
  );

  res.json({ ok: true, data: rows[0] });
});

app.post("/api/admin/orders", requireAdminWebApp, async (req, res) => {
  const telegramId = String(req.body?.telegramId || "").trim();
  const productTitle = String(req.body?.productTitle || "").trim();
  const amount = Number(req.body?.amount || 0);
  if (!telegramId || !productTitle || !amount) {
    return res.status(400).json({ ok: false, message: "telegramId, productTitle, amount majburiy." });
  }

  const order = {
    id: `ORD-${Date.now()}`,
    telegramId,
    productId: String(req.body?.productId || "manual"),
    productTitle,
    amount,
    gameUid: req.body?.gameUid ? String(req.body.gameUid) : null,
    playerNickname: req.body?.playerNickname ? String(req.body.playerNickname) : null,
    category: String(req.body?.category || "manual"),
    status: String(req.body?.status || "pending"),
    paymentStatus: String(req.body?.paymentStatus || "uploaded")
  };

  await pool.query(
    `
    INSERT INTO orders (
      id, telegram_id, product_id, product_title, amount, game_uid, player_nickname, category, status, payment_status, created_at, updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
    `,
    [
      order.id,
      order.telegramId,
      order.productId,
      order.productTitle,
      order.amount,
      order.gameUid,
      order.playerNickname,
      order.category,
      order.status,
      order.paymentStatus
    ]
  );

  res.status(201).json({ ok: true, data: order });
});

app.delete("/api/admin/orders/:id", requireAdminWebApp, async (req, res) => {
  const { rowCount } = await pool.query(`DELETE FROM orders WHERE id = $1`, [String(req.params.id)]);
  if (!rowCount) return res.status(404).json({ ok: false, message: "Order topilmadi." });
  res.json({ ok: true });
});

app.get("/api/admin/referrals", requireAdminWebApp, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const { rows } = await pool.query(
    `
    SELECT
      referrer_id AS "referrerId",
      invited_id AS "invitedId",
      invited_first_name AS "firstName",
      invited_last_name AS "lastName",
      invited_username AS "username",
      created_at AS "createdAt"
    FROM referrals
    ORDER BY created_at DESC
    LIMIT $1
    `,
    [limit]
  );

  const data = rows.map((row) => {
    const fullName = `${row.firstName || ""} ${row.lastName || ""}`.trim();
    return {
      ...row,
      displayName: fullName || (row.username ? `@${row.username}` : `ID ${row.invitedId}`)
    };
  });

  res.json({ ok: true, data });
});

app.get("/api/admin/catalog", requireAdminWebApp, async (req, res) => {
  const data = await fetchCatalogData({ includeInactive: true });
  const categories = Object.entries(data)
    .filter(([key, list]) => key !== "tg" && key !== "categoryMeta" && Array.isArray(list))
    .map(([key, list]) => ({
    key,
    count: Array.isArray(list) ? list.length : 0
  }));
  res.json({ ok: true, data: { categories, catalog: data } });
});

app.get("/api/admin/categories", requireAdminWebApp, async (req, res) => {
  const rows = await getCatalogCategoriesSetting();
  res.json({ ok: true, data: rows.filter((item) => item.key !== "tg") });
});

app.post("/api/admin/categories", requireAdminWebApp, async (req, res) => {
  const payload = normalizeCatalogCategory(req.body || {});
  if (!payload.name) return res.status(400).json({ ok: false, message: "Kategoriya nomi majburiy." });
  const rows = await getCatalogCategoriesSetting();
  if (rows.some((item) => item.key === payload.key)) {
    return res.status(409).json({ ok: false, message: "Bu kategoriya mavjud." });
  }
  const saved = await setCatalogCategoriesSetting([...rows, payload]);
  res.status(201).json({ ok: true, data: saved.find((item) => item.key === payload.key) || payload });
});

app.patch("/api/admin/categories/:key", requireAdminWebApp, async (req, res) => {
  const key = slugifyCategoryKey(req.params.key);
  const rows = await getCatalogCategoriesSetting();
  const idx = rows.findIndex((item) => item.key === key);
  if (idx < 0) {
    return res.status(404).json({ ok: false, message: "Kategoriya topilmadi." });
  }
  const next = normalizeCatalogCategory({
    ...rows[idx],
    ...req.body,
    key
  });
  rows[idx] = next;
  await setCatalogCategoriesSetting(rows);
  res.json({ ok: true, data: next });
});

app.delete("/api/admin/categories/:key", requireAdminWebApp, async (req, res) => {
  const key = slugifyCategoryKey(req.params.key);
  const rows = await getCatalogCategoriesSetting();
  const next = rows.filter((item) => item.key !== key);
  if (next.length === rows.length) {
    return res.status(404).json({ ok: false, message: "Kategoriya topilmadi." });
  }
  await setCatalogCategoriesSetting(next);
  res.json({ ok: true });
});

app.get("/api/admin/products", requireAdminWebApp, async (req, res) => {
  const hotSet = await getHotProductsSetting();
  const { rows } = await pool.query(
    `
    SELECT
      id,
      category,
      title,
      price::FLOAT8 AS price,
      qty,
      icon,
      description,
      active,
      sort_order AS "sortOrder",
      created_at AS "createdAt"
    FROM catalog_products
    ORDER BY category ASC, sort_order ASC, created_at ASC
    `
  );
  res.json({
    ok: true,
    data: rows.map((row) => ({
      ...row,
      hot: hotSet.has(String(row.id))
    }))
  });
});

app.get("/api/admin/accounts", requireAdminWebApp, async (req, res) => {
  const { rows } = await pool.query(
    `
    SELECT
      id,
      title,
      price::FLOAT8 AS price,
      level,
      active,
      meta,
      created_at AS "createdAt"
    FROM catalog_accounts
    ORDER BY created_at ASC
    `
  );
  res.json({ ok: true, data: rows });
});

app.post("/api/admin/products", requireAdminWebApp, async (req, res) => {
  const categoryRaw = String(req.body?.category || "").trim().toLowerCase();
  const category = categoryRaw === "tg" ? "telegram" : categoryRaw;
  if (!category) return res.status(400).json({ ok: false, message: "category majburiy." });

  const title = String(req.body?.title || "").trim();
  if (!title) return res.status(400).json({ ok: false, message: "title majburiy." });

  const price = Number(req.body?.price || 0);
  const qty = Number(req.body?.qty || 0);
  const sortOrder = Number(req.body?.sortOrder || 0);
  const icon = String(req.body?.icon || "assets/img/logo.JPG").trim() || "assets/img/logo.JPG";
  const description = String(req.body?.description || "").trim();
  const active = req.body?.active !== false;
  const hot = req.body?.hot === true;
  const id = String(req.body?.id || crypto.randomUUID());

  const { rows } = await pool.query(
    `
    INSERT INTO catalog_products (id, category, title, price, qty, icon, description, active, sort_order)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING id, category, title, price::FLOAT8 AS price, qty, icon, description, active, sort_order AS "sortOrder"
    `,
    [id, category, title, price, qty, icon, description, active, sortOrder]
  );

  if (hot) {
    const hotSet = await getHotProductsSetting();
    hotSet.add(String(id));
    await setHotProductsSetting([...hotSet]);
  }
  res.status(201).json({ ok: true, data: { ...rows[0], hot } });
});

app.patch("/api/admin/products/:id", requireAdminWebApp, async (req, res) => {
  const id = String(req.params.id);
  const current = await pool.query(`SELECT * FROM catalog_products WHERE id = $1`, [id]);
  if (!current.rows[0]) {
    return res.status(404).json({ ok: false, message: "Product topilmadi." });
  }

  const row = current.rows[0];
  const categoryRaw = req.body?.category != null ? String(req.body.category).trim().toLowerCase() : row.category;
  const category = categoryRaw === "tg" ? "telegram" : categoryRaw;
  if (!category) return res.status(400).json({ ok: false, message: "category majburiy." });

  const title = req.body?.title != null ? String(req.body.title).trim() : row.title;
  const price = req.body?.price != null ? Number(req.body.price) : Number(row.price);
  const qty = req.body?.qty != null ? Number(req.body.qty) : Number(row.qty);
  const icon = req.body?.icon != null ? String(req.body.icon).trim() : String(row.icon || "assets/img/logo.JPG");
  const description = req.body?.description != null ? String(req.body.description).trim() : String(row.description || "");
  const sortOrder = req.body?.sortOrder != null ? Number(req.body.sortOrder) : Number(row.sort_order);
  const active = req.body?.active != null ? Boolean(req.body.active) : Boolean(row.active);
  const hot = req.body?.hot != null ? req.body.hot === true : null;

  const { rows } = await pool.query(
    `
    UPDATE catalog_products
    SET category = $1, title = $2, price = $3, qty = $4, icon = $5, description = $6, sort_order = $7, active = $8
    WHERE id = $9
    RETURNING id, category, title, price::FLOAT8 AS price, qty, icon, description, active, sort_order AS "sortOrder"
    `,
    [category, title, price, qty, icon || "assets/img/logo.JPG", description, sortOrder, active, id]
  );

  if (hot != null) {
    const hotSet = await getHotProductsSetting();
    if (hot) hotSet.add(String(id));
    else hotSet.delete(String(id));
    await setHotProductsSetting([...hotSet]);
  }
  const hotSet = await getHotProductsSetting();
  res.json({ ok: true, data: { ...rows[0], hot: hotSet.has(String(id)) } });
});

app.delete("/api/admin/products/:id", requireAdminWebApp, async (req, res) => {
  const productId = String(req.params.id);
  const { rowCount } = await pool.query(`DELETE FROM catalog_products WHERE id = $1`, [productId]);
  if (!rowCount) return res.status(404).json({ ok: false, message: "Product topilmadi." });
  const hotSet = await getHotProductsSetting();
  if (hotSet.has(productId)) {
    hotSet.delete(productId);
    await setHotProductsSetting([...hotSet]);
  }
  res.json({ ok: true });
});

app.post("/api/admin/accounts", requireAdminWebApp, async (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) return res.status(400).json({ ok: false, message: "title majburiy." });

  const id = String(req.body?.id || crypto.randomUUID());
  const price = Number(req.body?.price || 0);
  const level = req.body?.level != null && req.body.level !== "" ? Number(req.body.level) : null;
  const active = req.body?.active !== false;

  const reserved = new Set(["id", "title", "price", "level", "active"]);
  const meta = {};
  Object.keys(req.body || {}).forEach((k) => {
    if (!reserved.has(k)) meta[k] = req.body[k];
  });

  const { rows } = await pool.query(
    `
    INSERT INTO catalog_accounts (id, title, price, level, active, meta)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb)
    RETURNING id, title, price::FLOAT8 AS price, level, active, meta
    `,
    [id, title, price, level, active, JSON.stringify(meta)]
  );

  res.status(201).json({ ok: true, data: rows[0] });
});

app.patch("/api/admin/accounts/:id", requireAdminWebApp, async (req, res) => {
  const id = String(req.params.id);
  const current = await pool.query(`SELECT * FROM catalog_accounts WHERE id = $1`, [id]);
  if (!current.rows[0]) {
    return res.status(404).json({ ok: false, message: "Account topilmadi." });
  }

  const row = current.rows[0];
  const title = req.body?.title != null ? String(req.body.title).trim() : row.title;
  const price = req.body?.price != null ? Number(req.body.price) : Number(row.price);
  const level = req.body?.level != null ? (req.body.level === "" ? null : Number(req.body.level)) : row.level;
  const active = req.body?.active != null ? Boolean(req.body.active) : Boolean(row.active);

  const reserved = new Set(["id", "title", "price", "level", "active"]);
  const nextMeta = { ...(row.meta || {}) };
  Object.keys(req.body || {}).forEach((k) => {
    if (!reserved.has(k)) nextMeta[k] = req.body[k];
  });

  const { rows } = await pool.query(
    `
    UPDATE catalog_accounts
    SET title = $1, price = $2, level = $3, active = $4, meta = $5::jsonb
    WHERE id = $6
    RETURNING id, title, price::FLOAT8 AS price, level, active, meta
    `,
    [title, price, level, active, JSON.stringify(nextMeta), id]
  );

  res.json({ ok: true, data: rows[0] });
});

app.delete("/api/admin/accounts/:id", requireAdminWebApp, async (req, res) => {
  const { rowCount } = await pool.query(`DELETE FROM catalog_accounts WHERE id = $1`, [String(req.params.id)]);
  if (!rowCount) return res.status(404).json({ ok: false, message: "Account topilmadi." });
  res.json({ ok: true });
});

app.get("/api/admin/users", requireAdminWebApp, async (req, res) => {
  const limitRaw = req.query.limit;
  const hasLimit = limitRaw != null && String(limitRaw).trim() !== "";
  const parsedLimit = Number(limitRaw);
  const limit = hasLimit && Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 5000)
    : null;
  const search = String(req.query.search || "").trim();
  const params = [];
  let whereSql = "";
  if (search) {
    params.push(`%${search}%`);
    whereSql = `WHERE (au.telegram_id ILIKE $1 OR au.username ILIKE $1 OR au.first_name ILIKE $1 OR au.last_name ILIKE $1)`;
  }
  let limitSql = "";
  if (limit != null) {
    params.push(limit);
    limitSql = `LIMIT $${params.length}`;
  }

  const { rows } = await pool.query(
    `
    WITH referral_only AS (
      SELECT DISTINCT ON (r.invited_id)
        r.invited_id AS telegram_id,
        r.invited_first_name AS first_name,
        r.invited_last_name AS last_name,
        r.invited_username AS username,
        r.created_at
      FROM referrals r
      LEFT JOIN users u ON u.telegram_id = r.invited_id
      WHERE u.telegram_id IS NULL
      ORDER BY r.invited_id, r.created_at DESC
    ),
    all_users AS (
      SELECT
        u.telegram_id,
        u.first_name,
        u.last_name,
        u.username,
        COALESCE(u.balance,0)::NUMERIC AS balance,
        COALESCE(u.banned,false) AS banned,
        u.created_at
      FROM users u
      UNION ALL
      SELECT
        ro.telegram_id,
        ro.first_name,
        ro.last_name,
        ro.username,
        0::NUMERIC AS balance,
        false AS banned,
        ro.created_at
      FROM referral_only ro
    )
    SELECT
      au.telegram_id AS "telegramId",
      au.first_name AS "firstName",
      au.last_name AS "lastName",
      au.username,
      au.balance::FLOAT8 AS balance,
      au.banned,
      au.created_at AS "createdAt",
      COALESCE(COUNT(o.id) FILTER (
        WHERE COALESCE(o.status, '') NOT IN ('cancelled', 'canceled')
      ), 0)::INT AS "ordersCount",
      COALESCE(SUM(o.amount) FILTER (
        WHERE COALESCE(o.status, '') NOT IN ('cancelled', 'canceled')
      ),0)::FLOAT8 AS "totalSpent",
      MAX(o.created_at) AS "lastOrderAt"
    FROM all_users au
    LEFT JOIN orders o ON o.telegram_id = au.telegram_id
    ${whereSql}
    GROUP BY au.telegram_id, au.first_name, au.last_name, au.username, au.balance, au.banned, au.created_at
    ORDER BY "lastOrderAt" DESC NULLS LAST, au.created_at DESC
    ${limitSql}
    `,
    params
  );

  res.json({ ok: true, data: rows });
});

app.post("/api/admin/users", requireAdminWebApp, async (req, res) => {
  const telegramId = String(req.body?.telegramId || "").trim();
  if (!telegramId) return res.status(400).json({ ok: false, message: "telegramId majburiy." });

  const firstName = req.body?.firstName ? String(req.body.firstName) : null;
  const lastName = req.body?.lastName ? String(req.body.lastName) : null;
  const username = req.body?.username ? String(req.body.username).replace(/^@/, "") : null;
  const balance = Number(req.body?.balance || 0);
  const banned = Boolean(req.body?.banned || false);

  const { rows } = await pool.query(
    `
    INSERT INTO users (telegram_id, first_name, last_name, username, balance, banned, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
    ON CONFLICT (telegram_id)
    DO UPDATE SET
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      username = EXCLUDED.username,
      balance = EXCLUDED.balance,
      banned = EXCLUDED.banned,
      updated_at = NOW()
    RETURNING telegram_id AS "telegramId", first_name AS "firstName", last_name AS "lastName", username, balance::FLOAT8 AS balance, banned
    `,
    [telegramId, firstName, lastName, username, balance, banned]
  );

  res.status(201).json({ ok: true, data: rows[0] });
});

app.patch("/api/admin/users/:telegramId", requireAdminWebApp, async (req, res) => {
  const telegramId = String(req.params.telegramId);
  const current = await pool.query(`SELECT * FROM users WHERE telegram_id = $1`, [telegramId]);
  if (!current.rows[0]) return res.status(404).json({ ok: false, message: "User topilmadi." });
  const row = current.rows[0];

  const firstName = req.body?.firstName != null ? String(req.body.firstName) : row.first_name;
  const lastName = req.body?.lastName != null ? String(req.body.lastName) : row.last_name;
  const username = req.body?.username != null ? String(req.body.username).replace(/^@/, "") : row.username;
  const balance = req.body?.balance != null ? Number(req.body.balance) : Number(row.balance);
  const banned = req.body?.banned != null ? Boolean(req.body.banned) : Boolean(row.banned);

  const { rows } = await pool.query(
    `
    UPDATE users
    SET first_name = $1, last_name = $2, username = $3, balance = $4, banned = $5, updated_at = NOW()
    WHERE telegram_id = $6
    RETURNING telegram_id AS "telegramId", first_name AS "firstName", last_name AS "lastName", username, balance::FLOAT8 AS balance, banned
    `,
    [firstName, lastName, username, balance, banned, telegramId]
  );

  res.json({ ok: true, data: rows[0] });
});

app.post("/api/admin/users/balance-adjust", requireAdminWebApp, async (req, res) => {
  const identifierRaw = String(req.body?.identifier || "").trim();
  const mode = String(req.body?.mode || "").trim().toLowerCase();
  const amount = Number(req.body?.amount || 0);
  if (!identifierRaw) {
    return res.status(400).json({ ok: false, message: "identifier majburiy (telegramId yoki @username)." });
  }
  if (!["add", "subtract"].includes(mode)) {
    return res.status(400).json({ ok: false, message: "mode add yoki subtract bo'lishi kerak." });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ ok: false, message: "amount musbat son bo'lishi kerak." });
  }

  const identifier = identifierRaw.replace(/^@/, "");
  const sign = mode === "add" ? 1 : -1;
  const delta = sign * amount;

  const { rows } = await pool.query(
    `
    UPDATE users
    SET
      balance = GREATEST(0, COALESCE(balance, 0) + $1),
      updated_at = NOW()
    WHERE telegram_id = $2 OR LOWER(COALESCE(username, '')) = LOWER($3)
    RETURNING
      telegram_id AS "telegramId",
      first_name AS "firstName",
      last_name AS "lastName",
      username,
      balance::FLOAT8 AS balance
    `,
    [delta, identifierRaw, identifier]
  );

  if (!rows[0]) {
    return res.status(404).json({ ok: false, message: "User topilmadi (ID yoki username xato)." });
  }

  res.json({ ok: true, data: rows[0] });
});

app.patch("/api/admin/users/:telegramId/ban", requireAdminWebApp, async (req, res) => {
  const telegramId = String(req.params.telegramId);
  const banned = Boolean(req.body?.banned);
  const { rows } = await pool.query(
    `
    UPDATE users
    SET banned = $1, updated_at = NOW()
    WHERE telegram_id = $2
    RETURNING telegram_id AS "telegramId", banned
    `,
    [banned, telegramId]
  );
  if (!rows[0]) return res.status(404).json({ ok: false, message: "User topilmadi." });
  res.json({ ok: true, data: rows[0] });
});

app.get("/api/admin/settings/referral", requireAdminWebApp, async (req, res) => {
  const value = await getSetting("referral", {
    bonusPerInvite: REFERRAL_BONUS_PER_USER,
    minWithdraw: 50,
    enabled: true
  });
  res.json({ ok: true, data: value });
});

app.put("/api/admin/settings/referral", requireAdminWebApp, async (req, res) => {
  const nextValue = {
    bonusPerInvite: Number(req.body?.bonusPerInvite || REFERRAL_BONUS_PER_USER),
    minWithdraw: Number(req.body?.minWithdraw || 50),
    enabled: req.body?.enabled !== false
  };
  await setSetting("referral", nextValue);
  res.json({ ok: true, data: nextValue });
});

app.get("/api/admin/settings/system", requireAdminWebApp, async (req, res) => {
  const value = await getSetting("system", {
    maintenanceMode: false,
    newOrderNotification: true,
    autoDelivery: false
  });
  res.json({ ok: true, data: value });
});

app.put("/api/admin/settings/system", requireAdminWebApp, async (req, res) => {
  const nextValue = {
    maintenanceMode: Boolean(req.body?.maintenanceMode),
    newOrderNotification: req.body?.newOrderNotification !== false,
    autoDelivery: Boolean(req.body?.autoDelivery)
  };
  await setSetting("system", nextValue);
  res.json({ ok: true, data: nextValue });
});

app.get("/api/admin/settings/payment", requireAdminWebApp, async (req, res) => {
  const value = normalizePaymentConfig(await getSetting("payment", DEFAULT_PAYMENT_CONFIG));
  res.json({ ok: true, data: value });
});

app.put("/api/admin/settings/payment", requireAdminWebApp, async (req, res) => {
  const nextValue = normalizePaymentConfig(req.body || {});
  await setSetting("payment", nextValue);
  res.json({ ok: true, data: nextValue });
});

app.get("/api/payment-config", async (req, res) => {
  const value = normalizePaymentConfig(await getSetting("payment", DEFAULT_PAYMENT_CONFIG));
  res.json({ ok: true, data: value });
});

app.get("/api/device-settings", async (req, res) => {
  const rows = await getDeviceSettingsSetting();
  res.json({ ok: true, data: rows });
});

app.get("/api/hero-banners", async (req, res) => {
  const rows = await getHeroBannersSetting();
  res.json({ ok: true, data: rows });
});

app.get("/api/news", async (req, res) => {
  const rows = await getHomeNewsSetting({ includeInactive: false });
  res.json({ ok: true, data: rows });
});

app.get("/api/admin/mandatory-channels", requireAdminWebApp, async (req, res) => {
  const rows = await getMandatoryChannelsSetting();
  res.json({ ok: true, data: rows });
});

app.post("/api/admin/mandatory-channels", requireAdminWebApp, async (req, res) => {
  const next = normalizeMandatoryChannel(req.body || {});
  if (!next.title) return res.status(400).json({ ok: false, message: "Kanal nomi majburiy." });
  if (!next.username && !next.url) return res.status(400).json({ ok: false, message: "Username yoki URL majburiy." });

  const rows = await getMandatoryChannelsSetting();
  rows.unshift(next);
  const saved = await setMandatoryChannelsSetting(rows);
  res.status(201).json({ ok: true, data: saved.find((x) => x.id === next.id) || next });
});

app.patch("/api/admin/mandatory-channels/:id", requireAdminWebApp, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ ok: false, message: "id majburiy." });

  const rows = await getMandatoryChannelsSetting();
  const idx = rows.findIndex((x) => String(x.id) === id);
  if (idx < 0) return res.status(404).json({ ok: false, message: "Kanal topilmadi." });

  const merged = {
    ...rows[idx],
    ...req.body,
    id
  };
  rows[idx] = normalizeMandatoryChannel(merged);
  if (!rows[idx].title) return res.status(400).json({ ok: false, message: "Kanal nomi majburiy." });
  if (!rows[idx].username && !rows[idx].url) return res.status(400).json({ ok: false, message: "Username yoki URL majburiy." });

  const saved = await setMandatoryChannelsSetting(rows);
  res.json({ ok: true, data: saved.find((x) => x.id === id) || rows[idx] });
});

app.delete("/api/admin/mandatory-channels/:id", requireAdminWebApp, async (req, res) => {
  const id = String(req.params.id || "").trim();
  const rows = await getMandatoryChannelsSetting();
  const next = rows.filter((x) => String(x.id) !== id);
  if (next.length === rows.length) return res.status(404).json({ ok: false, message: "Kanal topilmadi." });
  await setMandatoryChannelsSetting(next);
  res.json({ ok: true });
});

app.get("/api/admin/device-settings", requireAdminWebApp, async (req, res) => {
  const rows = await getDeviceSettingsSetting();
  res.json({ ok: true, data: rows });
});

app.post("/api/admin/device-settings", requireAdminWebApp, async (req, res) => {
  const next = normalizeDeviceSetting(req.body || {});
  if (!next.brand) return res.status(400).json({ ok: false, message: "Brand majburiy." });
  if (!next.model) return res.status(400).json({ ok: false, message: "Model majburiy." });

  const rows = await getDeviceSettingsSetting();
  rows.unshift(next);
  const saved = await setDeviceSettingsSetting(rows);
  res.status(201).json({ ok: true, data: saved.find((x) => x.id === next.id) || next });
});

app.patch("/api/admin/device-settings/:id", requireAdminWebApp, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ ok: false, message: "id majburiy." });

  const rows = await getDeviceSettingsSetting();
  const idx = rows.findIndex((x) => String(x.id) === id);
  if (idx < 0) return res.status(404).json({ ok: false, message: "Device setting topilmadi." });

  const merged = {
    ...rows[idx],
    ...req.body,
    id
  };
  rows[idx] = normalizeDeviceSetting(merged);
  if (!rows[idx].brand) return res.status(400).json({ ok: false, message: "Brand majburiy." });
  if (!rows[idx].model) return res.status(400).json({ ok: false, message: "Model majburiy." });

  const saved = await setDeviceSettingsSetting(rows);
  res.json({ ok: true, data: saved.find((x) => x.id === id) || rows[idx] });
});

app.delete("/api/admin/device-settings/:id", requireAdminWebApp, async (req, res) => {
  const id = String(req.params.id || "").trim();
  const rows = await getDeviceSettingsSetting();
  const next = rows.filter((x) => String(x.id) !== id);
  if (next.length === rows.length) return res.status(404).json({ ok: false, message: "Device setting topilmadi." });
  await setDeviceSettingsSetting(next);
  res.json({ ok: true });
});

app.get("/api/admin/hero-banners", requireAdminWebApp, async (req, res) => {
  const rows = await getHeroBannersSetting();
  res.json({ ok: true, data: rows });
});

app.post("/api/admin/hero-banners", requireAdminWebApp, async (req, res) => {
  const next = normalizeHeroBanner(req.body || {});
  if (!next.title) return res.status(400).json({ ok: false, message: "title majburiy." });
  if (!next.image) return res.status(400).json({ ok: false, message: "image majburiy." });
  if (!next.actionTarget) return res.status(400).json({ ok: false, message: "actionTarget majburiy." });

  const rows = await getHeroBannersSetting();
  rows.push(next);
  const saved = await setHeroBannersSetting(rows);
  res.status(201).json({ ok: true, data: saved.find((x) => x.id === next.id) || next });
});

app.patch("/api/admin/hero-banners/:id", requireAdminWebApp, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ ok: false, message: "id majburiy." });

  const rows = await getHeroBannersSetting();
  const idx = rows.findIndex((x) => String(x.id) === id);
  if (idx < 0) return res.status(404).json({ ok: false, message: "Banner topilmadi." });

  const merged = {
    ...rows[idx],
    ...req.body,
    id
  };
  rows[idx] = normalizeHeroBanner(merged);
  if (!rows[idx].title) return res.status(400).json({ ok: false, message: "title majburiy." });
  if (!rows[idx].image) return res.status(400).json({ ok: false, message: "image majburiy." });
  if (!rows[idx].actionTarget) return res.status(400).json({ ok: false, message: "actionTarget majburiy." });

  const saved = await setHeroBannersSetting(rows);
  res.json({ ok: true, data: saved.find((x) => x.id === id) || rows[idx] });
});

app.delete("/api/admin/hero-banners/:id", requireAdminWebApp, async (req, res) => {
  const id = String(req.params.id || "").trim();
  const rows = await getHeroBannersSetting();
  const next = rows.filter((x) => String(x.id) !== id);
  if (next.length === rows.length) return res.status(404).json({ ok: false, message: "Banner topilmadi." });
  await setHeroBannersSetting(next);
  res.json({ ok: true });
});

app.get("/api/admin/news", requireAdminWebApp, async (req, res) => {
  const rows = await getHomeNewsSetting({ includeInactive: true });
  res.json({ ok: true, data: rows });
});

app.post("/api/admin/news", requireAdminWebApp, async (req, res) => {
  const next = normalizeHomeNews(req.body || {});
  if (!next.title) return res.status(400).json({ ok: false, message: "title majburiy." });

  const rows = await getHomeNewsSetting({ includeInactive: true });
  rows.unshift(next);
  const saved = await setHomeNewsSetting(rows);
  res.status(201).json({ ok: true, data: saved.find((x) => x.id === next.id) || next });
});

app.patch("/api/admin/news/:id", requireAdminWebApp, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ ok: false, message: "id majburiy." });

  const rows = await getHomeNewsSetting({ includeInactive: true });
  const idx = rows.findIndex((x) => String(x.id) === id);
  if (idx < 0) return res.status(404).json({ ok: false, message: "Yangilik topilmadi." });

  const merged = {
    ...rows[idx],
    ...req.body,
    id
  };
  rows[idx] = normalizeHomeNews(merged);
  if (!rows[idx].title) return res.status(400).json({ ok: false, message: "title majburiy." });

  const saved = await setHomeNewsSetting(rows);
  res.json({ ok: true, data: saved.find((x) => x.id === id) || rows[idx] });
});

app.delete("/api/admin/news/:id", requireAdminWebApp, async (req, res) => {
  const id = String(req.params.id || "").trim();
  const rows = await getHomeNewsSetting({ includeInactive: true });
  const next = rows.filter((x) => String(x.id) !== id);
  if (next.length === rows.length) return res.status(404).json({ ok: false, message: "Yangilik topilmadi." });
  await setHomeNewsSetting(next);
  res.json({ ok: true });
});

app.get("/api/admin/referrals/analytics", requireAdminWebApp, async (req, res) => {
  const setting = await getSetting("referral", { bonusPerInvite: REFERRAL_BONUS_PER_USER });
  const bonusPerInvite = Number(setting?.bonusPerInvite || REFERRAL_BONUS_PER_USER);

  const [totals, activeReferrers, topReferrers, recentRows] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::INT AS "totalReferrals",
        COUNT(DISTINCT referrer_id)::INT AS "activeReferrers"
      FROM referrals
    `),
    pool.query(`
      SELECT COUNT(DISTINCT referrer_id)::INT AS count
      FROM referrals
      WHERE created_at >= (NOW() - INTERVAL '30 day')
    `),
    pool.query(`
      SELECT
        referrer_id AS "referrerId",
        COUNT(*)::INT AS invites
      FROM referrals
      GROUP BY referrer_id
      ORDER BY invites DESC
      LIMIT 6
    `),
    pool.query(`
      SELECT
        referrer_id AS "referrerId",
        invited_id AS "invitedId",
        invited_first_name AS "firstName",
        invited_last_name AS "lastName",
        invited_username AS "username",
        created_at AS "createdAt"
      FROM referrals
      ORDER BY created_at DESC
      LIMIT 50
    `)
  ]);

  const totalReferrals = totals.rows[0]?.totalReferrals || 0;
  const activeCount = totals.rows[0]?.activeReferrers || 0;
  const conversionBase = activeReferrers.rows[0]?.count || 0;
  const conversion = conversionBase ? Math.round((totalReferrals / conversionBase) * 100) : 0;

  const top = topReferrers.rows.map((row) => ({
    referrerId: row.referrerId,
    invites: Number(row.invites || 0),
    bonus: Number(row.invites || 0) * bonusPerInvite
  }));

  const recent = recentRows.rows.map((row) => {
    const fullName = `${row.firstName || ""} ${row.lastName || ""}`.trim();
    return {
      referrerId: row.referrerId,
      invitedId: row.invitedId,
      displayName: fullName || (row.username ? `@${row.username}` : `ID ${row.invitedId}`),
      username: row.username || null,
      bonus: bonusPerInvite,
      status: "done",
      createdAt: row.createdAt
    };
  });

  res.json({
    ok: true,
    data: {
      totalReferrals,
      totalBonus: totalReferrals * bonusPerInvite,
      activeReferrers: activeCount,
      conversion,
      bonusPerInvite,
      topReferrers: top,
      recent
    }
  });
});

app.post("/api/orders", async (req, res) => {
  const {
    telegramId,
    productId,
    productTitle,
    amount,
    gameUid,
    category,
    playerNickname,
    receiptImage,
    paymentCard,
    userFirstName,
    userLastName,
    userUsername
  } = req.body || {};

  if (!telegramId || !productId || !productTitle || !amount) {
    return res.status(400).json({ ok: false, message: "Majburiy maydonlar to'ldirilmagan." });
  }

  const systemSettings = await getSetting("system", { maintenanceMode: false });
  if (systemSettings?.maintenanceMode) {
    return res.status(503).json({ ok: false, message: "Texnik ishlar rejimi yoqilgan." });
  }

  if (!receiptImage) {
    return res.status(400).json({ ok: false, message: "Chek yuklanishi shart." });
  }

  const paymentConfig = normalizePaymentConfig(await getSetting("payment", DEFAULT_PAYMENT_CONFIG));
  const order = {
    id: `ORD-${Date.now()}`,
    telegramId: String(telegramId),
    productId: String(productId),
    productTitle: String(productTitle),
    amount: Number(amount),
    gameUid: gameUid ? String(gameUid) : null,
    playerNickname: playerNickname ? String(playerNickname) : null,
    receiptImage: String(receiptImage),
    paymentCard: paymentCard ? String(paymentCard) : paymentConfig.cardNumber,
    paymentStatus: "uploaded",
    category: category ? String(category) : "unknown",
    status: "pending",
    createdAt: new Date().toISOString()
  };

  await upsertUserProfile({
    telegramId: order.telegramId,
    firstName: userFirstName,
    lastName: userLastName,
    username: userUsername
  });

  await pool.query(
    `
    INSERT INTO orders (
      id, telegram_id, product_id, product_title, amount, game_uid, player_nickname, receipt_image, payment_card, payment_status, category, status, created_at, updated_at
    )

    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
    `,
    [
      order.id,
      order.telegramId,
      order.productId,
      order.productTitle,
      order.amount,
      order.gameUid,
      order.playerNickname,
      order.receiptImage,
      order.paymentCard,
      order.paymentStatus,
      order.category,
      order.status,
      order.createdAt
    ]
  );

  if (app.locals.notifyNewOrder) {
    try {
      await app.locals.notifyNewOrder(order);
    } catch (error) {
      console.error("Admin notify error:", error.message);
    }
  }

  res.status(201).json({ ok: true, data: order });
});

app.get("/api/orders/:telegramId", async (req, res) => {
  const { rows } = await pool.query(
    `
    SELECT
      id,
      telegram_id AS "telegramId",
      product_id AS "productId",
      product_title AS "productTitle",
      amount::FLOAT8 AS amount,
      game_uid AS "gameUid",
      player_nickname AS "playerNickname",
      receipt_image AS "receiptImage",
      payment_card AS "paymentCard",
      payment_status AS "paymentStatus",
      category,
      status,
      created_at AS "createdAt"
    FROM orders
    WHERE telegram_id = $1
    ORDER BY created_at DESC
    `,
    [req.params.telegramId]
  );
  const data = rows;
  res.json({ ok: true, data });
});

app.get("/api/users/:telegramId/balance", async (req, res) => {
  const telegramId = String(req.params.telegramId || "").trim();
  if (!telegramId) {
    return res.status(400).json({ ok: false, message: "telegramId majburiy." });
  }
  const { rows } = await pool.query(
    `
    SELECT
      telegram_id AS "telegramId",
      username,
      COALESCE(balance,0)::FLOAT8 AS balance
    FROM users
    WHERE telegram_id = $1
    LIMIT 1
    `,
    [telegramId]
  );
  if (!rows[0]) {
    return res.json({ ok: true, data: { telegramId, balance: 0 } });
  }
  res.json({ ok: true, data: rows[0] });
});

app.post("/api/balance/redeem-diamonds", async (req, res) => {
  const telegramId = String(req.body?.telegramId || "").trim();
  const gameUid = String(req.body?.gameUid || "").trim();
  const productId = String(req.body?.productId || "").trim();
  if (!telegramId) {
    return res.status(400).json({ ok: false, message: "telegramId majburiy." });
  }
  if (!gameUid) {
    return res.status(400).json({ ok: false, message: "gameUid (UID) majburiy." });
  }
  if (!productId) {
    return res.status(400).json({ ok: false, message: "productId majburiy." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userRes = await client.query(
      `
      SELECT telegram_id, COALESCE(balance,0)::FLOAT8 AS balance
      FROM users
      WHERE telegram_id = $1
      FOR UPDATE
      `,
      [telegramId]
    );
    if (!userRes.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "User topilmadi." });
    }

    const balance = Number(userRes.rows[0].balance || 0);
    if (balance <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, message: "Almaz miqdori yetmaydi." });
    }

    const prodRes = await client.query(
      `
      SELECT id, title, qty
      FROM catalog_products
      WHERE category = 'diamonds' AND active = TRUE AND qty > 0 AND id = $1
      LIMIT 1
      `,
      [productId]
    );
    const product = prodRes.rows[0];
    if (!product) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, message: "Tanlangan Free Fire mahsuloti topilmadi." });
    }

    const spend = Number(product.qty || 0);
    if (balance < spend) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, message: "Almaz miqdori yetmaydi." });
    }
    const newBalance = Math.max(0, balance - spend);

    await client.query(
      `
      UPDATE users
      SET balance = $1, updated_at = NOW()
      WHERE telegram_id = $2
      `,
      [newBalance, telegramId]
    );

    const orderId = `ORD-${Date.now()}`;
    await client.query(
      `
      INSERT INTO orders (
        id, telegram_id, product_id, product_title, amount, game_uid, player_nickname, receipt_image, payment_card, payment_status, category, status, created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
      `,
      [
        orderId,
        telegramId,
        String(product.id),
        String(product.title),
        0,
        gameUid,
        null,
        null,
        "REFERRAL_BALANCE",
        "processing",
        "diamonds",
        "pending"
      ]
    );

    await client.query("COMMIT");

    if (app.locals.notifyNewOrder) {
      try {
        await app.locals.notifyNewOrder({
          id: orderId,
          telegramId,
          productId: String(product.id),
          productTitle: String(product.title),
          amount: 0,
          gameUid,
          playerNickname: null,
          receiptImage: null,
          paymentCard: "REFERRAL_BALANCE",
          paymentStatus: "processing",
          category: "diamonds",
          status: "pending",
          createdAt: new Date().toISOString()
        });
      } catch (error) {
        console.error("Admin notify error (redeem):", error.message);
      }
    }

    res.json({
      ok: true,
      data: {
        orderId,
        telegramId,
        gameUid,
        productId: String(product.id),
        productTitle: String(product.title),
        redeemedQty: spend,
        balanceBefore: balance,
        balanceAfter: newBalance
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: "Almaz chiqarishda xatolik.", detail: error.message });
  } finally {
    client.release();
  }
});

app.get("/api/referrals/:telegramId", async (req, res) => {
  const referrerId = String(req.params.telegramId);

  let { rows } = await pool.query(
    `
    SELECT
      invited_id AS "invitedId",
      invited_first_name AS "firstName",
      invited_last_name AS "lastName",
      invited_username AS "username",
      created_at AS "createdAt"
    FROM referrals
    WHERE referrer_id = $1
    ORDER BY created_at DESC
    `,
    [referrerId]
  );

  if (app.locals.bot) {
    const usersToHydrate = rows.filter((r) => !r.firstName && !r.lastName && !r.username);
    for (const row of usersToHydrate) {
      try {
        const chat = await app.locals.bot.telegram.getChat(Number(row.invitedId));
        const firstName = chat?.first_name || null;
        const lastName = chat?.last_name || null;
        const username = chat?.username || null;

        await pool.query(
          `
          UPDATE referrals
          SET invited_first_name = $1, invited_last_name = $2, invited_username = $3
          WHERE referrer_id = $4 AND invited_id = $5
          `,
          [firstName, lastName, username, referrerId, String(row.invitedId)]
        );
      } catch {
        // Skip users for whom chat info is unavailable.
      }
    }

    if (usersToHydrate.length > 0) {
      const refreshed = await pool.query(
        `
        SELECT
          invited_id AS "invitedId",
          invited_first_name AS "firstName",
          invited_last_name AS "lastName",
          invited_username AS "username",
          created_at AS "createdAt"
        FROM referrals
        WHERE referrer_id = $1
        ORDER BY created_at DESC
        `,
        [referrerId]
      );
      rows = refreshed.rows;
    }
  }
  const invitedUsers = rows.map((r) => {
    const fullName = `${r.firstName || ""} ${r.lastName || ""}`.trim();
    return {
      invitedId: String(r.invitedId),
      firstName: r.firstName || null,
      lastName: r.lastName || null,
      username: r.username || null,
      displayName: fullName || (r.username ? `@${r.username}` : `ID ${r.invitedId}`),
      createdAt: r.createdAt
    };
  });

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const invitesToday = invitedUsers.filter((u) => {
    const created = new Date(u.createdAt);
    const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")}`;
    return key === todayKey;
  }).length;

  const referralSettings = await getSetting("referral", { bonusPerInvite: REFERRAL_BONUS_PER_USER });
  const bonusPerInvite = Number(referralSettings?.bonusPerInvite || REFERRAL_BONUS_PER_USER);

  const invites = invitedUsers.length;
  const bonus = invites * bonusPerInvite;
  const bonusToday = invitesToday * bonusPerInvite;

  res.json({
    ok: true,
    data: {
      referrerId,
      invites,
      invitesToday,
      bonus,
      bonusToday,
      bonusPerUser: bonusPerInvite,
      invitedUsers
    }
  });
});

app.use("/admin", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});
app.use("/admin", express.static(path.join(__dirname, "..", "..", "admin")));
app.use("/", express.static(path.join(__dirname, "..", "..", "frontend")));

async function bootstrap() {
  await initDb();
  if (!adminAccessLoaded) {
    await refreshAdminAccessCache();
  }
  if (DISABLE_TELEGRAM_BOT) {
    console.warn("DISABLE_TELEGRAM_BOT=true. Telegram bot ishga tushirilmaydi.");
    app.locals.notifyNewOrder = async () => {};
    app.locals.bot = null;
    app.locals.getBotUsername = async () => null;
    app.locals.botUsername = null;
    runtimeTelegramToken = "";
    return null;
  }
  const superCfg = await getSetting("super_admin", {});
  const savedToken = String(superCfg?.botToken || "").trim();
  runtimeTelegramToken = savedToken || TELEGRAM_TOKEN;

  if (!runtimeTelegramToken) {
    console.warn("TELEGRAM_BOT_TOKEN topilmadi. Bot ishga tushmaydi.");
    return null;
  }

  const { bot, notifyNewOrder, getBotUsername } = createBot({
    token: runtimeTelegramToken,
    webAppUrl: WEB_APP_URL,
    adminWebAppUrl: ADMIN_WEB_APP_URL,
    adminChatId: ADMIN_CHAT_ID,
    isAdmin: isAdminId,
    getMandatoryChannels: async () => {
      const rows = await getMandatoryChannelsSetting();
      return rows.filter((x) => x.active !== false);
    },
    onReferral: async (referrerId, invitedId, invitedUser = {}) => {
      await pool.query(
        `
        INSERT INTO referrals (referrer_id, invited_id, invited_first_name, invited_last_name, invited_username)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (referrer_id, invited_id)
        DO UPDATE
        SET
          invited_first_name = EXCLUDED.invited_first_name,
          invited_last_name = EXCLUDED.invited_last_name,
          invited_username = EXCLUDED.invited_username
        `,
        [
          String(referrerId),
          String(invitedId),
          invitedUser.firstName ? String(invitedUser.firstName) : null,
          invitedUser.lastName ? String(invitedUser.lastName) : null,
          invitedUser.username ? String(invitedUser.username) : null
        ]
      );
      await upsertUserProfile({
        telegramId: String(invitedId),
        firstName: invitedUser.firstName ? String(invitedUser.firstName) : null,
        lastName: invitedUser.lastName ? String(invitedUser.lastName) : null,
        username: invitedUser.username ? String(invitedUser.username) : null
      });
    }
  });

  app.locals.notifyNewOrder = notifyNewOrder;
  app.locals.bot = bot;
  app.locals.getBotUsername = getBotUsername;
  app.locals.botUsername = await getBotUsername();

  if (WEBHOOK_URL) {
    app.post(`/telegram/webhook/${WEBHOOK_SECRET}`, (req, res) => {
      bot.handleUpdate(req.body);
      res.sendStatus(200);
    });

    await bot.telegram.setWebhook(`${WEBHOOK_URL}/telegram/webhook/${WEBHOOK_SECRET}`);
    console.log("Telegram webhook o'rnatildi.");
  } else {
    await bot.launch();
    console.log("Telegram polling rejimida ishga tushdi.");
  }

  return bot;
}

let botInstance = null;

const server = app.listen(PORT, async () => {
  try {
    console.log(`Server started: http://localhost:${PORT}`);
    bootstrapStatus = { ok: true, error: null };
    botInstance = await bootstrap();
    bootstrapStatus = { ok: true, error: null };
  } catch (error) {
    bootstrapStatus = { ok: false, error: error.message };
    console.error("Startup warning:", error.message);
    if (NODE_ENV === "production") {
      console.error("Production bootstrap xatosi. Process to'xtatiladi.");
      server.close(() => {
        pool.end().finally(() => process.exit(1));
      });
      return;
    }
    console.error("Server process ishlashda davom etadi (degraded mode).");
  }
});

process.once("SIGINT", () => {
  if (botInstance) botInstance.stop("SIGINT");
  pool.end().finally(() => server.close(() => process.exit(0)));
});

process.once("SIGTERM", () => {
  if (botInstance) botInstance.stop("SIGTERM");
  pool.end().finally(() => server.close(() => process.exit(0)));
});
