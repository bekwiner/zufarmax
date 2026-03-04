const { Pool } = require("pg");
const { products } = require("../data/products");

const connectionString = process.env.DATABASE_URL || "";

if (!connectionString) {
  throw new Error("DATABASE_URL topilmadi. PostgreSQL ulanishini .env ga kiriting.");
}

const pool = new Pool({
  connectionString,
  ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_title TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      game_uid TEXT,
      category TEXT NOT NULL DEFAULT 'unknown',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS player_nickname TEXT,
    ADD COLUMN IF NOT EXISTS receipt_image TEXT,
    ADD COLUMN IF NOT EXISTS payment_card TEXT,
    ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'uploaded',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS referrals (
      referrer_id TEXT NOT NULL,
      invited_id TEXT NOT NULL,
      invited_first_name TEXT,
      invited_last_name TEXT,
      invited_username TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (referrer_id, invited_id)
    );
  `);

  await pool.query(`
    ALTER TABLE referrals
    ADD COLUMN IF NOT EXISTS invited_first_name TEXT,
    ADD COLUMN IF NOT EXISTS invited_last_name TEXT,
    ADD COLUMN IF NOT EXISTS invited_username TEXT;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_products (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      price NUMERIC(12,2) NOT NULL,
      qty INT NOT NULL DEFAULT 0,
      icon TEXT NOT NULL DEFAULT 'assets/img/logo.JPG',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE catalog_products
    ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT 'assets/img/logo.JPG';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_accounts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      price NUMERIC(12,2) NOT NULL,
      level INT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id TEXT PRIMARY KEY,
      first_name TEXT,
      last_name TEXT,
      username TEXT,
      balance NUMERIC(12,2) NOT NULL DEFAULT 0,
      banned BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    INSERT INTO users (telegram_id, first_name, last_name, username, created_at, updated_at)
    SELECT DISTINCT ON (r.invited_id)
      r.invited_id,
      r.invited_first_name,
      r.invited_last_name,
      r.invited_username,
      r.created_at,
      NOW()
    FROM referrals r
    WHERE r.invited_id IS NOT NULL
    ORDER BY r.invited_id, r.created_at DESC
    ON CONFLICT (telegram_id)
    DO UPDATE SET
      first_name = COALESCE(EXCLUDED.first_name, users.first_name),
      last_name = COALESCE(EXCLUDED.last_name, users.last_name),
      username = COALESCE(EXCLUDED.username, users.username),
      updated_at = NOW();
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    INSERT INTO app_settings (key, value)
    VALUES
      ('referral', '{"bonusPerInvite": 4, "minWithdraw": 50, "enabled": true}'::jsonb),
      ('system', '{"maintenanceMode": false, "newOrderNotification": true, "autoDelivery": false}'::jsonb)
    ON CONFLICT (key) DO NOTHING
  `);

  const productsCount = await pool.query(`SELECT COUNT(*)::INT AS count FROM catalog_products`);
  if ((productsCount.rows[0]?.count || 0) === 0) {
    const rows = [];
    const prodCategories = ["diamonds", "uc", "gold", "telegram"];
    prodCategories.forEach((category) => {
      (products[category] || []).forEach((item, idx) => {
        rows.push([
          String(item.id),
          category,
          String(item.title),
          Number(item.price || 0),
          Number(item.qty || 0),
          String(item.icon || "assets/img/logo.JPG"),
          true,
          idx
        ]);
      });
    });

    for (const row of rows) {
      await pool.query(
        `
        INSERT INTO catalog_products (id, category, title, price, qty, icon, active, sort_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO NOTHING
        `,
        row
      );
    }
  }

  const accountsCount = await pool.query(`SELECT COUNT(*)::INT AS count FROM catalog_accounts`);
  if ((accountsCount.rows[0]?.count || 0) === 0) {
    for (const item of products.accounts || []) {
      await pool.query(
        `
        INSERT INTO catalog_accounts (id, title, price, level, active)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (id) DO NOTHING
        `,
        [
          String(item.id),
          String(item.title),
          Number(item.price || 0),
          item.level != null ? Number(item.level) : null,
          true
        ]
      );
    }
  }
}

module.exports = { pool, initDb };
