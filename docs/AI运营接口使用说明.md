# SutaShopX 商城 · AI 运营接口使用说明

> 用途：把这份说明 + 你的 API Key 发给你的 AI，AI 就能**不登录后台**，直接帮你往商城里
> 批量添加商品、导入卡密、清空分类。走独立 Key（`x-api-key`），跟你的后台账号密码完全隔离，
> 泄露了也只影响这一个 Key，随时能换。

---

## 一、先在 Cloudflare 设一个 Key（只做一次）

接口默认是**锁死的**——没设 Key 之前，任何人调都返回 401。你要先设好这个 Key：

1. 浏览器打开 **https://dash.cloudflare.com** 登录
2. 左侧菜单点 **Workers & Pages** → 在列表里点 **sutashopx**
3. 顶部点 **Settings（设置）** 标签
4. 找到 **Variables and Secrets（变量与机密）** 这一块 → 点 **Add（添加）**
5. 填写：
   - **Type（类型）**：选 **Secret**（加密，别选 Plaintext）
   - **Variable name（变量名）**：`AI_API_KEY`  ← 必须一字不差
   - **Value（值）**：粘贴你的 Key（见下方）
6. 点 **Deploy / Save**，等它部署完（几十秒）

**你的 Key（建议值，可自己改，务必保密）：**

```
sutashopx_ai_ee994060de6e6086de3d203a5b1581572cd8e3d0e3adccb5
```

> 设完就生效了。以后想换 Key，回到这里改 Value 再 Deploy 即可，旧 Key 立刻失效。

---

## 二、基本信息

- **接口根地址（Base URL）**：`https://sutashopx.constlee.workers.dev`
- **鉴权**：每个请求都要带请求头 `x-api-key: 你的Key`
- **数据格式**：请求体和返回都是 JSON
- **价格单位**：接口里 `price` 直接填**元/美元**（如 `29.9`），系统自动 ×100 存成分，你不用换算

---

## 三、接口清单（4 个）

### 1) 批量添加商品
```
POST /api/machine/products/bulk
Header: x-api-key: 你的Key
Body（JSON 数组，每次最多 200 个）：
[
  {
    "name": "ChatGPT Plus 会员月卡",
    "price": 29.9,
    "category_slug": "ai",          // 分类用 slug 或分类名都行
    "delivery_type": "CARD_AUTO",   // CARD_AUTO=自动发卡密 / FIXED=固定内容 / MANUAL=人工
    "subtitle": "自动发货",
    "description": "下单秒发",
    "stock_mode": "FINITE"          // FINITE=有限库存(按卡密数) / INFINITE=无限
  }
]
返回：{ "ok": true, "created": 1, "ids": [12] }
```

### 2) 导入卡密（推荐用这个，不用记商品数字 ID）
```
POST /api/machine/cards/import
Header: x-api-key: 你的Key
Body：
{
  "product_ref": "ai/chatgpt-plus-yueka",   // 格式：分类slug/商品slug，或直接写商品名
  "keys": ["KEY-001", "KEY-002", "KEY-003"], // 也可以传一整段换行文本
  "batch_no": "2026-07"                       // 批次号，选填
}
返回：{ "ok": true, "imported": 3, "product_id": 12, "batch": "2026-07" }
```
> `product_ref` 三种写法都认：
> - `"ai/chatgpt-plus-yueka"`（分类slug/商品slug，最准）
> - `"ChatGPT Plus 会员月卡"`（直接商品名）
> - `"12"`（数字ID，如果你正好知道）

### 3) 导入卡密（按数字 ID，旧方式，仍保留）
```
POST /api/machine/products/{商品ID}/keys
Header: x-api-key: 你的Key
Body：{ "keys": ["KEY-001", "KEY-002"], "batch_no": "2026-07" }
```

### 4) 整类清空（删掉某分类下所有商品+卡密，谨慎用）
```
DELETE /api/machine/category/{分类slug}
Header: x-api-key: 你的Key
返回：{ "ok": true, "deletedProducts": 5 }
```

---

## 四、直接发给 AI 的话术模板（复制这段）

```
你是我的电商运营助手。我有一个卡密商城，你可以通过 HTTP 接口帮我管理商品和卡密，
不需要登录后台。规则如下：

- 接口根地址：https://sutashopx.constlee.workers.dev
- 每个请求都要带请求头：x-api-key: sutashopx_ai_ee994060de6e6086de3d203a5b1581572cd8e3d0e3adccb5
- price 直接填元（如 29.9），系统会自动处理

你能用的接口：
1. 批量加商品：POST /api/machine/products/bulk ，body 是商品 JSON 数组
2. 导卡密：POST /api/machine/cards/import ，body 里 product_ref 用「分类slug/商品名」定位
3. 整类清空：DELETE /api/machine/category/{分类slug}

当我说"帮我上架 XX / 导入这批卡密"时，你就调对应接口，调完把返回结果告诉我。
```

---

## 五、快速自测（可选，用命令行验证 Key 通不通）

```bash
curl -X POST https://sutashopx.constlee.workers.dev/api/machine/products/bulk \
  -H "x-api-key: sutashopx_ai_ee994060de6e6086de3d203a5b1581572cd8e3d0e3adccb5" \
  -H "Content-Type: application/json" \
  -d '[{"name":"接口测试商品","price":1,"category_slug":"ai","delivery_type":"MANUAL"}]'
```
返回 `{"ok":true,"created":1,...}` 就是通了；返回 401 说明 Key 没设对或没 Deploy。

---

## 安全提示

- 这个 Key 只给 AI/脚本用，**别跟后台登录密码混用**。
- 别把 Key 贴到公开的地方（GitHub、聊天群）。怀疑泄露就去 Cloudflare 改 Value 重新 Deploy。
- 日常你自己在后台生成卡密**不需要这个 Key**：进 `/admin.html` → 商品管理 → 点商品「卡密」→「⚡ 生成卡密」即可。
