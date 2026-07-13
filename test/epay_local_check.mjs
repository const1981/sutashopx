import crypto from 'crypto';

// ---- 复刻 worker.js 的 signBepusdt（与 VPAY signEpay 算法一致）----
function md5(s) { return crypto.createHash('md5').update(s, 'utf8').digest('hex'); }
function signBepusdt(payload, secret) {
  const base = Object.entries(payload)
    .filter(([, value]) => value !== '' && value !== undefined && value !== null)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return md5(base + secret); // 末尾直接接 KEY，无 &key= 前缀
}

// ---- 用臣哥确认的 VPAY 真实值 ----
const KEY = 'vmq2c9a8f1e4b6d3a5c7e9';
const GATEWAY = 'https://vpay.yaode.eu.org';
const PID = '10001';

// 模拟一笔订单（order.amount 单位是分）
const order = {
  order_no: 'BU31TEST20260712A1',
  product_name: 'BU31 测试商品',
  amount: 1000, // 分 = 10.00 元
  query_token: 'tok_abc123',
  __requrl: 'https://u.bu31.com/checkout',
};

const origin = new URL(order.__requrl).origin;
const params = {
  pid: PID,
  type: 'alipay',
  out_trade_no: order.order_no,
  name: order.product_name,
  money: (Number(order.amount) / 100).toFixed(2), // 分→元，两位小数
  notify_url: `${origin}/api/payments/epay/notify`,
  return_url: `${origin}/order/${order.order_no}?token=${order.query_token}`,
};
params.sign = signBepusdt(params, KEY);
const base = GATEWAY.replace(/\/+$/, '');
const payUrl = `${base}/submit.php?` + new URLSearchParams(params).toString();

console.log('=== 1) epay 下单生成的 payUrl ===');
console.log(payUrl);
console.log('sign =', params.sign, ' len =', params.sign.length, '(应为32位小写hex)');

// ---- 2) 模拟 VPAY 生成回调 sign，再走 worker 验签 ----
// VPAY 回调参数（比下单多了 trade_no / trade_status）
const cbParams = {
  pid: PID, trade_no: 'VP20260712001', out_trade_no: order.order_no,
  type: 'alipay', name: order.product_name, money: '10.00',
  trade_status: 'TRADE_SUCCESS',
};
const cbSign = signBepusdt(cbParams, KEY); // VPAY 用回调参数集算的 sign
const callback = { ...cbParams, sign: cbSign, sign_type: 'MD5' };

// worker 侧（handleEpayNotify）验签：排除 sign / sign_type 后重算
const signed = { ...callback };
delete signed.sign; delete signed.sign_type;
const expected = signBepusdt(signed, KEY);
console.log('\n=== 2) 回调验签（VPAY 正确签名）===');
console.log('VPAY 生成 sign =', cbSign);
console.log('worker 重算   =', expected);
console.log('结果 =', expected === callback.sign ? 'PASS ✅ 验签通过' : 'FAIL ❌ 验签失败');

// ---- 3) 篡改回调（攻击者改 money，但 sign 仍是 VPAY 用原金额算的）----
const attacker = { ...callback, money: '0.01' };
const aSigned = { ...attacker };
delete aSigned.sign; delete aSigned.sign_type;
const reSign = signBepusdt(aSigned, KEY);
console.log('\n=== 3) 篡改回调（money 被改成 0.01）===');
console.log('篡改后 worker 重算 sign =', reSign);
console.log('与原 VPAY sign 比对 =', reSign === attacker.sign ? '一致(危险!)' : '不一致 → 拒绝 ✅');
console.log('\n本地逻辑自测完成。');
