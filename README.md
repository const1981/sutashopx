# SutaShopX 极简卡密商城

一套**全部跑在 Cloudflare 上**、零构建、好改的「卡密商城」系统。功能对照开源项目 [edgeKey](https://github.com/34892002/edgeKey)（商品管理 / 卡密管理 / 订单管理 / 多支付 / 后台），但技术栈大幅简化——**单文件 Worker + D1 + 纯 HTML/JS**，没有 Vike/Prisma/Vue 那一套重构建链，改一行逻辑只动一个文件。

## 功能对照 edgeKey（已实现，简化版）

| 模块 | 能力 |
|------|------|
| 商品管理 | 分类、上/下架、库存模式（有限/无限）、最小/最大购买量、排序、封面、购买须知 |
| 卡密管理 | 批量导入、支付后自动发货、库存实时同步、库存预警（≤5 件） |
| 订单管理 | 列表、详情、手动补发、超时自动关闭、支付日志 |
| 幻灯片管理 | 首页 Banner 后台增删改：渐变色块 / 图片两种模式、角标、跳转链接、排序、显示隐藏、实时预览 |
| 支付配置 | 后台「💰 支付配置」统一管理多网关：USDT(TRC20/ERC20，BEpusdt 网关或钱包地址两种模式)、支付宝、易支付、Stripe、微信。启用的网关会显示在前台下单页供选择。内置**演示模式**兜底 |
| 文件管理 | 通过 **R2** 上传商品封面 / 幻灯片图片（后台表单「上传」按钮直传，经 Worker `/file/<key>` 代理读取，无需公开桶） |
| 站点设置 | 站点名、副标题、公告、客服、页脚、下单提示、货币 |
| 后台 | 管理员账号 + 密码哈希 + HMAC 签名令牌登录；首次访问自动建默认账号 |

> 前台视觉直接复用你给的 **SutaShopX 导航站**设计语言（配色、卡片、Banner、明暗主题）。

## 目录结构

```
sutashopx/
├── wrangler.toml        # Cloudflare 配置（Worker + 静态资源 + D1 + 定时任务）
├── schema.sql           # D1 建表
├── seed.sql             # 初始数据（站点设置 / 4 分类 / 3 演示商品 + 卡密）
├── src/
│   └── worker.js        # 后端全部逻辑（API + 鉴权 + 支付 + 发货 + 定时任务）
├── public/              # 前台静态资源（直接由 Worker 的 assets 托管）
│   ├── index.html       # 商城首页（数据驱动）
│   ├── admin.html       # 管理后台
│   ├── success.html     # 支付成功 / 订单结果页
│   ├── css/style.css    # 共享样式（SutaShopX 设计系统 + 商城/后台样式）
│   └── js/{store,admin,success}.js
└── test/                # 自测脚本（Node 直接跑，无需 Cloudflare）
    ├── smoke.mjs        # 纯逻辑：密码哈希 / 令牌 / 订单号 / 卡密选取
    └── integration.mjs  # 端到端：用 node:sqlite 跑真实 schema + 真跑 Worker.fetch
```

## 本地自测（不需要 Cloudflare）

```bash
node test/smoke.mjs        # 纯逻辑测试
node test/integration.mjs  # 端到端测试（会执行 schema.sql/seed.sql）
```

## 部署到 Cloudflare（一条龙）

> 前提：已安装 Node.js，并 `npm i -g wrangler`（或 `bun i -g wrangler`）。

```bash
# 1. 登录 Cloudflare
wrangler login

# 2. 创建 D1 数据库，记下返回的 database_id
wrangler d1 create sutashopx-db
#   然后把 id 填进 wrangler.toml 的 database_id = "..."

# 3. 建表 + 灌初始数据
wrangler d1 execute sutashopx-db --remote --file=./schema.sql
wrangler d1 execute sutashopx-db --remote --file=./seed.sql

# 4. 创建 R2 存储桶（用于上传商品图 / 幻灯片图）
wrangler r2 bucket create sutashopx-files
#   wrangler.toml 里已绑定 [[r2_buckets]] binding="R2" bucket_name="sutashopx-files"

# 5. 配置密钥（AUTH_SECRET 必填；Stripe 可选）
wrangler secret put AUTH_SECRET        # 随便输一段足够随机的字符串
wrangler secret put STRIPE_SECRET_KEY  # 可选：填了即用真实 Stripe 支付
wrangler secret put STRIPE_WEBHOOK_SECRET  # 可选：Stripe Webhook 签名密钥

# 6. 一键部署
wrangler deploy
```

## 连接 GitHub 自动部署（push 即上线）

把本仓库推到 GitHub 后，在 **Cloudflare 控制台 → Workers & Pages → 你的 Worker → Settings → Integrations → Connect to Git**，选中 GitHub 仓库与 `main` 分支，保存后：

- 以后 `git push` 到 `main` → Cloudflare 自动 `wrangler deploy`
- 首次连接需在 Cloudflare 后台点几下授权（用已登录的 `Jqm0839@qq.com` 账号即可）
- **D1 / R2 只需建一次**：本仓库 `wrangler.toml` 已写死 `database_id` 和 bucket 名，建好后 CI 部署自动复用，**无需每次重建**
- **Secrets 也只需设一次**：`AUTH_SECRET` 等已在 Cloudflare 后台的 Worker 环境变量里，CI 部署自动带上

> 注意：本地 `wrangler deploy` 与 GitHub CI 部署二选一即可，不要两边同时改以免冲突。本地改完 push 即走 CI。

## 线上状态（已部署并真机测试）

- 商城首页：**https://sutashopx.constlee.workers.dev**
- 管理后台：**https://sutashopx.constlee.workers.dev/admin.html**
- **默认管理员：admin / admin123456，首次登录后请立即在「设置」里改密码**
- 已建资源：D1 `sutashopx-db`、R2 `sutashopx-files`，`AUTH_SECRET` 已注入。
- **BEpusdt 已真实对接**：后台已配置 AWS API Gateway 网关地址和 App Secret；真机下单成功返回 BEpusdt 收银台链接；构造回调验签通过并自动发货（订单状态 `DELIVERED`、卡密已发出）。

部署完成后（首次本地部署）：
- 商城首页：`https://sutashopx.<你的子域>.workers.dev`
- 管理后台：`https://sutashopx.<你的子域>.workers.dev/admin.html`
- **默认管理员：admin / admin123456，首次登录后请立即在「设置」里改密码**

> ⚠️ 上线必做三件事：
> 1. 后台「设置」把 admin 密码改成你自己的。
> 2. 如果会用「静态钱包地址」模式（不填网关地址），后台「💰 支付配置」里 USDT 的 `extra.wallet` 要改成你的**真实 TRC20 钱包地址**。收银台模式不需要这个字段，款项直接到你 BEpusdt 后台配置的钱包。
> 3. 之前聊天里贴过的 R2 密钥和 BEpusdt App Secret 建议测试完成后轮换/吊销，避免泄露风险。

### 支付网关配置（后台「💰 支付配置」）
- 去后台「支付配置」新增/启用网关，前端下单页会自动出现对应支付方式。
- **USDT（BEpusdt 已对接，按 edgeKey 配置方式）**：
  - 在后台启用 USDT 网关，填写：
    - 网关地址：`https://你的BEpusdt域名`（系统会自动拼接 `/api/v1/order/create-order`）
    - App Secret：BEpusdt 后台「API 设置」里的对接令牌
    - Notify URL：`/api/payments/bepusdt/notify`
    - Return URL：`/order/{orderNo}?token={token}`
  - 填写完整后，用户下单会跳转到 BEpusdt 收银台；支付成功后 BEpusdt 会回调 `/api/payments/bepusdt/notify`，Worker 自动验签并发货。
  - 不填网关地址则回退为「静态钱包地址」模式：直接展示 `extra.wallet` 地址，用户手动转账后点「我已支付」或你后台补发。`extra` 示例：`{"chain":"TRC20","currency":"USDT","wallet":"你的TRC20地址","rate":1}`。
- **支付宝 / 易支付 / 微信**：填商户号与密钥即可（暂走演示下单，后续接入真实下单 SDK）。
- **Stripe**：可以用「支付配置」里的 Stripe 网关，或在 `wrangler.toml` 用 `STRIPE_SECRET_KEY` 启用。
- 演示模式兜底：没有任何已配置网关时，下单走演示模式（成功页点「模拟支付成功」即发货）。

- 接 Stripe 真实支付：填好 `STRIPE_SECRET_KEY` 和 `STRIPE_WEBHOOK_SECRET`，并在 Stripe 后台配置 Webhook 指向 `https://<你的域名>/api/pay/webhook`，支付成功会自动发货。

## 怎么改（都很好改）

**改样式/配色**：编辑 `public/css/style.css` 顶部的 `:root` CSS 变量（`--color-accent-*`、`--tone-*` 等），全站即时生效。

**改商品字段 / 加表**：改 `schema.sql` → 重新执行建表 → 在 `src/worker.js` 对应接口里增减字段 → 在 `public/js/admin.js`、`store.js` 的表单/渲染里增减。逻辑全在 `worker.js` 一个文件里，路由用 `path.match(...)` 一目了然。

**加新的支付网关**（比如 USDT / 易支付）：在 `src/worker.js` 的 `createPayment()` 里加一个分支即可，参考已有的 `demo` 与 `stripe` 两个实现；如需异步回调，仿照 `/api/pay/webhook` 加一个接收端点。

**价格单位**：数据库 `price` 存「最小货币单位」（分）。`¥9.90` 存为 `990`，`$9.90` 也是 `990`，由站点设置里的 `currency`（usd/cny）决定显示符号。后台填价格时按「元/美元」填写，会自动 ×100 存储。

## 技术栈
- 计算：Cloudflare Workers（原生 JS，零依赖，零构建）
- 数据库：Cloudflare D1（SQLite）
- 静态托管：Worker Assets（前台 + 后台同域）
- 鉴权：Web Crypto HMAC-SHA256（密码哈希 + 会话令牌签名，无第三方库）
- 定时器：Cloudflare Cron Triggers（每 5 分钟清理超时未支付订单）
