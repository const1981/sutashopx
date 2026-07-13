-- ============================================================
--  SutaShopX 极简卡密商城 · 初始数据
--  用法：wrangler d1 execute sutashopx-db --remote --file=./seed.sql
--  管理员账号在首次访问后台时自动创建：admin / admin123456
--  （首次登录后请务必在「设置」里修改密码）
-- ============================================================

-- 站点设置（固定 id=1）
INSERT OR IGNORE INTO site_settings (id, site_name, subtitle, notice, support_contact, footer_text, order_notice, currency)
VALUES (1,
  'SutaShopX 商城',
  'AI · 工具 · 项目 · 素材 精选数字好物',
  '🎉 全站商品支付后自动发货，卡密秒到；有问题请联系客服微信 shidai616',
  '微信：shidai616 · 邮箱：hi@bu31.com',
  '© 2026 SutaShopX 商城 · 汇聚优质数字资源 · 仅供学习交流',
  '支付成功后卡密将立即显示在页面上，并可在「我的订单」中随时查看。',
  'usd');

-- 分类（与 SutaShopX 导航一致）
INSERT OR IGNORE INTO categories (id, name, slug, description, sort, status) VALUES
  (1, 'AI前沿',   'ai',        '最新 AI 模型与工具', 1, 1),
  (2, '工具软件', 'tools',     '效率神器 · 系统工具', 2, 1),
  (3, '创业项目', 'business',  '副业 · 变现 · 商业模式', 3, 1),
  (4, '素材资源', 'materials', '模板 · 图标 · 字体 · 教程', 4, 1);

-- 演示商品 1：自动发卡（AI前沿）
INSERT OR IGNORE INTO products (id, category_id, name, slug, subtitle, description, price, status, delivery_type, stock_mode, stock, min_buy, max_buy, sort, purchase_note, created_at, updated_at)
VALUES (1, 1, 'ChatGPT 镜像站会员卡（月卡）', 'chatgpt-vip-month',
  '免翻直连 · 稳定可用',
  '聚合全网优质 ChatGPT 镜像站点会员，免翻直达，响应速度优化，一个月内无限次使用。购买后自动发放卡密。',
  990, 1, 'CARD_AUTO', 'FINITE', 8, 1, 5, 1, '卡密仅限本人使用，购买后请尽快使用。', strftime('%s','now'), strftime('%s','now'));

-- 演示商品 2：自动发卡（工具软件）
INSERT OR IGNORE INTO products (id, category_id, name, slug, subtitle, description, price, status, delivery_type, stock_mode, stock, min_buy, max_buy, sort, purchase_note, created_at, updated_at)
VALUES (2, 2, '夸克网盘批量下载器 激活码', 'quark-downloader-key',
  '一键批量解析 · 多线程加速',
  '支持夸克/百度/阿里多网盘批量解析，速度提升 10 倍。购买后自动发放激活码。',
  1500, 1, 'CARD_AUTO', 'FINITE', 5, 1, 3, 2, '激活码绑定一台设备。', strftime('%s','now'), strftime('%s','now'));

-- 演示商品 3：固定内容发货（站点会员）
INSERT OR IGNORE INTO products (id, category_id, name, slug, subtitle, description, price, status, delivery_type, fixed_content, stock_mode, stock, min_buy, max_buy, sort, purchase_note, created_at, updated_at)
VALUES (3, 3, 'SutaShopX 永久至尊会员', 'sutashopx-vip-lifetime',
  '一次开通 · 终身权益',
  '开通后享受全站资源优先下载、专属客服、新货内测等权益。固定内容自动发货。',
  2990, 1, 'FIXED', '恭喜开通至尊会员！请添加客服微信 shidai616 备注「至尊会员+订单号」领取专属权益。', 'UNLIMITED', 999999, 1, 1, 3, '权益以客服发放为准。', strftime('%s','now'), strftime('%s','now'));

-- 首页幻灯片（Banner）
INSERT OR IGNORE INTO banners (id, tag, title, subtitle, mode, gradient, image_url, link_url, sort, status, created_at) VALUES
  (1, '限时', '数字好物 支付即发', 'ChatGPT 会员、网盘激活码、素材合集，下单后卡密秒到。', 'gradient', 'linear-gradient(135deg,#ff8a5a,#5b8fff)', '', '', 1, 1, strftime('%s','now')),
  (2, '精选', 'AI 前沿资源专区',   '最新 AI 工具与镜像会员，稳定可用免翻直连。',           'gradient', 'linear-gradient(135deg,#5b8fff,#4dc99a)', '', '', 2, 1, strftime('%s','now')),
  (3, '热卖', '创业副业项目合集',   '从 0 到 1 的变现 SOP，独立开发者出海指南。',           'gradient', 'linear-gradient(135deg,#b292ff,#c4b6a8)', '', '', 3, 1, strftime('%s','now'));

-- 支付网关默认配置（默认全部禁用，去后台「支付配置」填好并启用）
INSERT OR IGNORE INTO payment_gateways (id, type, display_name, gateway_url, app_id, app_secret, notify_url, return_url, extra, sort, enabled, created_at) VALUES
  (1, 'usdt',    'USDT (TRC20)',  'https://your-bepusdt.example.com', '', '', '', '', '{"chain":"TRC20","currency":"USDT","wallet":"","rate":1}', 1, 0, strftime('%s','now')),
  (2, 'alipay',  '支付宝',        '', '', '', '', '', '{}', 2, 0, strftime('%s','now')),
  (3, 'epay',    '易支付',        '', '', '', '', '', '{}', 3, 0, strftime('%s','now')),
  (4, 'stripe',  'Stripe',        '', '', '', '', '', '{}', 4, 0, strftime('%s','now')),
  (5, 'wechat',  '微信支付',      '', '', '', '', '', '{}', 5, 0, strftime('%s','now'));

-- 演示卡密（商品 1）
INSERT OR IGNORE INTO cards (product_id, content, status, batch_no, created_at) VALUES
  (1, 'OPENAI-SutaShopX-A1B2-C3D4-E5F6', 0, 'demo-batch-1', strftime('%s','now')),
  (1, 'OPENAI-SutaShopX-F7G8-H9I0-J1K2', 0, 'demo-batch-1', strftime('%s','now')),
  (1, 'OPENAI-SutaShopX-L3M4-N5O6-P7Q8', 0, 'demo-batch-1', strftime('%s','now')),
  (1, 'OPENAI-SutaShopX-R9S0-T1U2-V3W4', 0, 'demo-batch-1', strftime('%s','now')),
  (1, 'OPENAI-SutaShopX-X5Y6-Z7A8-B9C0', 0, 'demo-batch-1', strftime('%s','now')),
  (1, 'OPENAI-SutaShopX-D1E2-F3G4-H5I6', 0, 'demo-batch-1', strftime('%s','now')),
  (1, 'OPENAI-SutaShopX-J7K8-L9M0-N1O2', 0, 'demo-batch-1', strftime('%s','now')),
  (1, 'OPENAI-SutaShopX-P3Q4-R5S6-T7U8', 0, 'demo-batch-1', strftime('%s','now'));

-- 演示卡密（商品 2）
INSERT OR IGNORE INTO cards (product_id, content, status, batch_no, created_at) VALUES
  (2, 'QUARK-KEY-1001-AB12', 0, 'demo-batch-2', strftime('%s','now')),
  (2, 'QUARK-KEY-1002-CD34', 0, 'demo-batch-2', strftime('%s','now')),
  (2, 'QUARK-KEY-1003-EF56', 0, 'demo-batch-2', strftime('%s','now')),
  (2, 'QUARK-KEY-1004-GH78', 0, 'demo-batch-2', strftime('%s','now')),
  (2, 'QUARK-KEY-1005-IJ90', 0, 'demo-batch-2', strftime('%s','now'));
