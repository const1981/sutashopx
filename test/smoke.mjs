// 纯逻辑自测：node test/smoke.mjs
import { hashPassword, verifyPassword, signToken, verifyToken, makeOrderNo, pickCards } from '../src/worker.js';

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } }

const SECRET = 'test-secret-key-123';

// 1. 密码哈希
const ph = await hashPassword(SECRET, 'admin', 'admin123456');
ok('密码哈希生成', typeof ph === 'string' && ph.length > 10);
ok('正确密码校验通过', await verifyPassword(SECRET, 'admin', 'admin123456', ph) === true);
ok('错误密码校验失败', await verifyPassword(SECRET, 'admin', 'wrong', ph) === false);
ok('不同用户同密码哈希不同', (await hashPassword(SECRET, 'bob', 'admin123456')) !== ph);

// 2. 令牌签发/校验
const token = await signToken(SECRET, { sub: 1, exp: Math.floor(Date.now() / 1000) + 3600 });
ok('令牌可解析', (await verifyToken(SECRET, token))?.sub === 1);
ok('错误密钥校验失败', (await verifyToken('other-secret', token)) === null);
const tampered = token.slice(0, -2) + (token.slice(-1) === 'a' ? 'b' : 'a');
ok('篡改令牌校验失败', (await verifyToken(SECRET, tampered)) === null);
const expired = await signToken(SECRET, { sub: 1, exp: Math.floor(Date.now() / 1000) - 10 });
ok('过期令牌校验失败', (await verifyToken(SECRET, expired)) === null);

// 3. 订单号唯一
const set = new Set(); let dup = false;
for (let i = 0; i < 3000; i++) { const n = makeOrderNo(); if (set.has(n)) dup = true; set.add(n); }
ok('订单号 3000 次无重复', !dup);
ok('订单号格式 BK 前缀', [...set][0].startsWith('BK'));

// 4. 卡密选取（仅未售、限量、保序）
const cards = [
  { id: 1, status: 0, content: 'A' },
  { id: 2, status: 1, content: 'B' }, // 已售
  { id: 3, status: 0, content: 'C' },
  { id: 4, status: 2, content: 'D' }, // 禁用
  { id: 5, status: 0, content: 'E' },
];
const got = pickCards(cards, 2);
ok('只选未售卡', got.every(c => c.status === 0));
ok('限量正确(2张)', got.length === 2);
ok('保序', got[0].id === 1 && got[1].id === 3);
const all = pickCards(cards, 99);
ok('超出库存按实际返回', all.length === 3);

console.log(`\n结果：通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
