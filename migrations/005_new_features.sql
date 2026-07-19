-- 005: 折扣码管理 + 邮件配置 + 操作日志 + 安全设置
-- 执行: wrangler d1 execute sutashopx-db --remote --file=./migrations/005_new_features.sql

-- orders 表增加折扣码字段
ALTER TABLE orders ADD COLUMN coupon_code TEXT DEFAULT NULL;

-- 折扣码表
CREATE TABLE IF NOT EXISTS coupons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT UNIQUE NOT NULL,           -- 折扣码，如 SAVE20
  type        TEXT NOT NULL DEFAULT 'percent',-- percent(百分比) | fixed(固定金额减免)
  value       INTEGER NOT NULL DEFAULT 0,     -- 百分比时 0-100，固定额时单位为分(cents)
  min_order   INTEGER NOT NULL DEFAULT 0,     -- 最低订单金额(分)，0=不限
  max_uses    INTEGER NOT NULL DEFAULT 0,     -- 最大使用次数，0=不限
  used_count  INTEGER NOT NULL DEFAULT 0,     -- 已使用次数
  expires_at  INTEGER NOT NULL DEFAULT 0,     -- 过期时间戳，0=永不过期
  enabled     INTEGER NOT NULL DEFAULT 1,     -- 1启用 0禁用
  created_at  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_enabled ON coupons(enabled);

-- 管理员操作日志表
CREATE TABLE IF NOT EXISTS admin_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER NOT NULL,
  action      TEXT NOT NULL,                  -- 操作类型：login/create/update/delete/enable/disable/config
  target_type TEXT,                           -- 操作对象类型：product/order/coupon/gateway/settings 等
  target_id   INTEGER,                        -- 对象 ID
  detail      TEXT,                           -- 详细信息(JSON 或文字)
  ip          TEXT,                           -- 操作 IP
  created_at  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin ON admin_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action, created_at DESC);

-- 通用键值配置表（安全设置、邮件SMTP配置等任意扩展配置都存这里）
CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT
);
