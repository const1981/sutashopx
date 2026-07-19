import { createRequire } from 'module';
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');
const BASE = 'https://sutashopx.web-bb7.workers.dev/';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌', m); } };

const browser = await chromium.launch();

// 桌面端
console.log('[桌面 1280px]');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#feedGrid .buy-btn', { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.click('#feedGrid .buy-btn');
  await page.waitForFunction(() => document.querySelector('#modalMask')?.classList.contains('open'), { timeout: 5000 });
  const op = await page.$eval('#modalMask', el => +getComputedStyle(el).opacity);
  ok(op > 0.9, `modal 弹窗可见 (opacity=${op})`);
  const bodyLen = await page.$eval('#modalBody', el => el.innerHTML.length);
  ok(bodyLen > 200, `modal 商品内容渲染 (len=${bodyLen})`);
  // 关闭再点另一个确认不是偶发
  await page.click('#modalClose');
  await page.waitForTimeout(400);
  const closed = await page.$eval('#modalMask', el => !el.classList.contains('open'));
  ok(closed, 'modal 可关闭');
  ok(errs.length === 0, `无 JS 报错 (${errs[0] || 'clean'})`);
  await ctx.close();
}

// 手机端
console.log('[手机 390px]');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#feedGrid .buy-btn', { timeout: 10000 });
  const bannerDisp = await page.$eval('.carousel-shell', el => getComputedStyle(el).display).catch(() => 'N/A');
  ok(bannerDisp === 'none', `幻灯片隐藏 (display=${bannerDisp})`);
  await page.click('#feedGrid .buy-btn');
  await page.waitForFunction(() => location.href.includes('buy'), { timeout: 5000 });
  const url = page.url();
  ok(/buy\.?html?\?id=/.test(url) || url.includes('buy?id='), `跳转到购买页 (${url.split('/').pop()})`);
  const hasBuy = await page.$('#buyNow') !== null;
  ok(hasBuy, '购买页「去支付」按钮渲染');
  ok(errs.length === 0, `无 JS 报错 (${errs[0] || 'clean'})`);
  await ctx.close();
}

await browser.close();
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
