-- ============================================================
--  BU31 飞书通知 · D1 迁移（远程库需手动执行，本地测试库由 schema.sql 自动建好）
--  用法（需具备 D1 权限的 token，即「新 token」）：
--    wrangler d1 execute bu31-shop-db --remote --file=./migrations/003_feishu.sql
--  说明：SQLite 的 ALTER 不支持 IF NOT EXISTS。若执行报
--  「duplicate column name: feishu_webhook」说明列已存在，可忽略，不影响。
--  为稳妥，也可分两条 --command 各跑一次，一条报错不阻断另一条。
-- ============================================================

ALTER TABLE site_settings ADD COLUMN feishu_webhook TEXT;   -- 飞书自定义机器人 Webhook（非空即启用新订单通知）
ALTER TABLE site_settings ADD COLUMN feishu_secret  TEXT;   -- 飞书机器人签名密钥（可选，开启加签时填）
