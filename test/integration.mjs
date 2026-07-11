// 端到端集成自测：用 node:sqlite 跑真实 schema，把 Worker.fetch 真正跑一遍
// node test/integration.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import worker from '../src/worker.js';

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra ?? ''); } }

function signBepusdt(payload, secret) {
  const base = Object.entries(payload)
    .filter(([, value]) => value !== '' && value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return createHash('md5').update(base + secret).digest('hex');
}

// ---- 建内存库 ----
const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
db.exec(readFileSync(new URL('../seed.sql', import.meta.url), 'utf8'));

// ---- 伪 D1 适配器（兼容 worker 用法）----
const fakeD1 = {
  prepare(sql) {
    const stmt = db.prepare(sql);
    return {
      bind(...params) {
        // node:sqlite 用 ? 占位，params 直接传
        this._stmt = stmt; this._params = params; return this;
      },
      async all() {
        const rows = this._stmt.all(...this._params);
        return { results: rows };
      },
      async first() {
        return this._stmt.get(...this._params) ?? null;
      },
      async run() {
        const info = this._stmt.run(...this._params);
        return { meta: { last_row_id: Number(info.lastInsertRowid) } };
      },
    };
  },
};

// ---- 伪 R2 适配器 ----
const r2Store = new Map();
const fakeR2 = {
  async put(key, val, opts) { r2Store.set(key, { body: val, httpMetadata: opts && opts.httpMetadata ? opts.httpMetadata : {} }); return { ok: true }; },
  async get(key) { const v = r2Store.get(key); return v ? { body: v.body, httpMetadata: v.httpMetadata } : null; },
  async delete(key) { r2Store.delete(key); return { ok: true }; },
};

const env = {
  DB: fakeD1,
  ASSETS: { fetch: () => new Response('static', { status: 200 }) },
  R2: fakeR2,
  AUTH_SECRET: 'integration-secret',
  AI_API_KEY: 'test-machine-key-123',
  PAYMENT_MODE: 'demo',
  STRIPE_CURRENCY: 'usd',
};

// ---- mock 外部 fetch（用于 BEpusdt 等网关 + 飞书）----
let feishuCalls = 0;
let lastFeishuBody = null;
const originalFetch = globalThis.fetch;
globalThis.fetch = async function (input, init) {
  const url = typeof input === 'string' ? input : (input.url || input.href || String(input));
  if (url.includes('/api/v1/order/create-order')) {
    return new Response(JSON.stringify({
      status_code: 200,
      message: 'ok',
      data: { payment_url: 'https://bepusdt.example.com/pay/mock-123', trade_id: 'TBE123' }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.includes('open.feishu.cn')) {
    feishuCalls++;
    try { lastFeishuBody = JSON.parse(init && init.body ? init.body : '{}'); } catch (e) {}
    return new Response(JSON.stringify({ code: 0, msg: 'success' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return originalFetch(input, init);
};

// ---- 请求辅助 ----
function req(method, path, body, headers = {}) {
  const url = 'https://shop.test' + path;
  const init = { method, headers: { ...headers } };
  if (body !== undefined && body !== null) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
  return new Request(url, init);
}
async function jr(response) { return { status: response.status, data: await response.json().catch(() => ({})) }; }

const ctx = {};

// 1. 公开配置
let r = await worker.fetch(req('GET', '/api/config'), env, ctx);
let d = await jr(r);
ok('GET /api/config 200', r.status === 200);
ok('配置含站点名', d.data.site && d.data.site.site_name === 'BU31 商城');
ok('配置含 4 个分类', d.data.categories.length === 4);
ok('配置含 3 个种子幻灯片', Array.isArray(d.data.banners) && d.data.banners.length === 3, d.data.banners && d.data.banners.length);
ok('幻灯片含标题字段', d.data.banners[0] && d.data.banners[0].title === '数字好物 支付即发', d.data.banners[0]);

// 2. 商品列表
r = await worker.fetch(req('GET', '/api/products'), env, ctx);
d = await jr(r);
ok('GET /api/products 200', r.status === 200);
ok('商品列表含 3 个种子商品', d.data.items.length === 3, d.data.items.length);
ok('商品含价格字段', typeof d.data.items[0].price === 'number');

// 3. 后台登录
r = await worker.fetch(req('POST', '/api/admin/login', { username: 'admin', password: 'admin123456' }), env, ctx);
d = await jr(r);
ok('管理员登录成功', r.status === 200 && d.data.token);
const token = d.data.token;

// 4. 未带 token 访问后台被拒
r = await worker.fetch(req('GET', '/api/admin/stats'), env, ctx);
ok('无 token 访问后台 401', r.status === 401);

// 5. 带 token 查统计
r = await worker.fetch(req('GET', '/api/admin/stats', null, { Authorization: 'Bearer ' + token }), env, ctx);
d = await jr(r);
ok('带 token 查统计 200', r.status === 200);
ok('统计含商品数=3', d.data.products === 3, d.data.products);

// 6. 下单（演示商品 1，库存 8 张卡）
r = await worker.fetch(req('POST', '/api/checkout', { productId: 1, quantity: 2 }), env, ctx);
d = await jr(r);
ok('下单成功', r.status === 200 && d.data.orderNo);
ok('演示模式返回成功页 payUrl', d.data.payUrl.includes('/success.html?order='), d.data.payUrl);
const orderNo = d.data.orderNo;
const orderToken = d.data.token;

// 7. 演示支付完成 -> 自动发货
r = await worker.fetch(req('POST', '/api/pay/demo', { orderNo }), env, ctx);
d = await jr(r);
ok('演示支付后状态为已发货', d.data.status === 'DELIVERED', d.data.status);
ok('演示支付发出 2 张卡密', d.data.keys.length === 2, d.data.keys);
const usedKey = d.data.keys[0];

// 8. 凭 token 查订单拿到卡密
r = await worker.fetch(req('GET', `/api/orders/${orderNo}?token=${orderToken}`), env, ctx);
d = await jr(r);
ok('查订单返回卡密', d.data.keys.includes(usedKey));
ok('查订单无 token 被拒', (await jr(await worker.fetch(req('GET', `/api/orders/${orderNo}`), env, ctx))).status === 403);

// 9. 库存扣减：商品1 原本 8 张，卖了 2 张 -> 剩 6
r = await worker.fetch(req('GET', '/api/products/1'), env, ctx);
d = await jr(r);
ok('商品1 剩余卡密=6', d.data.product.availableStock === 6, d.data.product.availableStock);

// 10. 后台导入卡密
r = await worker.fetch(req('POST', `/api/admin/products/1/keys`, { keys: 'NEW-1\nNEW-2\nNEW-3', batch_no: 't' }, { Authorization: 'Bearer ' + token }), env, ctx);
d = await jr(r);
ok('导入 3 张卡密', d.data.imported === 3, d.data.imported);
r = await worker.fetch(req('GET', '/api/products/1'), env, ctx);
d = await jr(r);
ok('导入后剩余卡密=9', d.data.product.availableStock === 9, d.data.product.availableStock);

// 11. 新建商品
r = await worker.fetch(req('POST', '/api/admin/products', { name: '测试商品', price: 12.5, delivery_type: 'FIXED', fixed_content: 'HELLO', stock_mode: 'UNLIMITED' }, { Authorization: 'Bearer ' + token }), env, ctx);
d = await jr(r);
ok('新建商品成功', r.status === 200 && d.data.id);
const newId = d.data.id;

// 12. 购买固定内容商品 -> 固定内容发货
r = await worker.fetch(req('POST', '/api/checkout', { productId: newId, quantity: 1 }), env, ctx);
d = await jr(r);
const o2 = d.data.orderNo, t2 = d.data.token;
r = await worker.fetch(req('POST', '/api/pay/demo', { orderNo: o2 }), env, ctx);
d = await jr(r);
ok('固定内容商品发货内容为 HELLO', d.data.keys.includes('HELLO'), d.data.keys);
ok('固定内容商品状态为已发货(DELIVERED)', d.data.status === 'DELIVERED', d.data.status);

// 13. 修改密码（需旧密码）
r = await worker.fetch(req('PUT', '/api/admin/password', { old_password: 'admin123456', password: 'newpass123' }, { Authorization: 'Bearer ' + token }), env, ctx);
ok('修改密码成功', r.status === 200);
r = await worker.fetch(req('POST', '/api/admin/login', { username: 'admin', password: 'newpass123' }), env, ctx);
ok('新密码可登录', r.status === 200);
// 改回默认，避免影响后续用例
r = await worker.fetch(req('PUT', '/api/admin/password', { old_password: 'newpass123', password: 'admin123456' }, { Authorization: 'Bearer ' + token }), env, ctx);
ok('改回默认密码成功', r.status === 200);

// 14. 幻灯片后台 CRUD
r = await worker.fetch(req('GET', '/api/admin/banners', null, { Authorization: 'Bearer ' + token }), env, ctx);
d = await jr(r);
ok('后台幻灯片列表=3', d.data.items && d.data.items.length === 3, d.data.items && d.data.items.length);
r = await worker.fetch(req('POST', '/api/admin/banners', { title: '新幻灯片', tag: '新', subtitle: '测试', mode: 'image', image_url: 'https://x/y.jpg', link_url: 'https://bu31.com', sort: 9 }, { Authorization: 'Bearer ' + token }), env, ctx);
d = await jr(r);
ok('新增幻灯片成功', r.status === 200 && d.data.id, d.data);
const bId = d.data.id;
r = await worker.fetch(req('PUT', '/api/admin/banners/' + bId, { title: '改后标题', mode: 'gradient', gradient: 'linear-gradient(135deg,#111,#222)', status: 0 }, { Authorization: 'Bearer ' + token }), env, ctx);
ok('编辑幻灯片成功', r.status === 200);
// 隐藏后前台 config 不应返回它（仍是 3 条）
r = await worker.fetch(req('GET', '/api/config'), env, ctx);
d = await jr(r);
ok('隐藏的幻灯片不在前台(仍3条)', d.data.banners.length === 3, d.data.banners.length);
r = await worker.fetch(req('DELETE', '/api/admin/banners/' + bId, null, { Authorization: 'Bearer ' + token }), env, ctx);
ok('删除幻灯片成功', r.status === 200);

// 15. 支付网关配置 + USDT 全流程
// 15.1 启用 USDT 网关（BEpusdt 风格，带钱包地址 + 启用手动/网关回调）
r = await worker.fetch(req('PUT', '/api/admin/gateways/1', {
  type: 'usdt', display_name: 'USDT-TRC20', gateway_url: '', app_id: '', app_secret: '',
  extra: { chain: 'TRC20', currency: 'USDT', wallet: 'TXyzWalletAddress123', rate: 1 }, sort: 1, enabled: 1,
}, { Authorization: 'Bearer ' + token }), env, ctx);
ok('启用 USDT 网关成功', r.status === 200);
r = await worker.fetch(req('GET', '/api/config'), env, ctx);
d = await jr(r);
ok('前台 config 暴露已启用的 USDT 网关', d.data.gateways.length === 1 && d.data.gateways[0].type === 'usdt', d.data.gateways);
ok('前台网关不含密钥', d.data.gateways[0].app_secret === undefined);

// 15.2 用 USDT 网关下单
r = await worker.fetch(req('POST', '/api/checkout', { productId: 1, quantity: 1, gateway: 1 }), env, ctx);
d = await jr(r);
ok('USDT 下单成功', r.status === 200 && d.data.orderNo);
ok('USDT 订单 payUrl 指向 crypto 成功页', d.data.payUrl.includes('/success.html?order=') && d.data.payUrl.includes('crypto=1'), d.data.payUrl);
const usdtOrder = d.data.orderNo, usdtToken = d.data.token;
r = await worker.fetch(req('GET', `/api/pay/usdt/info?order=${usdtOrder}`), env, ctx);
d = await jr(r);
ok('USDT 收款信息含钱包地址', d.data.crypto && d.data.crypto.address === 'TXyzWalletAddress123', d.data.crypto);
ok('USDT 收款金额换算正确(990分=$9.90=9.90 USDT)', d.data.crypto && d.data.crypto.amount === '9.90', d.data.crypto);

// 15.3 模拟 BEpusdt 回调（status=2）自动发货
r = await worker.fetch(req('POST', '/api/payments/bepusdt/notify', { order_id: usdtOrder, status: 2, amount: '9.90', trade_id: 'T123' }), env, ctx);
ok('USDT 回调响应 200 + ok', r.status === 200);
r = await worker.fetch(req('GET', `/api/orders/${usdtOrder}?token=${usdtToken}`), env, ctx);
d = await jr(r);
ok('USDT 回调后订单已发货', d.data.order.status === 'DELIVERED', d.data);
ok('USDT 回调自动发出卡密', d.data.keys && d.data.keys.length === 1, d.data);

// 15.4 真实 BEpusdt 网关模式（带 gateway_url + app_secret，走收银台）
r = await worker.fetch(req('PUT', '/api/admin/gateways/1', {
  type: 'usdt', display_name: 'USDT-BEpusdt', gateway_url: 'https://k00ytcrlnb.execute-api.ap-east-1.amazonaws.com', app_id: '1000', app_secret: 'bepusdt_test_secret',
  extra: { chain: 'TRC20', currency: 'USDT', wallet: 'TWalletAddr', rate: 1 }, sort: 1, enabled: 1,
}, { Authorization: 'Bearer ' + token }), env, ctx);
ok('配置真实 BEpusdt 网关成功', r.status === 200);
r = await worker.fetch(req('POST', '/api/checkout', { productId: 1, quantity: 1, gateway: 1 }), env, ctx);
d = await jr(r);
ok('BEpusdt 真实网关下单成功', d.data.orderNo && d.data.payUrl === 'https://bepusdt.example.com/pay/mock-123', d.data);
const realOrder = d.data.orderNo, realToken = d.data.token;

// 15.4.1 模拟 BEpusdt 带签名回调
const cbPayload = { order_id: realOrder, status: 2, amount: '9.90', trade_id: 'TBE123' };
const cbSignature = signBepusdt(cbPayload, 'bepusdt_test_secret');
r = await worker.fetch(req('POST', '/api/payments/bepusdt/notify', { ...cbPayload, signature: cbSignature }), env, ctx);
ok('BEpusdt 签名回调响应 200 + ok', r.status === 200);
r = await worker.fetch(req('GET', `/api/orders/${realOrder}?token=${realToken}`), env, ctx);
d = await jr(r);
ok('BEpusdt 回调后订单已发货', d.data.order.status === 'DELIVERED', d.data);

// 15.5 手动确认模式（无网关地址，仅钱包地址）
r = await worker.fetch(req('PUT', '/api/admin/gateways/1', {
  type: 'usdt', display_name: 'USDT-手动', gateway_url: '', app_id: '', app_secret: '',
  extra: { chain: 'TRC20', currency: 'USDT', wallet: 'TManualAddr', rate: 1 }, sort: 1, enabled: 1,
}, { Authorization: 'Bearer ' + token }), env, ctx);
r = await worker.fetch(req('POST', '/api/checkout', { productId: 1, quantity: 1, gateway: 1 }), env, ctx);
d = await jr(r);
const manualOrder = d.data.orderNo, manualToken = d.data.token;
r = await worker.fetch(req('POST', '/api/pay/usdt/confirm', { orderNo: manualOrder, token: manualToken }), env, ctx);
d = await jr(r);
ok('手动确认后订单已发货', d.data.status === 'DELIVERED', d.data);

// 16. R2 文件上传 + 代理读取
const upBuf = Buffer.from('hello bu31 local r2 test');
const upB64 = upBuf.toString('base64');
const upReq = new Request('https://shop.test/api/admin/upload', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  body: JSON.stringify({ filename: 't.png', contentType: 'image/png', data: upB64 })
});
r = await worker.fetch(upReq, env, ctx);
d = await jr(r);
ok('R2 上传成功返回 key+url', r.status === 200 && d.data.key && d.data.url.includes('/file/'), d.data);
const fileKey = encodeURIComponent(d.data.key);
r = await worker.fetch(req('GET', '/file/' + fileKey), env, ctx);
ok('代理读取 R2 文件成功(200)', r.status === 200, r.status);
r = await worker.fetch(req('GET', '/file/not-exist-key.png'), env, ctx);
ok('读取不存在文件 404', r.status === 404, r.status);

// 17. 静态资源回退
r = await worker.fetch(req('GET', '/'), env, ctx);
ok('根路径返回静态资源', r.status === 200);

// 18. 订单批量删除
r = await worker.fetch(req('GET', '/api/admin/orders?status=all', null, { Authorization: 'Bearer ' + token }), env, ctx);
d = await jr(r);
ok('后台订单列表可拉取', r.status === 200 && Array.isArray(d.data.items), d.data);
const before = d.data.items.length;
ok('存在可用于删除的订单(>=2)', before >= 2, before);
const delIds = d.data.items.slice(0, 2).map(o => o.id);
r = await worker.fetch(req('DELETE', '/api/admin/orders', { ids: delIds }, { Authorization: 'Bearer ' + token }), env, ctx);
d = await jr(r);
ok('批量删除订单成功', r.status === 200 && d.data.ok && d.data.deleted === 2, d.data);
r = await worker.fetch(req('GET', '/api/admin/orders?status=all', null, { Authorization: 'Bearer ' + token }), env, ctx);
d = await jr(r);
ok('删除后订单数减少 2', d.data.items.length === before - 2, d.data.items.length);
// 空 ids 应被拒
r = await worker.fetch(req('DELETE', '/api/admin/orders', { ids: [] }, { Authorization: 'Bearer ' + token }), env, ctx);
ok('空 ids 批量删除被拒', r.status !== 200);

// 19. 修改密码（旧密码校验）
const newPwd = 'newpass123';
r = await worker.fetch(req('PUT', '/api/admin/password', { password: newPwd }, { Authorization: 'Bearer ' + token }), env, ctx);
ok('缺少旧密码改密被拒', r.status !== 200, r.status);
r = await worker.fetch(req('PUT', '/api/admin/password', { old_password: 'wrong', password: newPwd }, { Authorization: 'Bearer ' + token }), env, ctx);
ok('旧密码错误改密被拒', r.status !== 200, r.status);
r = await worker.fetch(req('PUT', '/api/admin/password', { old_password: 'admin123456', password: newPwd }, { Authorization: 'Bearer ' + token }), env, ctx);
ok('旧密码正确改密成功', r.status === 200 && (await jr(r)).data.ok, r.status);
// 改回默认，避免影响其他依赖默认密码的场景
r = await worker.fetch(req('PUT', '/api/admin/password', { old_password: newPwd, password: 'admin123456' }, { Authorization: 'Bearer ' + token }), env, ctx);
ok('改回默认密码成功', r.status === 200, r.status);

// 20. 机器批量接口（x-api-key 鉴权 + 批量建商品/导入卡密/整类清空）
// 注意：用独立临时分类 mtest，避免误删种子分类(ai 即 category_id=1，含演示商品 1/2)
const MKEY = 'test-machine-key-123';
const mreq = (method, path, body) => req(method, path, body, { 'x-api-key': MKEY });
r = await worker.fetch(req('POST', '/api/machine/products/bulk', [{ name: 'x' }]), env, ctx);
ok('无 x-api-key 被拒(401)', r.status === 401, r.status);
r = await worker.fetch(req('POST', '/api/machine/products/bulk', [{ name: 'x' }], { 'x-api-key': 'wrong' }), env, ctx);
ok('错误 x-api-key 被拒(401)', r.status === 401, r.status);
// 先建一个临时分类（后台接口），供机器接口批量投放并整类清空
r = await worker.fetch(req('POST', '/api/admin/categories', { name: '临时机批类', slug: 'mtest', description: 'test' }, { Authorization: 'Bearer ' + token }), env, ctx);
ok('创建临时分类成功', r.status === 200);
r = await worker.fetch(mreq('POST', '/api/machine/products/bulk', [
  { name: '机批量商品A', price: 9.9, category_slug: 'mtest', delivery_type: 'CARD_AUTO' },
  { name: '机批量商品B', price: 0, category_slug: 'mtest', delivery_type: 'FIXED', fixed_content: 'CONTENT-B' }
]), env, ctx);
d = await jr(r);
ok('批量建商品成功', r.status === 200 && d.data.created === 2, d.data);
const newPid = d.data.ids[0];
r = await worker.fetch(mreq('POST', '/api/machine/products/' + newPid + '/keys', { keys: ['K1', 'K2', 'K3'] }), env, ctx);
d = await jr(r);
ok('批量导入卡密成功(3条)', r.status === 200 && d.data.imported === 3, d.data);
r = await worker.fetch(req('GET', '/api/products?cat=mtest', null, {}), env, ctx);
d = await jr(r);
ok('新商品出现在列表', d.data.items.some(it => it.id === newPid), d.data.items.length);
r = await worker.fetch(mreq('DELETE', '/api/machine/category/mtest'), env, ctx);
d = await jr(r);
ok('整类清空成功(删除商品数>0)', r.status === 200 && d.data.deletedProducts > 0, d.data);
// 确认种子演示商品 1 仍存活（后面 21 飞书测试依赖它）
r = await worker.fetch(req('GET', '/api/products/1'), env, ctx);
d = await jr(r);
ok('种子商品 1 未被整类清空误删', r.status === 200 && d.data.product, d.data);

// 21. 飞书通知（支付成功推送）
// 21.1 配置 webhook（无 secret），演示支付应触发飞书
r = await worker.fetch(req('PUT', '/api/admin/settings', { feishu_webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/test', feishu_secret: '' }, { Authorization: 'Bearer ' + token }), env, ctx);
ok('保存飞书 webhook 配置成功', r.status === 200);
feishuCalls = 0; lastFeishuBody = null;
r = await worker.fetch(req('POST', '/api/checkout', { productId: 1, quantity: 1 }), env, ctx);
d = await jr(r);
const oF1 = d.data.orderNo;
r = await worker.fetch(req('POST', '/api/pay/demo', { orderNo: oF1 }), env, ctx);
ok('支付成功触发飞书通知', feishuCalls >= 1, feishuCalls);
ok('飞书消息为 interactive 卡片', lastFeishuBody && lastFeishuBody.msg_type === 'interactive', lastFeishuBody);
ok('飞书卡片含订单号', lastFeishuBody && lastFeishuBody.card && JSON.stringify(lastFeishuBody.card).includes(oF1), lastFeishuBody);
// 防止回归：飞书 div.fields[].text 必须是对象 {tag:'lark_md',content}（之前写成字符串导致 code=11246 卡片解析失败）
const f0 = lastFeishuBody && lastFeishuBody.card && lastFeishuBody.card.elements && lastFeishuBody.card.elements[0].fields && lastFeishuBody.card.elements[0].fields[0].text;
ok('飞书卡片 fields.text 为对象 {tag:lark_md,content}', f0 && typeof f0 === 'object' && f0.tag === 'lark_md' && typeof f0.content === 'string', f0);

// 21.2 配置 secret，验证加签
feishuCalls = 0; lastFeishuBody = null;
r = await worker.fetch(req('PUT', '/api/admin/settings', { feishu_webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/test', feishu_secret: 'mysecret' }, { Authorization: 'Bearer ' + token }), env, ctx);
ok('保存飞书 secret 配置成功', r.status === 200);
r = await worker.fetch(req('POST', '/api/checkout', { productId: 1, quantity: 1 }), env, ctx);
d = await jr(r);
await worker.fetch(req('POST', '/api/pay/demo', { orderNo: d.data.orderNo }), env, ctx);
ok('带 secret 时飞书消息含 sign + timestamp', lastFeishuBody && lastFeishuBody.sign && lastFeishuBody.timestamp, lastFeishuBody);

// 21.3 webhook 清空则不发
feishuCalls = 0;
r = await worker.fetch(req('PUT', '/api/admin/settings', { feishu_webhook: '', feishu_secret: '' }, { Authorization: 'Bearer ' + token }), env, ctx);
ok('清空飞书 webhook 配置成功', r.status === 200);
r = await worker.fetch(req('POST', '/api/checkout', { productId: 1, quantity: 1 }), env, ctx);
d = await jr(r);
await worker.fetch(req('POST', '/api/pay/demo', { orderNo: d.data.orderNo }), env, ctx);
ok('webhook 为空时不发飞书', feishuCalls === 0, feishuCalls);

// 22. 后台「按 ID 取详情」回归（之前 GET /api/admin/products/{id} 与 /categories/{id} 缺失，导致编辑表单空白）
// 22.1 商品详情
r = await worker.fetch(mreq('POST', '/api/machine/products/bulk', [
  { name: '详情回归商品', price: 9.9, category_slug: 'ai', delivery_type: 'CARD_AUTO' }
]), env, ctx);
d = await jr(r);
ok('机器批量建商品(详情回归)成功', r.status === 200 && d.data.created === 1, d.data);
const detPid = d.data.ids[0];
r = await worker.fetch(req('GET', '/api/admin/products/' + detPid, null, { Authorization: 'Bearer ' + token }), env, ctx);
d = await jr(r);
ok('GET 商品详情 200', r.status === 200, r.status);
ok('商品详情含 name 字段', d.data && d.data.name === '详情回归商品', d.data);
ok('商品详情 price 已×100 存分(990)', d.data && d.data.price === 990, d.data && d.data.price);
// 22.2 分类详情
r = await worker.fetch(req('POST', '/api/admin/categories', { name: '详情回归分类', slug: 'detcat', description: 't' }, { Authorization: 'Bearer ' + token }), env, ctx);
d = await jr(r);
const detCid = d.data.id;
r = await worker.fetch(req('GET', '/api/admin/categories/' + detCid, null, { Authorization: 'Bearer ' + token }), env, ctx);
d = await jr(r);
ok('GET 分类详情 200', r.status === 200, r.status);
ok('分类详情含 name 字段', d.data && d.data.name === '详情回归分类', d.data);

console.log(`\n集成测试结果：通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
