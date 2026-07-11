// 诊断工具：用线上库已填的飞书 webhook 真发一条到飞书，验证卡片格式/加签是否被飞书接受。
// 用法：CFAT=<cloudflare-token> node test/feishu_live.mjs  （会真实向飞书群推送一条测试卡片）
// 注意：依赖线上 D1 的 site_settings，仅用于部署后验证，勿频繁运行。
// 1) 交叉验证加签算法：Web Crypto(同 worker) vs Node 官方 crypto
// 2) 用线上库已填的 webhook 真发一条到飞书，打印真实返回 code，定位安全设置问题
import { createHmac } from 'node:crypto';

const CFAT = process.env.CFAT;
const ACCOUNT = 'bc9124edf58983170fd5122a86fa39e8';
const DB = 'd5984cd4-51e3-478d-a608-292176194218';
const enc = new TextEncoder();

async function d1Query(sql) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CFAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  const j = await r.json();
  if (!j.success) throw new Error('D1 query failed: ' + JSON.stringify(j.errors || j));
  return j.result[0].results;
}

// 与 worker.js sendFeishu 完全一致的加签实现
async function signWebCrypto(secret, timestamp) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}\n${secret}`));
  return btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
}
// 飞书官方参考实现（Python hmac + base64）
function signNode(secret, timestamp) {
  return createHmac('sha256', secret).update(`${timestamp}\n${secret}`).digest('base64');
}

function buildCard() {
  return {
    config: { wide_screen_mode: true },
    header: { title: { tag: 'plain_text', content: '🔔 飞书通知测试' } },
    elements: [
      { tag: 'div', fields: [
        { is_short: true, text: { tag: 'lark_md', content: '**订单号**\nTEST-' + Date.now() } },
        { is_short: true, text: { tag: 'lark_md', content: '**金额**\n¥0.00' } },
        { is_short: true, text: { tag: 'lark_md', content: '**商品**\n飞书通知测试' } },
        { is_short: true, text: { tag: 'lark_md', content: '**数量**\n×1' } },
        { is_short: true, text: { tag: 'lark_md', content: '**支付方式**\n测试' } },
        { is_short: true, text: { tag: 'lark_md', content: '**发货**\n这是一条测试消息' } },
      ] },
      { tag: 'note', elements: [{ tag: 'plain_text', content: 'BU31 商城 · 自测脚本' }] },
    ],
  };
}

async function main() {
  console.log('=== 1) 读取线上 site_settings 的飞书配置 ===');
  const rows = await d1Query('SELECT feishu_webhook, feishu_secret FROM site_settings WHERE id=1');
  const s = rows[0] || {};
  console.log('webhook =', s.feishu_webhook || '(空)');
  console.log('secret   =', s.feishu_secret ? `已填(长度${s.feishu_secret.length})` : '(空)');
  if (!s.feishu_webhook) { console.log('❌ 线上库未配置飞书 webhook，无法真发'); return; }

  console.log('\n=== 2) 加签算法交叉验证 ===');
  const secret = s.feishu_secret || '';
  const ts = Math.floor(Date.now() / 1000);
  let a = '';
  if (secret) {
    a = await signWebCrypto(secret, ts);
    const b = signNode(secret, ts);
    console.log('Web Crypto sign =', a);
    console.log('Node crypto sign =', b);
    console.log('两种算法一致     =', a === b ? 'YES' : 'NO');
  } else {
    console.log('secret 为空 -> 不启用加签（与 worker 行为一致：飞书侧应未开启加签）');
  }

  console.log('\n=== 3) 真发一条到飞书（与 worker.sendFeishu 同构请求体）===');
  const body = { msg_type: 'interactive', card: buildCard() };
  if (secret && a) { body.timestamp = String(ts); body.sign = a; }
  const resp = await fetch(s.feishu_webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const txt = await resp.text();
  console.log('飞书 HTTP 状态 =', resp.status);
  console.log('飞书返回体     =', txt);
  let code = null, msg = '';
  try { const j = JSON.parse(txt); code = j.code; msg = j.msg; } catch {}
  console.log('解析 code      =', code, 'msg =', msg);
  if (code === 0) console.log('✅ 飞书已收到并展示（链路完全打通）');
  else if (code === 19010) console.log('→ 加签不匹配：飞书开了加签 → 后台“签名密钥”必须和飞书机器人里的 Secret 一致；没开加签 → 后台“签名密钥”留空');
  else if (code === 19021) console.log('→ 关键词不匹配：飞书开了自定义关键词，卡片标题需含该词；建议关闭关键词或设成“通知”');
  else if (code === 19020 || code === 19024) console.log('→ Webhook 无效：机器人可能被删，重新复制完整地址');
  else if (code === 19011) console.log('→ 发送太频繁，稍等几秒再试');
  else console.log('→ 见飞书官方错误码文档定位');
}

main().catch((e) => { console.error('脚本异常:', e); process.exit(1); });
