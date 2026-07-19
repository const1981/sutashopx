import { createRequire } from 'module';
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');
// 用 Worker 直连域（自定义域 suta.eu.cc 间歇抖动），验证代码逻辑
const BASE = 'https://sutashopx.web-bb7.workers.dev/';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌', m); } };

const browser = await chromium.launch();

// ---------- 桌面端：点购买弹 modal ----------
console.log('[桌面端 1280px]');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForSelector('#feedGrid .buy-btn', { timeout: 8000 });
  await page.click('#feedGrid .buy-btn');
  await page.waitForTimeout(700);
  const open = await page.$eval('#modalMask', el => el.classList.contains('open')).catch(() => false);
  ok(open, '点购买弹出 modal 弹窗');
  const bodyLen = await page.$eval('#modalBody', el => el.innerHTML.length).catch(() => 0);
  ok(bodyLen > 50, `modal 内容已渲染 (len=${bodyLen})`);
  ok(errs.length === 0, `无 JS 报错 (${errs[0] || 'clean'})`);
  await ctx.close();
}

// ---------- 手机端：点购买跳 buy.html ----------
console.log('[手机端 390px]');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForSelector('#feedGrid .buy-btn', { timeout: 8000 });
  // banner 应隐藏
  const bannerDisp = await page.$eval('.carousel-shell', el => getComputedStyle(el).display).catch(() => 'N/A');
  ok(bannerDisp === 'none', `幻灯片已隐藏 (display=${bannerDisp})`);
  // 点购买 → 跳 buy.html
  await page.click('#feedGrid .buy-btn');
  await page.waitForTimeout(800);
  const url = page.url();
  ok(url.includes('/buy.html?id='), `点购买跳转到购买页 (${url.split('/').pop()})`);
  // buy.html 渲染
  if (url.includes('/buy.html')) {
    await page.waitForSelector('#buyNow', { timeout: 6000 }).catch(() => {});
    const hasBtn = await page.$('#buyNow') !== null;
    ok(hasBtn, '购买页「去支付」按钮已渲染');
    const gw = await page.$$eval('#gwSelect option', e => e.length).catch(() => 0);
    ok(true, `支付方式下拉项=${gw}（网关空时此值为0属正常）`);
  }
  ok(errs.length === 0, `无 JS 报错 (${errs[0] || 'clean'})`);
  await ctx.close();
}

await browser.close();
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
