// ============================================================
//  SutaShopX 极简卡密商城 · 后端（Cloudflare Worker，原生 JS，零依赖）
//  - 前台静态资源由 env.ASSETS 提供
//  - /api/* 走这里
//  改逻辑只需要动这一个文件。
//  [deploy 2026-07-11] 飞书通知上线；远程 D1 已加 feishu_webhook/feishu_secret 两列
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

// 机器调用鉴权：独立 API_KEY（x-api-key 头），与后台账号密码隔离，专供 AI 批量运营
async function requireMachine(request, env) {
  if (!env.AI_API_KEY) return null;
  const key = request.headers.get('x-api-key') || request.headers.get('X-Api-Key');
  if (!key) return null;
  // 常量时间比较，避免时序侧信道
  const a = enc.encode(key), b = enc.encode(env.AI_API_KEY);
  if (a.length !== b.length) return null;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0 ? { machine: true } : null;
}

// 按 ref 解析商品：数字ID / 分类slug+商品slug / 商品slug / 商品名（免记数字ID）
async function resolveProductByRef(env, ref) {
  if (!ref) return null;
  if (/^\d+$/.test(String(ref))) return await first(env, 'SELECT * FROM products WHERE id=?', ref);
  const parts = String(ref).split('/');
  const prodRef = parts[parts.length - 1];
  const catRef = parts.length > 1 ? parts[0] : null;
  if (catRef) {
    const r = await first(env,
      `SELECT p.* FROM products p JOIN categories c ON c.id=p.category_id WHERE (p.slug=? OR p.name=?) AND c.slug=?`,
      prodRef, prodRef, catRef);
    if (r) return r;
  }
  return await first(env, 'SELECT * FROM products WHERE slug=? OR name=?', prodRef, prodRef);
}

// ---------------- 机器批量接口（AI 运营入口）----------------
async function handleMachine(request, env, url, method, path) {
  const machine = await requireMachine(request, env);
  if (!machine) return jsonErr('未授权（缺少或错误的 x-api-key）', 401);

  // 批量创建商品
  let m = path.match(/^\/api\/machine\/products\/bulk$/);
  if (m && method === 'POST') {
    let b; try { b = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    const list = Array.isArray(b) ? b : (b.products || []);
    if (!list.length) return jsonErr('商品数组为空');
    if (list.length > 200) return jsonErr('单次最多 200 个商品');
    const ids = [];
    for (const it of list) {
      if (!it.name) continue;
      // 解析分类：支持 slug 或 name
      let categoryId = null;
      if (it.category_slug || it.category) {
        const cat = await first(env, 'SELECT id FROM categories WHERE slug=? OR name=?', it.category_slug || it.category, it.category_slug || it.category);
        categoryId = cat ? cat.id : null;
      }
      const slug = it.slug || ('p' + Date.now() + randHex(3));
      const id = await insertId(
        env,
        `INSERT INTO products (category_id,name,slug,subtitle,description,cover_image,price,status,delivery_type,fixed_content,stock_mode,stock,min_buy,max_buy,sort,purchase_note,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        categoryId, it.name, slug, it.subtitle || '', it.description || '',
        it.cover_image || '', Math.round(parseFloat(it.price || 0) * 100), it.status === 0 ? 0 : 1,
        it.delivery_type || 'CARD_AUTO', it.fixed_content || '', it.stock_mode || 'FINITE',
        parseInt(it.stock || 0, 10), parseInt(it.min_buy || 1, 10), parseInt(it.max_buy || 1, 10),
        parseInt(it.sort || 0, 10), it.purchase_note || '', nowSec(), nowSec()
      );
      ids.push(id);
    }
    return json({ ok: true, created: ids.length, ids });
  }

  // 批量导入卡密到指定商品
  m = path.match(/^\/api\/machine\/products\/(\d+)\/keys$/);
  if (m && method === 'POST') {
    let b; try { b = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    const pid = m[1];
    const product = await first(env, 'SELECT * FROM products WHERE id=?', pid);
    if (!product) return jsonErr('商品不存在', 404);
    let lines = [];
    if (Array.isArray(b.keys)) lines = b.keys.map(String).map(s => s.trim()).filter(Boolean);
    else if (typeof b.keys === 'string') lines = b.keys.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) return jsonErr('没有可导入的卡密');
    if (lines.length > 5000) return jsonErr('单次最多 5000 条卡密');
    const batch = b.batch_no || ('m-' + randHex(6));
    for (const line of lines) {
      await run(env, 'INSERT INTO cards (product_id, content, status, batch_no, created_at) VALUES (?,?,0,?,?)', pid, line, batch, nowSec());
    }
    if (product.stock_mode === 'FINITE') {
      const cc = await first(env, 'SELECT COUNT(*) AS n FROM cards WHERE product_id=? AND status=0', pid);
      await run(env, 'UPDATE products SET stock=? WHERE id=?', cc.n, pid);
    }
    return json({ ok: true, imported: lines.length, batch });
  }

  // 整类清空（商品 + 卡密）——按分类 slug
  m = path.match(/^\/api\/machine\/category\/([\w-]+)$/);
  if (m && method === 'DELETE') {
    const slug = m[1];
    const cat = await first(env, 'SELECT id FROM categories WHERE slug=?', slug);
    if (!cat) return jsonErr('分类不存在', 404);
    const prods = await all(env, 'SELECT id FROM products WHERE category_id=?', cat.id);
    for (const p of prods) await run(env, 'DELETE FROM cards WHERE product_id=?', p.id);
    const info = await run(env, 'DELETE FROM products WHERE category_id=?', cat.id);
    return json({ ok: true, deletedProducts: prods.length });
  }

  // 批量导入卡密（支持按「分类slug/商品slug或名」定位，免记数字ID）
  if (path === '/api/machine/cards/import' && method === 'POST') {
    let b; try { b = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    let ref = b.product_ref;
    if (!ref && (b.category_slug || b.product_slug || b.name)) {
      ref = (b.category_slug || '') + '/' + (b.product_slug || b.name || '');
    }
    const product = await resolveProductByRef(env, ref);
    if (!product) return jsonErr('商品不存在（可用 product_ref="分类slug/商品slug" 或 商品名定位）', 404);
    let lines = [];
    if (Array.isArray(b.keys)) lines = b.keys.map(String).map(s => s.trim()).filter(Boolean);
    else if (typeof b.keys === 'string') lines = b.keys.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) return jsonErr('没有可导入的卡密');
    if (lines.length > 5000) return jsonErr('单次最多 5000 条卡密');
    const batch = b.batch_no || ('m-' + randHex(6));
    for (const line of lines) {
      await run(env, 'INSERT INTO cards (product_id, content, status, batch_no, created_at) VALUES (?,?,0,?,?)', product.id, line, batch, nowSec());
    }
    if (product.stock_mode === 'FINITE') {
      const cc = await first(env, 'SELECT COUNT(*) AS n FROM cards WHERE product_id=? AND status=0', product.id);
      await run(env, 'UPDATE products SET stock=? WHERE id=?', cc.n, product.id);
    }
    return json({ ok: true, imported: lines.length, product_id: product.id, batch });
  }

  return jsonErr('未知机器接口', 404);
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

// ---------- 飞书通知 ----------
// 订单支付成功后推送飞书卡片。webhook 为空则不发；失败绝不阻断主流程。
async function sendFeishu(env, order, provider, res) {
  const result = { sent: false, reason: null, httpStatus: null, feishuCode: null, feishuMsg: null, raw: null };
  try {
    const s = await first(env, 'SELECT * FROM site_settings WHERE id=1');
    if (!s || !s.feishu_webhook) { result.reason = 'no_webhook'; return result; }
    const webhook = s.feishu_webhook;
    // 仅允许飞书官方域名，防止 SSRF
    if (!/^https:\/\/(open\.feishu\.cn|open\.larksuite\.com)\//.test(webhook)) {
      result.reason = 'bad_domain';
      return result;
    }
    const secret = s.feishu_secret || '';
    const amount = ((order.amount || 0) / 100).toFixed(2);
    const providerMap = { demo: '演示支付', test: '测试', usdt: 'USDT', stripe: 'Stripe', alipay: '支付宝', wechat: '微信', epay: '易支付' };
    const providerTxt = providerMap[provider] || provider || '未知';
    let deliverTxt;
    if (res && res.keys && res.keys.length) deliverTxt = `已发 ${res.keys.length} 张卡密/内容`;
    else if (res && res.status === 'PAID') deliverTxt = '待人工发货';
    else deliverTxt = (res && res.note) || '-';

    const title = provider === 'demo' ? '🔔 新订单支付成功（演示）'
      : (provider === 'test' ? '🔔 飞书通知测试' : '💰 新订单支付成功');
    const card = {
      config: { wide_screen_mode: true },
      header: { title: { tag: 'plain_text', content: title } },
      elements: [
        { tag: 'div', fields: [
          { is_short: true, text: { tag: 'lark_md', content: `**订单号**\n${order.order_no}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**金额**\n¥${amount}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**商品**\n${order.product_name}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**数量**\n×${order.quantity}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**支付方式**\n${providerTxt}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**发货**\n${deliverTxt}` } },
        ] },
        { tag: 'note', elements: [{ tag: 'plain_text', content: `SutaShopX 商城 · ${new Date().toLocaleString('zh-CN')}` }] }
      ]
    };
    const body = { msg_type: 'interactive', card };
    if (secret) {
      const timestamp = Math.floor(Date.now() / 1000);
      const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}\n${secret}`));
      body.timestamp = String(timestamp);
      body.sign = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
    }
    const resp = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    result.httpStatus = resp.status;
    const txt = await resp.text().catch(() => '');
    result.raw = txt.slice(0, 300);
    if (!resp.ok) { result.reason = 'http_not_200'; return result; }
    try {
      const j = JSON.parse(txt);
      result.feishuCode = j.code;
      result.feishuMsg = j.msg;
      result.sent = (j.code === 0);
      if (j.code !== 0) result.reason = 'feishu_rejected';
    } catch {
      // HTTP 200 但非标准 JSON，视为已送达
      result.sent = true;
    }
  } catch (e) {
    // 通知失败绝不阻断主流程（支付/发货已成功）
    result.reason = 'exception';
    result.error = e && e.message ? e.message : String(e);
    console.error('sendFeishu failed:', result.error);
  }
  return result;
}

async function markPaid(env, order, provider, paymentOrderNo) {
  await run(
    env,
    "UPDATE orders SET status='PAID', payment_provider=?, payment_order_no=?, paid_at=? WHERE id=?",
    provider, paymentOrderNo, nowSec(), order.id
  );
  const res = await deliverOrder(env, order);
  await sendFeishu(env, order, provider, res);
  return res;
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
      params.sign = signBepusdt(params, key); // 复用现有签名函数（与 VPAY 的 signEpay 算法一致）
      const payUrl = `${base}/submit.php?` + new URLSearchParams(params).toString();
      return { ok: true, provider: 'epay', payUrl };
    }
    if (g.type === 'alipay' || g.type === 'wechat') {
      // 暂未接官方通道，回退演示（保留原行为）
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

  // 验签：排除 sign / sign_type，复用 signBepusdt（与 VPAY 的 signEpay 算法一致）
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
  // ---- 公开：易支付（VPAY）回调 ----
  if (path === '/api/payments/epay/notify' && method === 'POST') {
    return await handleEpayNotify(env, request);
  }

  // ---- 机器批量接口（AI 运营入口，x-api-key 鉴权）----
  if (path.startsWith('/api/machine/')) {
    return await handleMachine(request, env, url, method, path);
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
    const prod = await first(env, 'SELECT delivery_type, file_key, file_name FROM products WHERE id=?', order.product_id);
    return json({
      order: {
        order_no: order.order_no, status: order.status, amount: order.amount,
        quantity: order.quantity, product_name: order.product_name,
        payment_provider: order.payment_provider, created_at: order.created_at,
        delivery_note: order.delivery_note,
        delivery_type: prod ? prod.delivery_type : '',
        file_key: prod ? (prod.file_key || '') : '',
        file_name: prod ? (prod.file_name || '') : '',
      },
      keys,
    });
  }

  // ---- 公开：已购客户下载商品文件（用订单 query_token 鉴权，仅 PAID/DELIVERED 可下）----
  {
    const dm = path.match(/^\/api\/files\/([A-Za-z0-9]+)$/);
    if (dm && method === 'GET') {
      if (!env.R2) return jsonErr('未配置文件存储', 500);
      const order = await first(env, 'SELECT * FROM orders WHERE query_token=?', dm[1]);
      if (!order) return jsonErr('无效下载链接', 404);
      if (order.status !== 'PAID' && order.status !== 'DELIVERED') return jsonErr('订单尚未支付，无法下载', 403);
      const product = await first(env, 'SELECT file_key, file_name FROM products WHERE id=?', order.product_id);
      if (!product || !product.file_key) return jsonErr('该商品暂无下载文件', 404);
      const obj = await env.R2.get(product.file_key);
      if (!obj) return jsonErr('文件不存在', 404);
      const fname = encodeURIComponent(product.file_name || 'file');
      return new Response(obj.body, {
        headers: {
          'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) ? obj.httpMetadata.contentType : 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${fname}"; filename*=UTF-8''${fname}`,
          'Cache-Control': 'no-store',
        },
      });
    }
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

  // AI 运营接口配置（后台「AI 接口」页用）——只返回是否设置 + base URL，不泄露明文 key
  if (path === '/api/admin/machine-config' && method === 'GET') {
    const origin = (url.origin && url.origin.startsWith('http')) ? url.origin : (env.BASE_URL || 'https://sutashopx.constlee.workers.dev');
    return json({
      base_url: origin,
      key_set: !!env.AI_API_KEY,
      key_full: env.AI_API_KEY || '',
      key_hint: env.AI_API_KEY ? (env.AI_API_KEY.slice(0, 6) + '…' + env.AI_API_KEY.slice(-4)) : '',
      endpoints: [
        { method: 'POST', path: '/api/machine/products/bulk', desc: '批量添加商品（JSON 数组，price 单位元）' },
        { method: 'POST', path: '/api/machine/cards/import', desc: '导入卡密，product_ref="分类slug/商品slug" 或商品名定位' },
        { method: 'POST', path: '/api/machine/products/{id}/keys', desc: '旧接口：按数字 ID 导卡密（仍可用）' },
        { method: 'DELETE', path: '/api/machine/category/{slug}', desc: '整类清空（商品+卡密）' },
      ],
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
      `INSERT INTO products (category_id,name,slug,subtitle,description,cover_image,price,status,delivery_type,fixed_content,stock_mode,stock,min_buy,max_buy,sort,purchase_note,file_key,file_name,file_size,file_uploaded_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      b.category_id || null, b.name, slug, b.subtitle || '', b.description || '',
      b.cover_image || '', parseInt(b.price || 0, 10), b.status === 0 ? 0 : 1,
      b.delivery_type || 'CARD_AUTO', b.fixed_content || '', b.stock_mode || 'FINITE',
      parseInt(b.stock || 0, 10), parseInt(b.min_buy || 1, 10), parseInt(b.max_buy || 1, 10),
      parseInt(b.sort || 0, 10), b.purchase_note || '',
      b.file_key || null, b.file_name || null, parseInt(b.file_size || 0, 10), b.file_uploaded_at || null,
      nowSec(), nowSec()
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
      `UPDATE products SET category_id=?,name=?,slug=?,subtitle=?,description=?,cover_image=?,price=?,status=?,delivery_type=?,fixed_content=?,stock_mode=?,stock=?,min_buy=?,max_buy=?,sort=?,purchase_note=?,file_key=?,file_name=?,file_size=?,file_uploaded_at=?,updated_at=? WHERE id=?`,
      b.category_id || null, b.name, b.slug || ('p' + m[1]), b.subtitle || '', b.description || '',
      b.cover_image || '', parseInt(b.price || 0, 10), b.status === 0 ? 0 : 1,
      b.delivery_type || 'CARD_AUTO', b.fixed_content || '', b.stock_mode || 'FINITE',
      parseInt(b.stock || 0, 10), parseInt(b.min_buy || 1, 10), parseInt(b.max_buy || 1, 10),
      parseInt(b.sort || 0, 10), b.purchase_note || '',
      b.file_key || null, b.file_name || null, parseInt(b.file_size || 0, 10), b.file_uploaded_at || null,
      nowSec(), m[1]
    );
    return json({ ok: true });
  }
  if (m && method === 'DELETE') {
    await run(env, 'DELETE FROM cards WHERE product_id=?', m[1]);
    await run(env, 'DELETE FROM products WHERE id=?', m[1]);
    return json({ ok: true });
  }
  // 删除商品已上传文件（清字段 + 删 R2 对象），仅后台可调用（上方已统一鉴权）
  {
    const fm = path.match(/^\/api\/admin\/products\/(\d+)\/file$/);
    if (fm && method === 'DELETE') {
      const product = await first(env, 'SELECT file_key FROM products WHERE id=?', fm[1]);
      if (product && product.file_key && env.R2) { try { await env.R2.delete(product.file_key); } catch (e) {} }
      await run(env, 'UPDATE products SET file_key=NULL, file_name=NULL, file_size=0, file_uploaded_at=NULL WHERE id=?', fm[1]);
      return json({ ok: true });
    }
  }
  // 按 ID 取商品详情（后台编辑表单用；注意此 m 在下方会被 keys 正则覆盖，必须放前面）
  if (m && method === 'GET') {
    const p = await first(env, 'SELECT * FROM products WHERE id=?', m[1]);
    if (!p) return jsonErr('商品不存在', 404);
    const availableCards = p.delivery_type === 'CARD_AUTO'
      ? (await first(env, 'SELECT COUNT(*) AS n FROM cards WHERE product_id=? AND status=0', p.id)).n : 0;
    return json({ ...p, availableCards });
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

  // 后台一键生成卡密（tiaomama 风格：前缀 + 零填充自增数字 + 后缀），零外部 key
  const gm = path.match(/^\/api\/admin\/products\/(\d+)\/generate-keys$/);
  if (gm && method === 'POST') {
    let b;
    try { b = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    const count = Math.min(Math.max(parseInt(b.count || 0, 10), 1), 5000);
    const prefix = String(b.prefix || '');
    const suffix = String(b.suffix || '');
    const start = Math.max(parseInt(b.start || 1, 10), 0);
    const digits = Math.min(Math.max(parseInt(b.digits || 7, 10), 1), 12);
    const batch = b.batch_no || ('gen-' + randHex(6));
    const pid = gm[1];
    const lines = [];
    for (let i = 0; i < count; i++) {
      lines.push(prefix + String(start + i).padStart(digits, '0') + suffix);
    }
    for (const line of lines) {
      await run(env, 'INSERT INTO cards (product_id, content, status, batch_no, created_at) VALUES (?,?,0,?,?)', pid, line, batch, nowSec());
    }
    const product = await first(env, 'SELECT * FROM products WHERE id=?', pid);
    if (product && product.stock_mode === 'FINITE') {
      const cc = await first(env, 'SELECT COUNT(*) AS n FROM cards WHERE product_id=? AND status=0', pid);
      await run(env, 'UPDATE products SET stock=? WHERE id=?', cc.n, pid);
    }
    return json({ ok: true, generated: lines.length, batch, sample: lines.slice(0, 3) });
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

  // 批量删除订单（接收 { ids: [...] }）
  if (path === '/api/admin/orders' && method === 'DELETE') {
    let b;
    try { b = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter(id => Number.isInteger(id) && id > 0) : [];
    if (!ids.length) return jsonErr('未选择订单');
    const placeholders = ids.map(() => '?').join(',');
    await run(env, `DELETE FROM orders WHERE id IN (${placeholders})`, ...ids);
    return json({ ok: true, deleted: ids.length });
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
      `UPDATE site_settings SET site_name=?,subtitle=?,notice=?,support_contact=?,footer_text=?,order_notice=?,currency=?,feishu_webhook=?,feishu_secret=? WHERE id=1`,
      b.site_name || 'SutaShopX 商城', b.subtitle || '', b.notice || '', b.support_contact || '',
      b.footer_text || '', b.order_notice || '', b.currency || 'usd',
      b.feishu_webhook || '', b.feishu_secret || ''
    );
    return json({ ok: true });
  }

  // 飞书通知测试（用假订单发一条，验证 webhook 是否通）
  if (path === '/api/admin/feishu/test' && method === 'POST') {
    let b = {};
    try { b = await request.json(); } catch {}
    // 优先用测试按钮传来的输入框值（无需先点顶部保存），否则读库
    let webhook = (b.webhook || '').trim();
    let secret = b.secret || '';
    if (!webhook) {
      const s = await first(env, 'SELECT feishu_webhook, feishu_secret FROM site_settings WHERE id=1');
      webhook = (s && s.feishu_webhook) || '';
      secret = (s && s.feishu_secret) || '';
    }
    if (!webhook) {
      return jsonErr('请先填写飞书机器人 Webhook（填在上面的输入框，点“发送测试消息”即可，会自动保存，无需先点顶部保存）', 400);
    }
    // 写回库：测过即保存，省得再点顶部“保存”
    await run(env, 'UPDATE site_settings SET feishu_webhook=?, feishu_secret=? WHERE id=1', webhook, secret);
    const fakeOrder = { order_no: 'TEST-' + Date.now(), product_name: '飞书通知测试', amount: 0, quantity: 1 };
    const r = await sendFeishu(env, fakeOrder, 'test', { keys: [], note: '这是一条测试消息', status: 'DELIVERED' });
    if (r.sent) return json({ ok: true, message: '测试消息已发送，请到飞书群查看是否收到' });
    let why = '飞书未确认收到消息';
    if (r.feishuCode != null) {
      why = `飞书拒绝：code=${r.feishuCode}，${r.feishuMsg || '(无说明)'}`;
      if (r.feishuCode === 19010) why += '（加签不匹配：飞书开了加签 → 后台“签名密钥”必须和飞书机器人里的一致；没开加签 → 后台“签名密钥”留空）';
      else if (r.feishuCode === 19021) why += '（关键词不匹配：飞书开了自定义关键词，卡片标题需包含该词；建议关闭关键词或把关键词设成“通知”）';
      else if (r.feishuCode === 19020 || r.feishuCode === 19024) why += '（Webhook 无效：机器人可能已删除，请重新复制完整地址）';
      else if (r.feishuCode === 19011) why += '（发送太频繁，稍等几秒再试）';
    } else if (r.reason === 'http_not_200') why = `飞书返回 HTTP ${r.httpStatus}（${r.raw || '无响应体'}）`;
    else if (r.reason === 'bad_domain') why = 'Webhook 域名不合法（必须是 open.feishu.cn 或 open.larksuite.com）';
    else if (r.reason === 'no_webhook') why = '未填写飞书 Webhook';
    else if (r.reason === 'exception') why = '请求飞书异常：' + (r.error || '未知');
    else if (r.raw) why = '飞书原始返回：' + r.raw;
    return json({ ok: false, error: why, detail: r }, 502);
  }

  // 修改管理员密码（需校验旧密码，防止会话被盗后任意改密）
  if (path === '/api/admin/password' && method === 'PUT') {
    let b; try { b = await request.json(); } catch { return jsonErr('请求体格式错误'); }
    if (!b.old_password) return jsonErr('请输入当前密码');
    const cur = await first(env, 'SELECT * FROM admins WHERE id=?', admin.id);
    if (!cur) return jsonErr('管理员不存在', 401);
    const okOld = await verifyPassword(env.AUTH_SECRET, cur.username, b.old_password, cur.password_hash);
    if (!okOld) return jsonErr('当前密码不正确', 401);
    if (!b.password || b.password.length < 6) return jsonErr('新密码至少 6 位');
    if (b.password === b.old_password) return jsonErr('新密码不能与当前密码相同');
    const ph = await hashPassword(env.AUTH_SECRET, cur.username, b.password);
    await run(env, 'UPDATE admins SET password_hash=? WHERE id=?', ph, cur.id);
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
  // 按 ID 取分类详情（后台编辑表单用；此 m 在下方网关正则前有效）
  if (m && method === 'GET') {
    const c = await first(env, 'SELECT * FROM categories WHERE id=?', m[1]);
    if (!c) return jsonErr('分类不存在', 404);
    return json({ ...c });
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
