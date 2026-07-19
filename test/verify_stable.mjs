import { createRequire } from 'module';
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');
const BASE = 'https://sutashopx.web-bb7.workers.dev/';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌', m); } };

const browser = await chromium.launch();
let desktopErr = [], mobileErr = [];

// 桌面端
console.log('[桌面 1280px]');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => desktopErr.push(e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#feedGrid .buy-btn', { timeout: 10000 });
  await page.waitForTimeout(600);
  await page.click('#feedGrid .buy-btn');
  await page.waitForTimeout(1200);              // 等 CSS 过渡完成
  const op = await page.$eval('#modalMask', el => +getComputedStyle(el).opacity);
  ok(op > 0.9, `modal 弹窗可见 (opacity=${op})`);
  const bodyLen = await page.$eval('#modalBody', el => el.innerHTML.length);
  ok(bodyLen > 200, `modal 商品内容渲染 (len=${bodyLen})`);
  await page.click('#modalClose');
  await page.waitForTimeout(500);
  const closed = await page.$eval('#modalMask', el => !el.classList.contains('open'));
  ok(closed, 'modal 可正常关闭');
  ok(desktopErr.length === 0, `无 JS 报错 (${desktopErr[0] || 'clean'})`);
  await ctx.close();
}

// 手机端
console.log('[手机 390px]');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' });
  const page = await ctx.newPage();
  page.on('pageerror', e => mobileErr.push(e.message));
  // 重试最多 3 次（自定义域/直连域偶发抖动）
  let loaded = false;
  for (let i = 0; i < 3 && !loaded; i++) {
    try { await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 }); await page.waitForSelector('#feedGrid .buy-btn', { timeout: 10000 }); loaded = true; }
    catch (e) { console.log('  (重试 ' + (i+1) + ')'); }
  }
  ok(loaded, '手机端首页加载成功');
  if (loaded) {
    const bannerDisp = await page.$eval('.carousel-shell', el => getComputedStyle(el).display).catch(() => 'N/A');
    ok(bannerDisp === 'none', `幻灯片已隐藏 (display=${bannerDisp})`);
    await page.click('#feedGrid .buy-btn');
    let jumped = false;
    for (let i = 0; i < 3 && !jumped; i++) {
      try { await page.waitForFunction(() => location.href.includes('buy'), { timeout: 5000 }); jumped = true; } catch {}
    }
    ok(jumped, `点购买跳转到购买页 (${page.url().split('/').pop()})`);
    // 等购买页拉完商品并渲染按钮
    let hasBuy = false;
    try { await page.waitForSelector('#buyNow', { timeout: 8000 }); hasBuy = true; } catch {}
    ok(hasBuy, '购买页「去支付」按钮渲染');
  }
  ok(mobileErr.length === 0, `无 JS 报错 (${mobileErr[0] || 'clean'})`);
  await ctx.close();
}

await browser.close();
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
