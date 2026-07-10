-- ============================================================
--  BU31 极简卡密商城 · D1 (SQLite) 建表脚本
--  用法：wrangler d1 execute bu31-shop-db --remote --file=./schema.sql
--  或本地：wrangler d1 execute bu31-shop-db --local --file=./schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS admins (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname     TEXT,
  status       INTEGER NOT NULL DEFAULT 1,   -- 1 启用 / 0 禁用
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  slug         TEXT UNIQUE NOT NULL,
  description  TEXT,
  sort         INTEGER NOT NULL DEFAULT 0,
  status       INTEGER NOT NULL DEFAULT 1    -- 1 显示 / 0 隐藏
);

CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id   INTEGER,
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  subtitle      TEXT,
  description   TEXT,
  cover_image   TEXT,
  price         INTEGER NOT NULL DEFAULT 0,  -- 价格（最小货币单位，如分）
  status        INTEGER NOT NULL DEFAULT 1,  -- 1 在售 / 0 下架
  delivery_type TEXT NOT NULL DEFAULT 'CARD_AUTO', -- CARD_AUTO 自动发卡 | FIXED 固定内容 | MANUAL 人工发货
  fixed_content TEXT,
  stock_mode    TEXT NOT NULL DEFAULT 'FINITE', -- FINITE 有限 | UNLIMITED 无限
  stock         INTEGER NOT NULL DEFAULT 0,
  min_buy       INTEGER NOT NULL DEFAULT 1,
  max_buy       INTEGER NOT NULL DEFAULT 1,
  sort          INTEGER NOT NULL DEFAULT 0,
  purchase_note TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status   ON products(status, sort);

CREATE TABLE IF NOT EXISTS cards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  content    TEXT NOT NULL,
  status     INTEGER NOT NULL DEFAULT 0,  -- 0 未售 / 1 已售 / 2 禁用
  batch_no   TEXT,
  order_id   INTEGER,
  sold_at    INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_product_status ON cards(product_id, status);
CREATE INDEX IF NOT EXISTS idx_cards_order ON cards(order_id);

CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no        TEXT UNIQUE NOT NULL,
  query_token     TEXT NOT NULL,
  product_id      INTEGER NOT NULL,
  product_name    TEXT NOT NULL,
  unit_price      INTEGER NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 1,
  amount          INTEGER NOT NULL,
  contact_value   TEXT,
  status          TEXT NOT NULL DEFAULT 'PENDING', -- PENDING 待支付 | PAID 已付 | DELIVERED 已发货 | CLOSED 关闭 | FAILED 失败
  payment_provider TEXT,
  payment_order_no TEXT,
  delivered_keys  TEXT,    -- JSON 数组
  delivery_note   TEXT,
  delivered_at    INTEGER,
  paid_at         INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_status    ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_product   ON orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_created   ON orders(created_at);

CREATE TABLE IF NOT EXISTS payment_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER,
  provider     TEXT,
  order_no     TEXT,
  event_type   TEXT,
  raw          TEXT,
  verify_status TEXT DEFAULT 'PENDING',
  message      TEXT,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_gateways (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL,   -- usdt | alipay | epay | stripe | wechat
  display_name TEXT NOT NULL,   -- 后台显示的网关名，如「USDT-TRC20」
  gateway_url  TEXT,            -- BEpusdt / Epay 等网关地址
  app_id       TEXT,            -- 商户ID / API ID
  app_secret   TEXT,            -- API Key / 商户密钥
  notify_url   TEXT,            -- 回调地址（留空则用系统默认）
  return_url   TEXT,            -- 同步跳转地址（留空则用系统默认）
  extra        TEXT,            -- JSON：链类型(TRC20/ERC20)、钱包地址、货币符号等
  sort         INTEGER NOT NULL DEFAULT 0,
  enabled      INTEGER NOT NULL DEFAULT 0,  -- 1 启用 / 0 禁用
  created_at   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_gateways_enabled ON payment_gateways(enabled, sort);

CREATE TABLE IF NOT EXISTS media (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key       TEXT UNIQUE NOT NULL,   -- R2 对象键，如 uploads/2026/abc.jpg
  filename     TEXT,
  content_type TEXT,
  size         INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_media_created ON media(created_at DESC);

CREATE TABLE IF NOT EXISTS banners (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tag        TEXT,                              -- 角标文案，如「限时」「精选」
  title      TEXT NOT NULL,                     -- 主标题
  subtitle   TEXT,                              -- 描述文案
  mode       TEXT NOT NULL DEFAULT 'gradient',  -- gradient 渐变色块 | image 图片
  gradient   TEXT,                              -- 渐变值，如 linear-gradient(135deg,#ff8a5a,#5b8fff)
  image_url  TEXT,                              -- 图片地址（mode=image 时用）
  link_url   TEXT,                              -- 点击跳转链接（选填）
  sort       INTEGER NOT NULL DEFAULT 0,
  status     INTEGER NOT NULL DEFAULT 1,        -- 1 显示 / 0 隐藏
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_banners_status ON banners(status, sort);

CREATE TABLE IF NOT EXISTS site_settings (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  site_name     TEXT NOT NULL DEFAULT 'BU31 商城',
  subtitle      TEXT,
  notice        TEXT,
  support_contact TEXT,
  footer_text   TEXT,
  order_notice  TEXT,
  currency      TEXT NOT NULL DEFAULT 'usd'
);
