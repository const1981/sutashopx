// 手机端购买页验证：banner 隐藏 + 点购买跳转 buy.html + 购买表单渲染 + checkout 调用
import { createRequire } from 'module';
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8090';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌', m); } };

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
});
const page = await ctx.newPage();

// ---------- 1. 首页：banner 隐藏，点购买跳 buy.html ----------
console.log('[1] 首页手机版');
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
const bannerDisp = await page.$eval('.carousel-shell', el => getComputedStyle(el).display).catch(() => 'N/A');
ok(bannerDisp === 'none', `幻灯片 .carousel-shell 已隐藏 (display=${bannerDisp})`);

// 等 store.js 渲染出真实卡片（mock 提供 /api/products 列表）
await page.waitForSelector('#feedGrid .buy-btn', { timeout: 5000 });
const beforeUrl = page.url();
await page.click('#feedGrid .buy-btn');
await page.waitForTimeout(500);
const afterUrl = page.url();
ok(afterUrl.includes('/buy.html?id=1'), `点购买跳转到 buy.html (${afterUrl.replace(BASE,'')})`);

// ---------- 2. buy.html 渲染 ----------
console.log('[2] 购买页 buy.html');
ok(afterUrl.includes('buy.html'), '已进入购买页');
await page.waitForSelector('#buyWrap .detail-cover', { timeout: 3000 }).catch(() => {});
const title = await page.$eval('.buy-topbar h1', el => el.textContent).catch(() => '');
ok(title.includes('购买'), `顶栏标题正常: "${title}"`);
const pname = await page.$eval('.detail-desc', el => el.textContent).catch(() => '');
ok(pname.length > 0, `商品描述已渲染: "${pname.slice(0,16)}..."`);
const hasQty = await page.$('#qtyInput') !== null;
ok(hasQty, '数量控件已渲染');
const gwCount = await page.$$eval('#gwSelect option', els => els.length).catch(() => 0);
ok(gwCount === 2, `支付方式下拉有 ${gwCount} 项 (预期 2)`);
const totalTxt = await page.$eval('#totalPrice', el => el.textContent).catch(() => '');
ok(/\$/.test(totalTxt), `合计金额渲染: "${totalTxt}"`);

// ---------- 3. 去支付：拦截 checkout 请求 ----------
console.log('[3] 去支付 checkout');
let checkoutBody = null, redirected = false;
await page.route('**/api/checkout', route => {
  const req = route.request();
  checkoutBody = req.postData();
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, payUrl: 'https://example.com/pay/mock?order=1' }) });
});
await page.route('**/pay/mock**', route => { redirected = true; route.fulfill({ status: 200, body: 'OK' }); });

await page.click('#buyNow');
await page.waitForTimeout(800);
ok(checkoutBody && JSON.parse(checkoutBody).productId === 1, `checkout 请求体含 productId=1 (${checkoutBody})`);
ok(redirected, '下单后跳转到支付地址 (payUrl)');

// ---------- 4. 数量变化合计更新 ----------
console.log('[4] 数量联动');
await page.goto(BASE + '/buy.html?id=1', { waitUntil: 'networkidle' });
await page.waitForSelector('#qtyInput', { timeout: 3000 });
await page.click('#qtyPlus');
await page.click('#qtyPlus');
const q = await page.$eval('#qtyInput', el => el.value);
const t2 = await page.$eval('#totalPrice', el => el.textContent);
ok(q === '3', `加数量后 qty=${q} (预期 3)`);
ok(t2 === '$597.00', `合计随数量更新: ${t2} (预期 $597.00)`);

await browser.close();
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
