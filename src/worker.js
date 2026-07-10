// ============================================================
//  BU31 极简卡密商城 · 后端（Cloudflare Worker，原生 JS，零依赖）
//  - 前台静态资源由 env.ASSETS 提供
//  - /api/* 走这里
//  改逻辑只需要动这一个文件。
// ============================================================

// ---------- 小工具 ----------
const enc = new TextEncoder();
const nowSec = () => Math.floor(Date.now() / 1000);

function bufToB64url(buf) {
  let str = '';
  const bytes = new Uint8Array(buf);
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBuf(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    status,
  });
}
function jsonErr(msg, status = 400) {
  return json({ error: msg }, status);
}

// ---------- 密码 & 令牌（Web Crypto，无需任何库）----------
// 密码哈希：HMAC(AUTH_SECRET, username:password) —— 简单够用，AUTH_SECRET 为强密钥
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', key, enc.encode(data));
}
export async function hashPassword(secret, username, password) {
  const sig = await hmac(secret, username + ':' + password);
  return bufToB64url(sig);
}
export async function verifyPassword(secret, username, password, stored) {
  const sig = await hashPassword(secret, username, password);
  return sig === stored;
}
// 会话令牌：base64url(payload).base64url(HMAC(payload))
export async function signToken(secret, payload) {
  const body = bufToB64url(enc.encode(JSON.stringify(payload)));
  const sig = bufToB64url(await hmac(secret, body));
  return body + '.' + sig;
}
export async function verifyToken(secret, token) {
  try {
    const [body, sig] = token.split('.');
    const expected = bufToB64url(await hmac(secret, body));
    if (sig !== expected) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBuf(body)));
    if (payload.exp && payload.exp < nowSec()) return null;
    return payload;
  } catch {
    return null;
  }
}
function randHex(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function makeOrderNo() {
  return 'BK' + Date.now().toString(36).toUpperCase() + randHex(3).toUpperCase();
}

// ---------- BEpusdt MD5 签名 ----------
const md5 = (function () {
  'use strict'
function safeAdd(x, y) {
    var lsw = (x & 0xffff) + (y & 0xffff)
    var msw = (x >> 16) + (y >> 16) + (lsw >> 16)
    return (msw << 16) | (lsw & 0xffff)
  }

  /**
   * Bitwise rotate a 32-bit number to the left.
   *
   * @param {number} num 32-bit number
   * @param {number} cnt Rotation count
   * @returns {number} Rotated number
   */
  function bitRotateLeft(num, cnt) {
    return (num << cnt) | (num >>> (32 - cnt))
  }

  /**
   * Basic operation the algorithm uses.
   *
   * @param {number} q q
   * @param {number} a a
   * @param {number} b b
   * @param {number} x x
   * @param {number} s s
   * @param {number} t t
   * @returns {number} Result
   */
  function md5cmn(q, a, b, x, s, t) {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b)
  }
  /**
   * Basic operation the algorithm uses.
   *
   * @param {number} a a
   * @param {number} b b
   * @param {number} c c
   * @param {number} d d
   * @param {number} x x
   * @param {number} s s
   * @param {number} t t
   * @returns {number} Result
   */
  function md5ff(a, b, c, d, x, s, t) {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t)
  }
  /**
   * Basic operation the algorithm uses.
   *
   * @param {number} a a
   * @param {number} b b
   * @param {number} c c
   * @param {number} d d
   * @param {number} x x
   * @param {number} s s
   * @param {number} t t
   * @returns {number} Result
   */
  function md5gg(a, b, c, d, x, s, t) {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t)
  }
  /**
   * Basic operation the algorithm uses.
   *
   * @param {number} a a
   * @param {number} b b
   * @param {number} c c
   * @param {number} d d
   * @param {number} x x
   * @param {number} s s
   * @param {number} t t
   * @returns {number} Result
   */
  function md5hh(a, b, c, d, x, s, t) {
    return md5cmn(b ^ c ^ d, a, b, x, s, t)
  }
  /**
   * Basic operation the algorithm uses.
   *
   * @param {number} a a
   * @param {number} b b
   * @param {number} c c
   * @param {number} d d
   * @param {number} x x
   * @param {number} s s
   * @param {number} t t
   * @returns {number} Result
   */
  function md5ii(a, b, c, d, x, s, t) {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t)
  }

  /**
   * Calculate the MD5 of an array of little-endian words, and a bit length.
   *
   * @param {Array} x Array of little-endian words
   * @param {number} len Bit length
   * @returns {Array<number>} MD5 Array
   */
  function binlMD5(x, len) {
    /* append padding */
    x[len >> 5] |= 0x80 << len % 32
    x[(((len + 64) >>> 9) << 4) + 14] = len

    var i
    var olda
    var oldb
    var oldc
    var oldd
    var a = 1732584193
    var b = -271733879
    var c = -1732584194
    var d = 271733878

    for (i = 0; i < x.length; i += 16) {
      olda = a
      oldb = b
      oldc = c
      oldd = d

      a = md5ff(a, b, c, d, x[i], 7, -680876936)
      d = md5ff(d, a, b, c, x[i + 1], 12, -389564586)
      c = md5ff(c, d, a, b, x[i + 2], 17, 606105819)
      b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330)
      a = md5ff(a, b, c, d, x[i + 4], 7, -176418897)
      d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426)
      c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341)
      b = md5ff(b, c, d, a, x[i + 7], 22, -45705983)
      a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416)
      d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417)
      c = md5ff(c, d, a, b, x[i + 10], 17, -42063)
      b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162)
      a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682)
      d = md5ff(d, a, b, c, x[i + 13], 12, -40341101)
      c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290)
      b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329)

      a = md5gg(a, b, c, d, x[i + 1], 5, -165796510)
      d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632)
      c = md5gg(c, d, a, b, x[i + 11], 14, 643717713)
      b = md5gg(b, c, d, a, x[i], 20, -373897302)
      a = md5gg(a, b, c, d, x[i + 5], 5, -701558691)
      d = md5gg(d, a, b, c, x[i + 10], 9, 38016083)
      c = md5gg(c, d, a, b, x[i + 15], 14, -660478335)
      b = md5gg(b, c, d, a, x[i + 4], 20, -405537848)
      a = md5gg(a, b, c, d, x[i + 9], 5, 568446438)
      d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690)
      c = md5gg(c, d, a, b, x[i + 3], 14, -187363961)
      b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501)
      a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467)
      d = md5gg(d, a, b, c, x[i + 2], 9, -51403784)
      c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473)
      b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734)

      a = md5hh(a, b, c, d, x[i + 5], 4, -378558)
      d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463)
      c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562)
      b = md5hh(b, c, d, a, x[i + 14], 23, -35309556)
      a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060)
      d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353)
      c = md5hh(c, d, a, b, x[i + 7], 16, -155497632)
      b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640)
      a = md5hh(a, b, c, d, x[i + 13], 4, 681279174)
      d = md5hh(d, a, b, c, x[i], 11, -358537222)
      c = md5hh(c, d, a, b, x[i + 3], 16, -722521979)
      b = md5hh(b, c, d, a, x[i + 6], 23, 76029189)
      a = md5hh(a, b, c, d, x[i + 9], 4, -640364487)
      d = md5hh(d, a, b, c, x[i + 12], 11, -421815835)
      c = md5hh(c, d, a, b, x[i + 15], 16, 530742520)
      b = md5hh(b, c, d, a, x[i + 2], 23, -995338651)

      a = md5ii(a, b, c, d, x[i], 6, -198630844)
      d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415)
      c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905)
      b = md5ii(b, c, d, a, x[i + 5], 21, -57434055)
      a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571)
      d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606)
      c = md5ii(c, d, a, b, x[i + 10], 15, -1051523)
      b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799)
      a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359)
      d = md5ii(d, a, b, c, x[i + 15], 10, -30611744)
      c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380)
      b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649)
      a = md5ii(a, b, c, d, x[i + 4], 6, -145523070)
      d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379)
      c = md5ii(c, d, a, b, x[i + 2], 15, 718787259)
      b = md5ii(b, c, d, a, x[i + 9], 21, -343485551)

      a = safeAdd(a, olda)
      b = safeAdd(b, oldb)
      c = safeAdd(c, oldc)
      d = safeAdd(d, oldd)
    }
    return [a, b, c, d]
  }

  /**
   * Convert an array of little-endian words to a string
   *
   * @param {Array<number>} input MD5 Array
   * @returns {string} MD5 string
   */
  function binl2rstr(input) {
    var i
    var output = ''
    var length32 = input.length * 32
    for (i = 0; i < length32; i += 8) {
      output += String.fromCharCode((input[i >> 5] >>> i % 32) & 0xff)
    }
    return output
  }

  /**
   * Convert a raw string to an array of little-endian words
   * Characters >255 have their high-byte silently ignored.
   *
   * @param {string} input Raw input string
   * @returns {Array<number>} Array of little-endian words
   */
  function rstr2binl(input) {
    var i
    var output = []
    output[(input.length >> 2) - 1] = undefined
    for (i = 0; i < output.length; i += 1) {
      output[i] = 0
    }
    var length8 = input.length * 8
    for (i = 0; i < length8; i += 8) {
      output[i >> 5] |= (input.charCodeAt(i / 8) & 0xff) << i % 32
    }
    return output
  }

  /**
   * Calculate the MD5 of a raw string
   *
   * @param {string} s Input string
   * @returns {string} Raw MD5 string
   */
  function rstrMD5(s) {
    return binl2rstr(binlMD5(rstr2binl(s), s.length * 8))
  }

  /**
   * Calculates the HMAC-MD5 of a key and some data (raw strings)
   *
   * @param {string} key HMAC key
   * @param {string} data Raw input string
   * @returns {string} Raw MD5 string
   */
  function rstrHMACMD5(key, data) {
    var i
    var bkey = rstr2binl(key)
    var ipad = []
    var opad = []
    var hash
    ipad[15] = opad[15] = undefined
    if (bkey.length > 16) {
      bkey = binlMD5(bkey, key.length * 8)
    }
    for (i = 0; i < 16; i += 1) {
      ipad[i] = bkey[i] ^ 0x36363636
      opad[i] = bkey[i] ^ 0x5c5c5c5c
    }
    hash = binlMD5(ipad.concat(rstr2binl(data)), 512 + data.length * 8)
    return binl2rstr(binlMD5(opad.concat(hash), 512 + 128))
  }

  /**
   * Convert a raw string to a hex string
   *
   * @param {string} input Raw input string
   * @returns {string} Hex encoded string
   */
  function rstr2hex(input) {
    var hexTab = '0123456789abcdef'
    var output = ''
    var x
    var i
    for (i = 0; i < input.length; i += 1) {
      x = input.charCodeAt(i)
      output += hexTab.charAt((x >>> 4) & 0x0f) + hexTab.charAt(x & 0x0f)
    }
    return output
  }

  /**
   * Encode a string as UTF-8
   *
   * @param {string} input Input string
   * @returns {string} UTF8 string
   */
  function str2rstrUTF8(input) {
    return unescape(encodeURIComponent(input))
  }

  /**
   * Encodes input string as raw MD5 string
   *
   * @param {string} s Input string
   * @returns {string} Raw MD5 string
   */
  function rawMD5(s) {
    return rstrMD5(str2rstrUTF8(s))
  }
  /**
   * Encodes input string as Hex encoded string
   *
   * @param {string} s Input string
   * @returns {string} Hex encoded string
   */
  function hexMD5(s) {
    return rstr2hex(rawMD5(s))
  }
  /**
   * Calculates the raw HMAC-MD5 for the given key and data
   *
   * @param {string} k HMAC key
   * @param {string} d Input string
   * @returns {string} Raw MD5 string
   */
  function rawHMACMD5(k, d) {
    return rstrHMACMD5(str2rstrUTF8(k), str2rstrUTF8(d))
  }
  /**
   * Calculates the Hex encoded HMAC-MD5 for the given key and data
   *
   * @param {string} k HMAC key
   * @param {string} d Input string
   * @returns {string} Raw MD5 string
   */
  function hexHMACMD5(k, d) {
    return rstr2hex(rawHMACMD5(k, d))
  }

  /**
   * Calculates MD5 value for a given string.
   * If a key is provided, calculates the HMAC-MD5 value.
   * Returns a Hex encoded string unless the raw argument is given.
   *
   * @param {string} string Input string
   * @param {string} [key] HMAC key
   * @param {boolean} [raw] Raw output switch
   * @returns {string} MD5 output
   */
  function md5(string, key, raw) {
    if (!key) {
      if (!raw) {
        return hexMD5(string)
      }
      return rawMD5(string)
    }
    if (!raw) {
      return hexHMACMD5(key, string)
    }
    return rawHMACMD5(key, string)
  }
  return md5
})();

function signBepusdt(payload, secret) {
  const base = Object.entries(payload)
    .filter(([, value]) => value !== '' && value !== undefined && value !== null)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return md5(base + secret);
}

// ---------- D1 封装 ----------
function q(env, sql, ...params) {
  return env.DB.prepare(sql).bind(...params);
}
async function all(env, sql, ...params) {
  const r = await q(env, sql, ...params).all();
  return r.results || [];
}
async function first(env, sql, ...params) {
  return await q(env, sql, ...params).first();
}
async function run(env, sql, ...params) {
  return await q(env, sql, ...params).run();
}
async function insertId(env, sql, ...params) {
  const r = await q(env, sql, ...params).run();
  return r.meta && r.meta.last_row_id;
}

// ---------- Cookie ----------
function getCookie(req, name) {
  const c = req.headers.get('Cookie');
  if (!c) return null;
  for (const part of c.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === name) return decodeURIComponent(v);
  }
  return null;
}

// ---------- 鉴权 ----------
async function ensureDefaultAdmin(env) {
  const c = await first(env, 'SELECT COUNT(*) AS n FROM admins');
  if (c && c.n === 0) {
    const ph = await hashPassword(env.AUTH_SECRET, 'admin', 'admin123456');
    await run(
      env,
      'INSERT INTO admins (username, password_hash, nickname, status, created_at) VALUES (?,?,?,?,?)',
      'admin', ph, '管理员', 1, nowSec()
    );
  }
}
async function requireAdmin(request, env) {
  if (!env.AUTH_SECRET) return null;
  await ensureDefaultAdmin(env);
  const auth = request.headers.get('Authorization');
  let token = null;
  if (auth && auth.startsWith('Bearer ')) token = auth.slice(7);
  if (!token) token = getCookie(request, 'admin_token');
  if (!token) return null;
  const payload = await verifyToken(env.AUTH_SECRET, token);
  if (!payload) return null;
  const admin = await first(
    env, 'SELECT id,username,nickname,status FROM admins WHERE id=?', payload.sub
  );
  if (!admin || admin.status !== 1) return null;
  return admin;
}

// ---------- 发货逻辑 ----------
// 从卡池里挑 need 张未售卡（纯函数，便于测试）
export function pickCards(cards, need) {
  return cards.filter((c) => c.status === 0 || c.status === '0').slice(0, need);
}

async function deliverOrder(env, order) {
  const product = await first(env, 'SELECT * FROM products WHERE id=?', order.product_id);
  if (!product) return { keys: [], note: '商品不存在', status: 'FAILED' };

  let keys = [];
  let note = '';

  if (product.delivery_type === 'FIXED') {
    keys = product.fixed_content ? [product.fixed_content] : [];
    if (!keys.length) note = '未配置固定发货内容';
  } else if (product.delivery_type === 'MANUAL') {
    note = '等待人工发货';
  } else {
    // CARD_AUTO
    const rows = await all(
      env, 'SELECT * FROM cards WHERE product_id=? AND status=0 ORDER BY id ASC LIMIT ?',
      product.id, order.quantity
    );
    const taken = pickCards(rows, order.quantity);
    for (const c of taken) {
      await run(
        env, 'UPDATE cards SET status=1, order_id=?, sold_at=? WHERE id=?',
        order.id, nowSec(), c.id
      );
    }
    keys = taken.map((c) => c.content);
    if (taken.length < order.quantity) {
      note = `库存不足，仅发出 ${taken.length}/${order.quantity} 张，请补卡后手动补发`;
    }
    if (product.stock_mode === 'FINITE' && taken.length > 0) {
      await run(
        env, 'UPDATE products SET stock = MAX(0, stock - ?) WHERE id=?',
        taken.length, product.id
      );
    }
  }

  const status = product.delivery_type === 'MANUAL' || keys.length === 0 ? 'PAID' : 'DELIVERED';
  await run(
    env,
    'UPDATE orders SET status=?, delivered_keys=?, delivery_note=?, delivered_at=?, paid_at=? WHERE id=?',
    status, JSON.stringify(keys), note, keys.length ? nowSec() : null, nowSec(), order.id
  );
  return { keys, note, status };
}

async function markPaid(env, order, provider, paymentOrderNo) {
  await run(
    env,
    "UPDATE orders SET status='PAID', payment_provider=?, payment_order_no=?, paid_at=? WHERE id=?",
    provider, paymentOrderNo, nowSec(), order.id
  );
  return deliverOrder(env, order);
}

// ---------- 支付适配器 ----------
// 把「最小货币单位(分)」的金额换算成 USDT 数量（rate=1 表示 1 美元=1 USDT 的近似值）
function amountToCrypto(amountFen, rate) {
  const usd = amountFen / 100;
  const crypto = usd * (rate || 1);
  // USDT 保留 2~6 位小数
  return crypto.toFixed(2);
}

// 生成 BEpusdt 订单；优先走网关收银台，失败则回退到静态钱包地址
async function createUsdtPayment(env, order, gateway) {
  const extra = safeJson(gateway.extra, {});
  const chain = extra.chain || 'TRC20';
  const wallet = extra.wallet || '';
  const rate = Number(extra.rate) || 1;
  const currency = extra.currency || 'USDT';
  const cryptoAmount = amountToCrypto(order.amount, rate);

  // 若配置了 BEpusdt 网关地址 + app_secret，走网关创建真实收款订单
  if (gateway.gateway_url && gateway.app_secret) {
    try {
      const base = gateway.gateway_url.replace(/\/+$/, '');
      const origin = new URL(order.__requrl).origin;
      // BEpusdt 不会替换占位符，回跳/回调必须用真实值拼成绝对地址（参照 edgeKey 实现）
      const notifyUrl = (gateway.notify_url && /^https?:\/\//i.test(gateway.notify_url))
        ? gateway.notify_url
        : `${origin}/api/payments/bepusdt/notify`;
      const returnUrl = `${origin}/order/${order.order_no}?token=${order.query_token}`;

      const payload = {
        order_id: order.order_no,
        amount: (order.amount / 100).toFixed(2),
        notify_url: notifyUrl,
        redirect_url: returnUrl,
        name: order.product_name || '',
      };
      const signature = signBepusdt(payload, gateway.app_secret);

      const resp = await fetch(base + '/api/v1/order/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, signature }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.status_code === 200 && data.data?.payment_url) {
        return {
          ok: true, provider: 'usdt', mode: 'usdt',
          payUrl: data.data.payment_url,
          orderNo: order.order_no,
          token: order.query_token,
          tradeId: data.data.trade_id,
          raw: data,
        };
      }
      // 网关调用失败则回退到静态钱包地址模式
    } catch (e) { /* 回退 */ }
  }

  // 回退：直接展示钱包地址让用户转账（半自动，到账靠人工或手动确认）
  return {
    ok: true, provider: 'usdt', mode: 'usdt',
    payUrl: `/success.html?order=${order.order_no}&token=${order.query_token}&crypto=1`,
    crypto: { chain, currency, amount: cryptoAmount, address: wallet, qr: '', orderId: order.order_no, gateway: null },
  };
}

async function createPayment(env, order, product, gatewayId) {
  // 1) 指定了后台网关
  if (gatewayId) {
    const g = await first(env, 'SELECT * FROM payment_gateways WHERE id=? AND enabled=1', gatewayId);
    if (!g) return { ok: false, error: '支付网关不可用或已禁用' };
    if (g.type === 'usdt') return await createUsdtPayment(env, order, g);
    if (g.type === 'stripe' && g.app_secret) {
      // Stripe 也可走网关配置里的密钥
      try {
        const currency = env.STRIPE_CURRENCY || 'usd';
        const params = new URLSearchParams();
        params.set('mode', 'payment');
        params.set('success_url', `${new URL(order.__requrl).origin}/success.html?order=${order.order_no}&token=${order.query_token}&session_id={CHECKOUT_SESSION_ID}`);
        params.set('cancel_url', `${new URL(order.__requrl).origin}/success.html?order=${order.order_no}&cancel=1`);
        params.set('client_reference_id', order.order_no);
        params.set('metadata[orderNo]', order.order_no);
        params.set('line_items[0][quantity]', String(order.quantity));
        params.set('line_items[0][price_data][currency]', currency);
        params.set('line_items[0][price_data][product_data][name]', product.name);
        params.set('line_items[0][price_data][unit_amount]', String(order.unit_price));
        const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + g.app_secret, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params,
        });
        if (!resp.ok) return { ok: false, provider: 'stripe', error: 'Stripe 创建会话失败' };
        const data = await resp.json();
        return { ok: true, provider: 'stripe', payUrl: data.url };
      } catch (e) { return { ok: false, provider: 'stripe', error: e.message }; }
    }
    if (g.type === 'alipay' || g.type === 'epay' || g.type === 'wechat') {
      // 这些网关暂未接真实下单，提示用演示/USDT；这里回退到演示以便测试
      return { ok: true, provider: 'demo', payUrl: `/success.html?order=${order.order_no}&demo=1&token=${order.query_token}` };
    }
  }

  // 2) 未指定网关：按 PAYMENT_MODE / Stripe 密钥 / 演示 回退
  const mode = (env.PAYMENT_MODE || 'auto').toLowerCase();
  const useStripe = mode === 'stripe' || (mode === 'auto' && env.STRIPE_SECRET_KEY);
  if (useStripe && env.STRIPE_SECRET_KEY) {
    try {
      const currency = env.STRIPE_CURRENCY || 'usd';
      const params = new URLSearchParams();
      params.set('mode', 'payment');
      params.set('success_url', `${new URL(order.__requrl).origin}/success.html?order=${order.order_no}&token=${order.query_token}&session_id={CHECKOUT_SESSION_ID}`);
      params.set('cancel_url', `${new URL(order.__requrl).origin}/success.html?order=${order.order_no}&cancel=1`);
      params.set('client_reference_id', order.order_no);
      params.set('metadata[orderNo]', order.order_no);
      params.set('line_items[0][quantity]', String(order.quantity));
      params.set('line_items[0][price_data][currency]', currency);
      params.set('line_items[0][price_data][product_data][name]', product.name);
      params.set('line_items[0][price_data][unit_amount]', String(order.unit_price));
      const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      });
      if (!resp.ok) return { ok: false, provider: 'stripe', error: 'Stripe 创建会话失败' };
      const data = await resp.json();
      return { ok: true, provider: 'stripe', payUrl: data.url };
    } catch (e) { return { ok: false, provider: 'stripe', error: e.message }; }
  }

  // 3) 演示模式
  return { ok: true, provider: 'demo', payUrl: `/success.html?order=${order.order_no}&demo=1&token=${order.query_token}` };
}

function safeJson(str, def) {
  try { return str ? JSON.parse(str) : def; } catch { return def; }
}

// BEpusdt 回调：验签 + 状态处理 + 发货
async function handleUsdtNotify(env, request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonErr('请求体解析失败', 400);
  }
  const orderNo = body.order_id || '';
  const order = await first(env, 'SELECT * FROM orders WHERE order_no=?', orderNo);
  if (!order) return jsonErr('订单不存在', 404);

  // 优先找本订单使用的网关，否则找任意启用的 usdt 网关
  const gw = await first(env, "SELECT * FROM payment_gateways WHERE type='usdt' AND enabled=1 LIMIT 1");
  if (gw && gw.app_secret && body.signature) {
    const signed = { ...body };
    delete signed.signature;
    const expected = signBepusdt(signed, gw.app_secret);
    if (body.signature !== expected) {
      await run(env, 'INSERT INTO payment_logs (order_id,provider,order_no,event_type,raw,verify_status,message,created_at) VALUES (?,?,?,?,?,?,?,?)',
        order.id, 'usdt', orderNo, 'notify', JSON.stringify(body), 'INVALID_SIGN', '签名校验失败', nowSec());
      return jsonErr('签名校验失败', 400);
    }
  }

  await run(env, 'INSERT INTO payment_logs (order_id,provider,order_no,event_type,raw,verify_status,created_at) VALUES (?,?,?,?,?,?,?)',
    order.id, 'usdt', orderNo, 'notify', JSON.stringify(body), 'RECEIVED', nowSec());

  const status = String(body.status || '');
  if (status !== '2') {
    // 1=等待支付, 3=超时；只记录，不发货
    return new Response('ok', { status: 200 });
  }
  if (order.status !== 'PENDING') {
    return new Response('ok', { status: 200 });
  }

  const res = await markPaid(env, order, 'usdt', body.trade_id || 'usdt-' + orderNo);
  await run(env, 'INSERT INTO payment_logs (order_id,provider,order_no,event_type,raw,verify_status,created_at) VALUES (?,?,?,?,?,?,?)',
    order.id, 'usdt', orderNo, 'notify', JSON.stringify(body), 'VERIFIED', nowSec());
  return new Response('ok', { status: 200 });
}

// ---------- 超时订单清理（定时任务）----------
async function expireOrders(env) {
  const cutoff = nowSec() - 30 * 60; // 30 分钟未支付则关闭
  await run(
    env,
    "UPDATE orders SET status='CLOSED', delivery_note='订单超时未支付已自动关闭', updated_at=? WHERE status='PENDING' AND created_at < ?",
    nowSec(), cutoff
  );
}

// ============================================================
//  API 路由
// ============================================================
async function serveFile(env, key) {
  try {
    const obj = await env.R2.get(decodeURIComponent(key));
    if (!obj) return jsonErr('文件不存在', 404);
    return new Response(obj.body, {
      headers: {
        'content-type': obj.httpMetadata?.contentType || 'application/octet-stream',
        'cache-control': 'public, max-age=86400',
      },
    });
  } catch (e) { return jsonErr('读取文件失败: ' + e.message, 500); }
}
async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  // ---- 公开：站点配置 ----
  if (path === '/api/config' && method === 'GET') {
    const s = await first(env, 'SELECT * FROM site_settings WHERE id=1');
    const cats = await all(env, 'SELECT id,name,slug,description FROM categories WHERE status=1 ORDER BY sort ASC');
    const banners = await all(env,
      'SELECT id,tag,title,subtitle,mode,gradient,image_url,link_url FROM banners WHERE status=1 ORDER BY sort ASC, id ASC');
    // 已启用且配置完整的支付网关（前台只暴露 id/type/显示名，不含密钥）
    const gws = await all(env,
      'SELECT id,type,display_name FROM payment_gateways WHERE enabled=1 ORDER BY sort ASC, id ASC');
    return json({ site: s, categories: cats, banners, gateways: gws });
  }

  // ---- 公开：商品列表 ----
  if (path === '/api/products' && method === 'GET') {
    const cat = url.searchParams.get('cat') || 'all';
    const q_ = url.searchParams.get('q') || '';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const pageSize = 12;
    const where = ['p.status=1'];
    const params = [];
    if (cat !== 'all') { where.push('p.category_id=(SELECT id FROM categories WHERE slug=?)'); params.push(cat); }
    if (q_) { where.push('(p.name LIKE ? OR p.description LIKE ?)'); params.push('%' + q_ + '%', '%' + q_ + '%'); }
    const whereSql = 'WHERE ' + where.join(' AND ');
    const totalRow = await first(env, `SELECT COUNT(*) AS n FROM products p ${whereSql}`, ...params);
    const total = totalRow ? totalRow.n : 0;
    const items = await all(
      env,
      `SELECT p.id,p.category_id,p.name,p.slug,p.subtitle,p.description,p.cover_image,p.price,
              p.delivery_type,p.stock_mode,p.stock,p.min_buy,p.max_buy,p.sort,
              c.name AS category_name,c.slug AS category_slug
       FROM products p LEFT JOIN categories c ON c.id=p.category_id
       ${whereSql} ORDER BY p.sort ASC, p.id DESC LIMIT ? OFFSET ?`,
      ...params, pageSize, (page - 1) * pageSize
    );
    const list = items.map((it) => ({
      ...it,
      availableStock: it.stock_mode === 'UNLIMITED' ? null : it.stock,
    }));
    return json({ items: list, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  }

  // ---- 公开：商品详情 ----
  let m = path.match(/^\/api\/products\/(\d+)$/);
  if (m && method === 'GET') {
    const it = await first(
      env,
      `SELECT p.*, c.name AS category_name,c.slug AS category_slug
       FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?`,
      m[1]
    );
    if (!it) return jsonErr('商品不存在', 404);
    // 库存预警值（给前台展示“仅剩 N 件”）
    const cardCount = it.stock_mode === 'FINITE'
      ? (await first(env, 'SELECT COUNT(*) AS n FROM cards WHERE product_id=? AND status=0', it.id)).n
      : null;
    return json({ product: { ...it, availableStock: cardCount } });
  }

  // ---- 公开：下单 ----
  if (path === '/api/checkout' && method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    const productId = parseInt(body.productId, 10);
    let qty = parseInt(body.quantity, 10) || 1;
    if (!productId) return jsonErr('缺少商品ID');
    const product = await first(env, 'SELECT * FROM products WHERE id=?', productId);
    if (!product) return jsonErr('商品不存在');
    if (product.status !== 1) return jsonErr('商品已下架');
    qty = Math.max(product.min_buy, Math.min(product.max_buy, qty));
    if (product.stock_mode === 'FINITE') {
      const avail = (await first(env, 'SELECT COUNT(*) AS n FROM cards WHERE product_id=? AND status=0', product.id)).n;
      if (product.delivery_type === 'CARD_AUTO' && avail < qty) return jsonErr('库存不足');
      if (product.delivery_type !== 'CARD_AUTO' && product.stock < qty) return jsonErr('库存不足');
    }
    const amount = product.price * qty;
    const orderNo = makeOrderNo();
    const token = randHex(16);
    // 选择支付网关：优先用 body.gateway（后台启用的已配置网关），否则回退到 PAYMENT_MODE/Stripe/演示
    const gatewayId = parseInt(body.gateway, 10) || 0;
    const oid = await insertId(
      env,
      `INSERT INTO orders (order_no, query_token, product_id, product_name, unit_price, quantity, amount, contact_value, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?, 'PENDING', ?, ?)`,
      orderNo, token, product.id, product.name, product.price, qty, amount,
      body.contact || null, nowSec(), nowSec()
    );
    const order = await first(env, 'SELECT * FROM orders WHERE id=?', oid);
    order.__requrl = request.url;
    const pay = await createPayment(env, order, product, gatewayId);
    if (!pay.ok) return jsonErr(pay.error || '创建支付失败', 500);
    // 记录支付日志
    await run(
      env,
      'INSERT INTO payment_logs (order_id, provider, order_no, event_type, raw, created_at) VALUES (?,?,?,?,?,?)',
      oid, pay.provider, orderNo, 'create', JSON.stringify(pay), nowSec()
    );
    return json({ orderNo, mode: pay.provider, payUrl: pay.payUrl, token });
  }

  // ---- 公开：演示支付完成 ----
  if (path === '/api/pay/demo' && method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    const order = await first(env, 'SELECT * FROM orders WHERE order_no=?', body.orderNo);
    if (!order) return jsonErr('订单不存在', 404);
    const prodD = await first(env, 'SELECT delivery_type FROM products WHERE id=?', order.product_id);
    const dtype = prodD ? prodD.delivery_type : '';
    if (order.status !== 'PENDING') {
      const keys = order.delivered_keys ? JSON.parse(order.delivered_keys) : [];
      return json({ already: true, status: order.status, keys, note: order.delivery_note, delivery_type: dtype });
    }
    const res = await markPaid(env, order, 'demo', 'demo-' + order.order_no);
    return json({ status: res.status, keys: res.keys, note: res.note, delivery_type: dtype });
  }

  // ---- 公开：BEpusdt 回调 ----
  if (path === '/api/payments/bepusdt/notify' && method === 'POST') {
    return await handleUsdtNotify(env, request);
  }
  // ---- 公开：获取 USDT 收款信息（success 页面展示用）----
  if (path === '/api/pay/usdt/info' && method === 'GET') {
    const orderNo = url.searchParams.get('order') || '';
    const order = await first(env, 'SELECT * FROM orders WHERE order_no=?', orderNo);
    if (!order) return jsonErr('订单不存在', 404);
    if (order.status !== 'PENDING') return json({ paid: true, status: order.status });
    const log = await first(env,
      "SELECT raw FROM payment_logs WHERE order_no=? AND provider='usdt' AND event_type='create' ORDER BY id DESC LIMIT 1", orderNo);
    if (!log) return jsonErr('未找到收款信息', 404);
    const pay = safeJson(log.raw, {});
    return json({ paid: false, crypto: pay.crypto || null });
  }

  // ---- 公开：手动确认已转账（半自动钱包地址模式）----
  if (path === '/api/pay/usdt/confirm' && method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    const order = await first(env, 'SELECT * FROM orders WHERE order_no=?', body.orderNo);
    if (!order) return jsonErr('订单不存在', 404);
    if (body.token !== order.query_token) return jsonErr('无权限', 403);
    if (order.status !== 'PENDING') return json({ already: true, status: order.status });
    const res = await markPaid(env, order, 'usdt', 'usdt-manual-' + order.order_no);
    return json({ status: res.status, keys: res.keys });
  }

  // ---- 公开：查询订单（需 query_token）----
  m = path.match(/^\/api\/orders\/([A-Za-z0-9]+)$/);
  if (m && method === 'GET') {
    const token = url.searchParams.get('token') || '';
    const order = await first(env, 'SELECT * FROM orders WHERE order_no=?', m[1]);
    if (!order) return jsonErr('订单不存在', 404);
    if (token !== order.query_token) return jsonErr('无权限查看', 403);
    const keys = order.delivered_keys ? JSON.parse(order.delivered_keys) : [];
    const prod = await first(env, 'SELECT delivery_type FROM products WHERE id=?', order.product_id);
    return json({
      order: {
        order_no: order.order_no, status: order.status, amount: order.amount,
        quantity: order.quantity, product_name: order.product_name,
        payment_provider: order.payment_provider, created_at: order.created_at,
        delivery_note: order.delivery_note,
        delivery_type: prod ? prod.delivery_type : '',
      },
      keys,
    });
  }

  // ---- Stripe Webhook ----
  if (path === '/api/pay/webhook' && method === 'POST') {
    const sig = request.headers.get('Stripe-Signature');
    const raw = await request.text();
    if (!env.STRIPE_WEBHOOK_SECRET || !sig) return jsonErr('未配置 webhook', 400);
    // 校验签名
    const parts = sig.split(',').reduce((a, p) => { const [k, v] = p.split('='); a[k] = v; return a; }, {});
    const signed = await hmac(env.STRIPE_WEBHOOK_SECRET, parts.t + '.' + raw);
    const sigHex = [...new Uint8Array(signed)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (sigHex !== parts.v1) return jsonErr('签名校验失败', 400);
    let event;
    try { event = JSON.parse(raw); } catch { return jsonErr('JSON 解析失败', 400); }
    if (event.type === 'checkout.session.completed') {
      const sess = event.data.object;
      const orderNo = sess.metadata && sess.metadata.orderNo;
      const order = await first(env, 'SELECT * FROM orders WHERE order_no=?', orderNo);
      if (order && order.status === 'PENDING') {
        await markPaid(env, order, 'stripe', sess.id);
      }
      await run(
        env, 'INSERT INTO payment_logs (order_id, provider, order_no, event_type, raw, verify_status, created_at) VALUES (?,?,?,?,?,?,?)',
        order ? order.id : null, 'stripe', orderNo, event.type, raw, 'VERIFIED', nowSec()
      );
    }
    return json({ received: true });
  }

  // ================= 以下为后台（需鉴权）=================
  // 登录
  if (path === '/api/admin/login' && method === 'POST') {
    if (!env.AUTH_SECRET) return jsonErr('服务器未配置 AUTH_SECRET', 500);
    await ensureDefaultAdmin(env);
    let body;
    try { body = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    const admin = await first(env, 'SELECT * FROM admins WHERE username=?', body.username);
    if (!admin || admin.status !== 1) return jsonErr('账号或密码错误', 401);
    const ok = await verifyPassword(env.AUTH_SECRET, admin.username, body.password || '', admin.password_hash);
    if (!ok) return jsonErr('账号或密码错误', 401);
    const token = await signToken(env.AUTH_SECRET, { sub: admin.id, exp: nowSec() + 7 * 86400 });
    const resp = json({ ok: true, token, admin: { id: admin.id, username: admin.username, nickname: admin.nickname } });
    resp.headers.append(
      'Set-Cookie',
      `admin_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}`
    );
    return resp;
  }

  // 当前管理员
  if (path === '/api/admin/me' && method === 'GET') {
    const admin = await requireAdmin(request, env);
    if (!admin) return jsonErr('未登录', 401);
    return json({ admin });
  }
  if (path === '/api/admin/logout' && method === 'POST') {
    const resp = json({ ok: true });
    resp.headers.append('Set-Cookie', 'admin_token=; Path=/; HttpOnly; Max-Age=0');
    return resp;
  }

  // 后台统一鉴权（之后的路由都需要）
  const admin = await requireAdmin(request, env);
  if (!admin) return jsonErr('未登录或登录已过期', 401);

  // 概览统计
  if (path === '/api/admin/stats' && method === 'GET') {
    const products = await first(env, 'SELECT COUNT(*) AS n FROM products');
    const orders = await first(env, "SELECT COUNT(*) AS n FROM orders WHERE status IN ('PAID','DELIVERED')");
    const pending = await first(env, "SELECT COUNT(*) AS n FROM orders WHERE status='PENDING'");
    const paidAmount = await first(env, "SELECT COALESCE(SUM(amount),0) AS s FROM orders WHERE status IN ('PAID','DELIVERED')");
    const lowStock = await all(env,
      `SELECT p.id,p.name,COUNT(c.id) AS avail FROM products p
       LEFT JOIN cards c ON c.product_id=p.id AND c.status=0
       WHERE p.stock_mode='FINITE' AND p.delivery_type='CARD_AUTO'
       GROUP BY p.id HAVING avail<=5 ORDER BY avail ASC LIMIT 10`);
    return json({
      products: products.n, paidOrders: orders.n, pendingOrders: pending.n,
      revenue: paidAmount.s, lowStock,
    });
  }

  // 商品列表（含下架）
  if (path === '/api/admin/products' && method === 'GET') {
    const q_ = url.searchParams.get('q') || '';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const pageSize = 20;
    const where = q_ ? "WHERE p.name LIKE ?" : '';
    const params = q_ ? ['%' + q_ + '%'] : [];
    const totalRow = await first(env, `SELECT COUNT(*) AS n FROM products p ${where}`, ...params);
    const items = await all(
      env,
      `SELECT p.*, c.name AS category_name FROM products p
       LEFT JOIN categories c ON c.id=p.category_id ${where}
       ORDER BY p.sort ASC, p.id DESC LIMIT ? OFFSET ?`,
      ...params, pageSize, (page - 1) * pageSize
    );
    // 补充可用卡密数
    for (const it of items) {
      if (it.delivery_type === 'CARD_AUTO') {
        const cc = await first(env, 'SELECT COUNT(*) AS n FROM cards WHERE product_id=? AND status=0', it.id);
        it.availableCards = cc.n;
      }
    }
    return json({ items, page, pageSize, total: totalRow.n, totalPages: Math.max(1, Math.ceil(totalRow.n / pageSize)) });
  }

  // 创建商品
  if (path === '/api/admin/products' && method === 'POST') {
    let b;
    try { b = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    if (!b.name) return jsonErr('请填写商品名称');
    const slug = b.slug || ('p' + Date.now());
    const id = await insertId(
      env,
      `INSERT INTO products (category_id,name,slug,subtitle,description,cover_image,price,status,delivery_type,fixed_content,stock_mode,stock,min_buy,max_buy,sort,purchase_note,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      b.category_id || null, b.name, slug, b.subtitle || '', b.description || '',
      b.cover_image || '', parseInt(b.price || 0, 10), b.status === 0 ? 0 : 1,
      b.delivery_type || 'CARD_AUTO', b.fixed_content || '', b.stock_mode || 'FINITE',
      parseInt(b.stock || 0, 10), parseInt(b.min_buy || 1, 10), parseInt(b.max_buy || 1, 10),
      parseInt(b.sort || 0, 10), b.purchase_note || '', nowSec(), nowSec()
    );
    return json({ ok: true, id });
  }

  // 更新 / 删除 / 卡密 商品
  m = path.match(/^\/api\/admin\/products\/(\d+)$/);
  if (m && method === 'PUT') {
    let b;
    try { b = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    await run(
      env,
      `UPDATE products SET category_id=?,name=?,slug=?,subtitle=?,description=?,cover_image=?,price=?,status=?,delivery_type=?,fixed_content=?,stock_mode=?,stock=?,min_buy=?,max_buy=?,sort=?,purchase_note=?,updated_at=? WHERE id=?`,
      b.category_id || null, b.name, b.slug || ('p' + m[1]), b.subtitle || '', b.description || '',
      b.cover_image || '', parseInt(b.price || 0, 10), b.status === 0 ? 0 : 1,
      b.delivery_type || 'CARD_AUTO', b.fixed_content || '', b.stock_mode || 'FINITE',
      parseInt(b.stock || 0, 10), parseInt(b.min_buy || 1, 10), parseInt(b.max_buy || 1, 10),
      parseInt(b.sort || 0, 10), b.purchase_note || '', nowSec(), m[1]
    );
    return json({ ok: true });
  }
  if (m && method === 'DELETE') {
    await run(env, 'DELETE FROM cards WHERE product_id=?', m[1]);
    await run(env, 'DELETE FROM products WHERE id=?', m[1]);
    return json({ ok: true });
  }

  // 批量导入卡密
  m = path.match(/^\/api\/admin\/products\/(\d+)\/keys$/);
  if (m && method === 'POST') {
    let b;
    try { b = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    const lines = String(b.keys || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return jsonErr('没有可导入的卡密');
    const batch = b.batch_no || ('batch-' + randHex(4));
    for (const line of lines) {
      await run(
        env, 'INSERT INTO cards (product_id, content, status, batch_no, created_at) VALUES (?,?,0,?,?)',
        m[1], line, batch, nowSec()
      );
    }
    // 同步库存（有限模式）
    const product = await first(env, 'SELECT * FROM products WHERE id=?', m[1]);
    if (product && product.stock_mode === 'FINITE') {
      const cc = await first(env, 'SELECT COUNT(*) AS n FROM cards WHERE product_id=? AND status=0', m[1]);
      await run(env, 'UPDATE products SET stock=? WHERE id=?', cc.n, m[1]);
    }
    return json({ ok: true, imported: lines.length, batch });
  }
  // 查看卡密列表
  if (m && method === 'GET') {
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const pageSize = 50;
    const totalRow = await first(env, 'SELECT COUNT(*) AS n FROM cards WHERE product_id=?', m[1]);
    const items = await all(
      env, 'SELECT * FROM cards WHERE product_id=? ORDER BY id DESC LIMIT ? OFFSET ?',
      m[1], pageSize, (page - 1) * pageSize
    );
    return json({ items, page, pageSize, total: totalRow.n });
  }

  // 删除单张卡密
  m = path.match(/^\/api\/admin\/cards\/(\d+)$/);
  if (m && method === 'DELETE') {
    await run(env, 'DELETE FROM cards WHERE id=?', m[1]);
    return json({ ok: true });
  }

  // 订单列表
  if (path === '/api/admin/orders' && method === 'GET') {
    const status = url.searchParams.get('status') || 'all';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const pageSize = 20;
    const where = status === 'all' ? '' : "WHERE o.status=?";
    const params = status === 'all' ? [] : [status];
    const totalRow = await first(env, `SELECT COUNT(*) AS n FROM orders o ${where}`, ...params);
    const items = await all(
      env,
      `SELECT o.* FROM orders o ${where} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
      ...params, pageSize, (page - 1) * pageSize
    );
    const list = items.map((o) => ({ ...o, delivered_keys: o.delivered_keys ? JSON.parse(o.delivered_keys) : [] }));
    return json({ items: list, page, pageSize, total: totalRow.n, totalPages: Math.max(1, Math.ceil(totalRow.n / pageSize)) });
  }

  // 订单详情
  m = path.match(/^\/api\/admin\/orders\/(\d+)$/);
  if (m && method === 'GET') {
    const o = await first(env, 'SELECT * FROM orders WHERE id=?', m[1]);
    if (!o) return jsonErr('订单不存在', 404);
    const keys = o.delivered_keys ? JSON.parse(o.delivered_keys) : [];
    return json({ order: { ...o, delivered_keys: keys } });
  }
  // 手动补发
  if (m && method === 'POST' && url.searchParams.get('action') === 'resend') {
    const o = await first(env, 'SELECT * FROM orders WHERE id=?', m[1]);
    if (!o) return jsonErr('订单不存在', 404);
    const res = await deliverOrder(env, o);
    return json({ ok: true, status: res.status, keys: res.keys, note: res.note });
  }

  // 站点设置
  if (path === '/api/admin/settings' && method === 'GET') {
    const s = await first(env, 'SELECT * FROM site_settings WHERE id=1');
    return json({ settings: s });
  }
  if (path === '/api/admin/settings' && method === 'PUT') {
    let b;
    try { b = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    await run(
      env,
      `UPDATE site_settings SET site_name=?,subtitle=?,notice=?,support_contact=?,footer_text=?,order_notice=?,currency=? WHERE id=1`,
      b.site_name || 'BU31 商城', b.subtitle || '', b.notice || '', b.support_contact || '',
      b.footer_text || '', b.order_notice || '',       b.currency || 'usd'
    );
    return json({ ok: true });
  }

  // 修改管理员密码
  if (path === '/api/admin/password' && method === 'PUT') {
    let b; try { b = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    if (!b.password || b.password.length < 6) return jsonErr('密码至少 6 位');
    const ph = await hashPassword(env.AUTH_SECRET, admin.username, b.password);
    await run(env, 'UPDATE admins SET password_hash=? WHERE id=?', ph, admin.id);
    return json({ ok: true });
  }

  // 文件上传到 R2（管理员）
  if (path === '/api/admin/upload' && method === 'POST') {
    try {
      if (!env.R2) return jsonErr('未配置 R2 存储', 500);
      // 用 base64 JSON 上传，绕开 Cloudflare 对 multipart formData 的解析崩溃问题
      let b; try { b = await request.json(); } catch { return jsonErr('请求体格式错误'); }
      if (!b || !b.data || !b.filename) return jsonErr('缺少文件数据');
      const ct = b.contentType || 'application/octet-stream';
      const bin = typeof b.data === 'string' ? b.data : '';
      if (!bin) return jsonErr('文件数据为空');
      let bytes;
      try { bytes = Uint8Array.from(atob(bin), c => c.charCodeAt(0)); }
      catch { return jsonErr('文件编码解析失败'); }
      const ext = (String(b.filename).split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
      const ym = new Date().toISOString().slice(0, 7).replace('-', '/');
      const key = `uploads/${ym}/${nowSec()}_${randHex(8)}.${ext}`;
      await env.R2.put(key, bytes, { httpMetadata: { contentType: ct } });
      await run(env, 'INSERT INTO media (r2_key,filename,content_type,size,created_at) VALUES (?,?,?,?,?)',
        key, String(b.filename), ct, bytes.byteLength, nowSec());
      const origin = new URL(request.url).origin;
      return json({ ok: true, key, url: `${origin}/file/${key}` });
    } catch (e) {
      return json({ error: '上传失败: ' + (e && e.message ? e.message : String(e)) }, 500);
    }
  }
  // 已上传文件列表（文件管理）
  if (path === '/api/admin/media' && method === 'GET') {
    const items = await all(env, 'SELECT * FROM media ORDER BY created_at DESC LIMIT 100');
    return json({ items });
  }
  if (path === '/api/admin/media' && method === 'DELETE') {
    let b; try { b = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    if (env.R2 && b.key) { try { await env.R2.delete(b.key); } catch (e) {} }
    await run(env, 'DELETE FROM media WHERE r2_key=?', b.key || '');
    return json({ ok: true });
  }

  // 分类管理
  if (path === '/api/admin/categories' && method === 'GET') {
    const items = await all(env, 'SELECT * FROM categories ORDER BY sort ASC, id ASC');
    return json({ items });
  }
  if (path === '/api/admin/categories' && method === 'POST') {
    let b; try { b = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    if (!b.name || !b.slug) return jsonErr('请填写分类名称和英文标识');
    const id = await insertId(
      env, 'INSERT INTO categories (name,slug,description,sort,status) VALUES (?,?,?,?,?)',
      b.name, b.slug, b.description || '', parseInt(b.sort || 0, 10), b.status === 0 ? 0 : 1
    );
    return json({ ok: true, id });
  }
  m = path.match(/^\/api\/admin\/categories\/(\d+)$/);
  if (m && method === 'PUT') {
    let b; try { b = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    await run(
      env, 'UPDATE categories SET name=?,slug=?,description=?,sort=?,status=? WHERE id=?',
      b.name, b.slug, b.description || '', parseInt(b.sort || 0, 10), b.status === 0 ? 0 : 1, m[1]
    );
    return json({ ok: true });
  }
  if (m && method === 'DELETE') {
    await run(env, 'DELETE FROM categories WHERE id=?', m[1]);
    return json({ ok: true });
  }

  // 支付网关配置
  if (path === '/api/admin/gateways' && method === 'GET') {
    const items = await all(env, 'SELECT * FROM payment_gateways ORDER BY sort ASC, id ASC');
    return json({ items });
  }
  if (path === '/api/admin/gateways' && method === 'POST') {
    let b; try { b = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    if (!b.type || !b.display_name) return jsonErr('请填写网关类型和显示名称');
    const id = await insertId(
      env,
      'INSERT INTO payment_gateways (type,display_name,gateway_url,app_id,app_secret,notify_url,return_url,extra,sort,enabled,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      b.type, b.display_name, b.gateway_url || '', b.app_id || '', b.app_secret || '', b.notify_url || '', b.return_url || '',
      (typeof b.extra === 'string' ? b.extra : JSON.stringify(b.extra == null ? {} : b.extra)), parseInt(b.sort || 0, 10), b.enabled === 1 ? 1 : 0, nowSec()
    );
    return json({ ok: true, id });
  }
  m = path.match(/^\/api\/admin\/gateways\/(\d+)$/);
  if (m && method === 'PUT') {
    let b; try { b = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    if (!b.type || !b.display_name) return jsonErr('请填写网关类型和显示名称');
    await run(
      env,
      'UPDATE payment_gateways SET type=?,display_name=?,gateway_url=?,app_id=?,app_secret=?,notify_url=?,return_url=?,extra=?,sort=?,enabled=? WHERE id=?',
      b.type, b.display_name, b.gateway_url || '', b.app_id || '', b.app_secret || '', b.notify_url || '', b.return_url || '',
      (typeof b.extra === 'string' ? b.extra : JSON.stringify(b.extra == null ? {} : b.extra)), parseInt(b.sort || 0, 10), b.enabled === 1 ? 1 : 0, m[1]
    );
    return json({ ok: true });
  }
  if (m && method === 'DELETE') {
    await run(env, 'DELETE FROM payment_gateways WHERE id=?', m[1]);
    return json({ ok: true });
  }

  // 幻灯片（Banner）管理
  if (path === '/api/admin/banners' && method === 'GET') {
    const items = await all(env, 'SELECT * FROM banners ORDER BY sort ASC, id ASC');
    return json({ items });
  }
  if (path === '/api/admin/banners' && method === 'POST') {
    let b; try { b = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    if (!b.title) return jsonErr('请填写幻灯片标题');
    const id = await insertId(
      env,
      'INSERT INTO banners (tag,title,subtitle,mode,gradient,image_url,link_url,sort,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      b.tag || '', b.title, b.subtitle || '', b.mode === 'image' ? 'image' : 'gradient',
      b.gradient || '', b.image_url || '', b.link_url || '',
      parseInt(b.sort || 0, 10), b.status === 0 ? 0 : 1, Math.floor(Date.now() / 1000)
    );
    return json({ ok: true, id });
  }
  m = path.match(/^\/api\/admin\/banners\/(\d+)$/);
  if (m && method === 'PUT') {
    let b; try { b = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    if (!b.title) return jsonErr('请填写幻灯片标题');
    await run(
      env,
      'UPDATE banners SET tag=?,title=?,subtitle=?,mode=?,gradient=?,image_url=?,link_url=?,sort=?,status=? WHERE id=?',
      b.tag || '', b.title, b.subtitle || '', b.mode === 'image' ? 'image' : 'gradient',
      b.gradient || '', b.image_url || '', b.link_url || '',
      parseInt(b.sort || 0, 10), b.status === 0 ? 0 : 1, m[1]
    );
    return json({ ok: true });
  }
  if (m && method === 'DELETE') {
    await run(env, 'DELETE FROM banners WHERE id=?', m[1]);
    return json({ ok: true });
  }

  return jsonErr('接口不存在: ' + method + ' ' + path, 404);
}

// ============================================================
//  入口
// ============================================================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) {
        return await handleApi(request, env, ctx);
      }
      // R2 文件代理（/file/<key>）
      if (url.pathname.startsWith('/file/') && env.R2) {
        return await serveFile(env, url.pathname.slice('/file/'.length));
      }
      // edgeKey 兼容回跳地址 /order/{orderNo}?token={token}
      const orderMatch = url.pathname.match(/^\/order\/([A-Za-z0-9]+)$/);
      if (orderMatch) {
        const orderNo = orderMatch[1];
        const token = url.searchParams.get('token') || '';
        return Response.redirect(`${url.origin}/success.html?order=${orderNo}&token=${token}`, 302);
      }
      // 静态资源
      return await env.ASSETS.fetch(request);
    } catch (e) {
      return json({ error: '服务器内部错误: ' + e.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    try {
      await expireOrders(env);
    } catch (e) {
      // 定时任务失败不影响主流程
      console.error('expireOrders failed:', e);
    }
  },
};
