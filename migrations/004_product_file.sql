-- 商品下载文件支持（单文件 / 仅已购客户可下载）
-- 用法：wrangler d1 execute bu31-shop-db --remote --file=./migrations/004_product_file.sql
ALTER TABLE products ADD COLUMN file_key TEXT;
ALTER TABLE products ADD COLUMN file_name TEXT;
ALTER TABLE products ADD COLUMN file_size INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN file_uploaded_at INTEGER;
