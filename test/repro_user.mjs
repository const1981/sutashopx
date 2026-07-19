import { createRequire } from 'module';
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');

// 用户实际访问的自定义域
const BASE = 'https://shopx.suta.eu.cc/';
const browser = await chromium.launch();

async function run(label, opts) {
  console.log(`\n========== ${label} ==========`);
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0,120)); });
  let loaded = false;
  for (let i = 0; i < 4 && !loaded; i++) {
    try { await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 }); loaded = true; }
    catch { console.log('  goto 重试', i+1); }
  }
  if (!loaded) { console.log('  ❌ 域名根本打不开（自定义域 DNS/SSL 问题）'); await ctx.close(); return; }
  console.log('  首页加载 OK, title:', await page.title());
  let hasCard = false;
  try { await page.waitForSelector('#feedGrid .buy-btn', { timeout: 10000 }); hasCard = true; } catch {}
  console.log('  商品按钮出现:', hasCard);
  if (!hasCard) { console.log('  feedGrid:', (await page.$eval('#feedGrid', e=>e.innerHTML.slice(0,150)).catch(()=>'?'))); await ctx.close(); return; }

  await page.click('#feedGrid .buy-btn');
  await page.waitForTimeout(1500);
  const url = page.url();
  console.log('  点购买后 URL:', url.replace(BASE, '/') || '/');
  // 桌面：查 modal；手机：应跳 buy 页
  const modal = await page.$eval('#modalMask', el => ({ open: el.classList.contains('open'), op: getComputedStyle(el).opacity })).catch(()=>null);
  console.log('  modal 状态:', JSON.stringify(modal));
  const buyNow = await page.$('#buyNow');
  console.log('  购买页/弹窗内「去支付」按钮:', buyNow ? '存在' : '无');
  console.log('  JS 报错:', errs.length ? errs.join(' || ') : '无');
  const shot = 'test/shot_' + label.replace(/[^a-z0-9]/gi,'_') + '.png';
  await page.screenshot({ path: shot, fullPage: false });
  console.log('  截图:', shot);
  await ctx.close();
}

await run('desktop', { viewport: { width: 1280, height: 900 } });
await run('mobile', { viewport: { width: 390, height: 844 }, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' });

await browser.close();
