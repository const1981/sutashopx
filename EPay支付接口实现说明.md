# EPay / VPAY 支付接口实现说明（SutaShopX）

> 状态：**已落地实施**（代码已改 `src/worker.js` 三处 + 部署自测）。
> 改动范围：仅 `sutashopx/src/worker.js` 一个文件。前端 `store.js` 不用改。
> 支付模型（臣哥确认）：**聚合码 + APP 推送确认** —— 下单后 VPAY 返回一个支付宝/微信都能扫的统一收款码；用户付款后，收款手机 APP 监听到账 → VPAY 匹配订单 → 异步回调我们 `/api/payments/epay/notify` → 我们验签 → 发货。判定支付成功的唯一可靠依据是**异步回调**，不是前端跳转。

---

## 0. 一句话结论

照 **VPAY 易支付(epay) 协议**对接。VPAY 是**免签支付**：不接微信/支付宝官方商户号，靠装了监控 APP 的收款手机监听到账再回调通知我们。

- `createPayment` 的 `epay` 分支：从 demo 占位换成调 `submit.php` 生成**支付页 URL**（页内含统一收款二维码，支付宝/微信都能扫）。
- 新增 `/api/payments/epay/notify` 路由：VPAY 异步回调 → 验签 → 改订单已支付 → 飞书 → 返回 `success`。
- 前端 `store.js` 不用改（拿到 `payUrl` 跳转/打开即可看到二维码）。
- 签名**直接复用现有 `signBepusdt`**（算法与 VPAY 的 `signEpay` 完全一致：非空参数按 key ASCII 升序拼 `k=v&` + 末尾直接接 KEY + MD5 小写）。

---

## 1. VPAY 关键指标（来自《支付接口对接文档.md》，臣哥已确认口令为真实值）

| 配置项 | 值 |
|--------|----|
| 网关地址 | `https://vpay.yaode.eu.org` |
| 商户 PID | `10001` |
| 通讯密钥 KEY | `vmq2c9a8f1e4b6d3a5c7e9` |
| 下单接口 | `GET https://<网关>/submit.php`（参数拼 URL） |
| 签名方式 | 非空参数按 key ASCII 升序 → `k=v&k=v` → 末尾**直接接 KEY**（无 `&key=` 前缀）→ MD5 32 位小写 |
| 异步回调 | `notify_url`（我们提供，必须公网可达） |
| 回调响应 | 处理成功后响应体返回纯文本 `success`（VPAY 检测响应体含 `success` 即算成功，大小写不敏感） |

> 代码**不硬编码**这些值，全部从 `payment_gateways` 表读取 `gateway_url/app_id/app_secret/notify_url/extra`，由后台「支付配置」维护。表中已填的真实值与上面一致（臣哥确认）。

---

## 2. 支付流程（时序）

```
① 商场 ──submit.php 建单──▶ VPAY 网关
② VPAY ──返回支付页(含统一收款二维码+金额)──▶ 用户浏览器
③ 用户 微信/支付宝 扫码付款（一个码两者都能扫）
④ 收款手机 APP 监听到账
⑤ VPAY 按金额匹配订单
⑥ VPAY ──POST notify_url(异步回调)──▶ worker.js
⑦ 验签 → markPaid 发货 → 飞书通知 → 返回 success
⑧ VPAY 收到 success，确认通知成功
```

**⚠️ 判定"支付成功"的唯一可靠依据是 ⑥异步回调**，不是前端跳转（return_url）。臣哥说的"APP 后台获取支付消息推送给平台让网关确认订单" = ④⑤⑥ 这套机制：APP 监听是触发源，网关(VPAY)回调是确认通道。

---

## 3. 接口明细

### 3.1 创建订单（submit.php）
| 参数 | 必填 | 说明 |
|------|------|------|
| `pid` | 是 | 商户 PID |
| `type` | 是 | `wxpay`(微信) / `alipay`(支付宝)。VPAY 返回"统一收款二维码"两个 APP 都能扫；该参数用于 VPAY 内部匹配监听通道，默认 `alipay`（可由网关 `extra.channel` 配置） |
| `out_trade_no` | 是 | 我们的商户订单号（唯一） |
| `name` | 是 | 商品名称 |
| `money` | 是 | 金额，**单位元，两位小数**（如 `10.00`） |
| `notify_url` | 是 | 异步回调地址，公网可达 |
| `return_url` | 否 | 同步跳转（仅供参考，不可靠） |
| `sign` | 是 | 签名 |

下单成功返回**支付页 HTML（含统一收款二维码+金额）**；下单失败返回纯文本：`params missing` / `pid error` / `sign error` / `dup` / `amt error` / `busy`。

### 3.2 异步通知回调（★核心）
- 方法 `POST`，Content-Type `application/x-www-form-urlencoded`（也兼容 JSON）
- 回调参数：`pid`、`trade_no`(VPAY 内部单号)、`out_trade_no`(我们的单号)、`type`、`name`、`money`、`trade_status`(固定 `TRADE_SUCCESS`)、`sign`、`sign_type`(固定 `MD5`)
- **必须做两件事**：① 用收到参数（排除 `sign`/`sign_type`）按 `signBepusdt` 重新算签名比对，不一致**拒绝(400)**；② 处理成功响应体返回 `success`。
- **幂等**：同一订单可能多次回调，用 `out_trade_no` 关联，已支付则直接回 `success`，绝不重复发货。

---

## 4. worker.js 改动代码（已落地）

### 4.1 createPayment 的 epay 分支（替换原 demo 占位，约 876 行）
```js
    if (g.type === 'epay') {
      // 易支付（VPAY 免签）：下单后返回一个内含统一收款二维码的支付页，
      // 用户用 支付宝/微信 扫码即可；支付成功由 VPAY 异步回调 /api/payments/epay/notify 确认。
      const base = (g.gateway_url || '').replace(/\/+$/, '');
      const key = g.app_secret || '';
      const channel = safeJson(g.extra, {}).channel || 'alipay'; // 默认支付宝通道（VPAY 返回聚合码，两者都能扫）
      const origin = new URL(order.__requrl).origin;
      const notifyUrl = (g.notify_url && /^https?:\/\//i.test(g.notify_url))
        ? g.notify_url
        : `${origin}/api/payments/epay/notify`;
      const params = {
        pid: g.app_id,
        type: channel,
        out_trade_no: order.order_no,
        name: order.product_name || 'SutaShopX 商品',
        money: (Number(order.amount) / 100).toFixed(2), // 分 → 元，两位小数
        notify_url: notifyUrl,
        return_url: `${origin}/order/${order.order_no}?token=${order.query_token}`,
      };
      params.sign = signBepusdt(params, key); // 复用现有签名函数
      const payUrl = `${base}/submit.php?` + new URLSearchParams(params).toString();
      return { ok: true, provider: 'epay', payUrl };
    }
    if (g.type === 'alipay' || g.type === 'wechat') {
      // 暂未接官方通道，回退演示（保留原行为）
      return { ok: true, provider: 'demo', payUrl: `/success.html?order=${order.order_no}&demo=1&token=${order.query_token}` };
    }
```

### 4.2 路由表新增（在 bepusdt/notify 路由之后，约 1108 行）
```js
  if (path === '/api/payments/epay/notify' && method === 'POST') {
    return await handleEpayNotify(env, request);
  }
```

### 4.3 新增 handleEpayNotify 函数（在 handleUsdtNotify 之后）
```js
// 易支付（VPAY 免签）异步回调：验签 + 发货
// VPAY 以 form 表单 POST 异步通知；响应体含 success 即通知成功
async function handleEpayNotify(env, request) {
  let data = {};
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) data = await request.json();
    else {
      const fd = await request.formData();
      for (const [k, v] of fd.entries()) data[k] = v;
    }
  } catch {
    return new Response('success'); // 解析失败也回 success，避免无意义重试
  }

  const outTradeNo = data.out_trade_no || '';
  const order = await first(env, 'SELECT * FROM orders WHERE order_no=?', outTradeNo);
  if (!order) return new Response('success');

  // 验签：排除 sign / sign_type，复用 signBepusdt
  const gw = await first(env, "SELECT * FROM payment_gateways WHERE type='epay' AND enabled=1 LIMIT 1");
  const key = gw ? (gw.app_secret || '') : '';
  const signed = { ...data };
  delete signed.sign;
  delete signed.sign_type;
  const expected = signBepusdt(signed, key);
  if (expected !== (data.sign || '')) {
    await run(env, 'INSERT INTO payment_logs (order_id,provider,order_no,event_type,raw,verify_status,message,created_at) VALUES (?,?,?,?,?,?,?,?)',
      order.id, 'epay', outTradeNo, 'notify', JSON.stringify(data), 'INVALID_SIGN', '签名校验失败', nowSec());
    return new Response('sign error', { status: 400 }); // 验签失败：拒绝，让网关告警/重试以暴露配置问题
  }

  await run(env, 'INSERT INTO payment_logs (order_id,provider,order_no,event_type,raw,verify_status,created_at) VALUES (?,?,?,?,?,?,?)',
    order.id, 'epay', outTradeNo, 'notify', JSON.stringify(data), 'RECEIVED', nowSec());

  // 非成功状态：仅记录，不发货
  if (String(data.trade_status || '') !== 'TRADE_SUCCESS') return new Response('success');

  // 幂等：已支付直接回 success，绝不重复发货
  if (order.status !== 'PENDING') return new Response('success');

  const tradeNo = data.trade_no || ('epay-' + outTradeNo);
  await markPaid(env, order, 'epay', tradeNo); // 内部自动 deliverOrder 发货 + sendFeishu 飞书
  await run(env, 'INSERT INTO payment_logs (order_id,provider,order_no,event_type,raw,verify_status,created_at) VALUES (?,?,?,?,?,?,?)',
    order.id, 'epay', outTradeNo, 'notify', JSON.stringify(data), 'VERIFIED', nowSec());
  return new Response('success');
}
```

> `signBepusdt` / `first` / `run` / `markPaid` / `safeJson` 全部复用现有实现，未新增。

---

## 5. 关键注意点（必看，来自文档 FAQ）
1. 异步回调是唯一可靠依据，别靠前端跳转/轮询/截图判定支付。
2. **必须验签**，否则可伪造通知刷单（验签失败返回 400 拒绝）。
3. 处理成功**必须返回 `success`**（响应体含即可），否则被反复重试。
4. **幂等**：`out_trade_no` 关联，已支付订单忽略后续回调，绝不重复发货。
5. 订单有效期约 5 分钟（300 秒）：用户需有效期内付款，超时重新下单。
6. 金额单位**元、两位小数**，不是分（`order.amount` 是分，下单时 `/100`）。
7. `notify_url` 公网可达：`u.bu31.com` 走 Cloudflare 代理 ✅。
8. 参数读 `payment_gateways` 表，不硬编码；`extra.channel` 可配 alipay/wxpay，默认 alipay（VPAY 返回统一码两 APP 都能扫）。

---

## 6. 实施 & 自测记录
- [x] 写方案文档（本案）
- [x] 改 `worker.js`：epay 下单 + `/api/payments/epay/notify` 路由 + `handleEpayNotify`
- [x] 本地逻辑自测（`test/epay_local_check.mjs`，node 跑通）：① 下单生成 payUrl 格式正确、sign=32位hex ✅ ② VPAY 正确签名回调验签 PASS ✅ ③ 篡改金额回调被拒 ✅
- [x] `wrangler deploy`：2026-07-12 部署成功（worker `sutashopx`，版本 95fca171，modified_on 14:47Z）。u.bu31.com 自定义域→sutashopx，刚部署时自定义域切版本有 ~分钟级延迟，重测即生效。
- [x] **线上 E2E 自测全通过**（2026-07-12）：
  - 建单（gateway=3 / type=epay）→ 返回 `mode:"epay"` + `payUrl=https://vpay.yaode.eu.org/submit.php?pid=10001&type=alipay&out_trade_no=...&money=0.20&notify_url=https://u.bu31.com/api/payments/epay/notify&sign=...` ✅
  - 用臣哥确认的真实 KEY 复算 sign，与线上生成 sign **完全一致**（MATCH=true）✅
  - 模拟 VPAY 异步回调（form 表单 + 正确签名）→ 响应 `HTTP 200` + `success` ✅
  - 订单 `PENDING`→`DELIVERED`，payment_logs 走 `create→notify(RECEIVED)→notify(VERIFIED)`，库存 34→33（自动发卡）✅
  - ⚠️ 测试副作用：生成了几个测试订单（contact=epaytest*/cbtest）并消耗商品4 的 1 张卡密，均为测试商品，无影响。
- [ ] 真实扫码支付：需臣哥用手机扫 VPAY 支付页里的聚合码完成真实付款，观察 VPAY APP 监听→回调→发货全链路（代码已验证，真实环境仅差这一步人工确认）。

## 6.1 排错要点（本次踩的坑，后续部署牢记）
- **自定义域（Custom Domain）绑定的 worker 刚部署后，版本切换有延迟**：不是代码没部署，而是 u.bu31.com 这个自定义域还指着旧版本，等 1-2 分钟重测即生效。判断部署是否真生效：先测 USDT 网关（id=1，旧代码也有）能返回真实 payUrl，再确认 epay 分支；或直接查 `workers/scripts/sutashopx` 的 `modified_on` 是否刚更新。
- **金额单位是「分」**：全站（前端 `money()`、USDT `createUsdtPayment`）都 `amount/100` 转元，epay 同样 `(order.amount/100).toFixed(2)`，与既有逻辑一致，勿改。
- **wrangler 新版已移除 `--yes` 参数**：直接 `wrangler deploy` 即可（带 `CF_API_TOKEN` 环境变量 + 本机 10808 代理）。

## 7. v2 后续（可选）
- 把 `payUrl` 用 iframe/弹窗内嵌结账页，用户不离开站点即可看到二维码（体验更好）。
- `return_url` 做"支付成功"展示页（仅供参考，不作为判定）。
