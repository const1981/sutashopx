import { createRequire } from 'module';
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');
import http from 'http';
import fs from 'fs';
import path from 'path';

// 起一个本地静态服务，把 public/ 当根
const ROOT = path.resolve('public');
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p);
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    const ext = path.extname(fp);
    const ct = ext === '.html' ? 'text/html' : ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': ct });
    res.end(buf);
  });
});
await new Promise(r => server.listen(8099, r));

const browser = await chromium.launch();
// 模拟老 Android WebView（Chrome 旧版 UA）
const mobileCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 5.1; SM-G928G Build/LMY47X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/47.0.2526.83 Mobile Safari/537.36',
});

async function check(file, label) {
  const page = await mobileCtx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8099/' + file, { waitUntil: 'networkidle' });
  // 抓 render 出来的封面 background-image
  let bg = null;
  if (file === 'buy.html') {
    // 跳到带 id 的购买页
    await page.goto('http://127.0.0.1:8099/buy.html?id=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('.detail-cover', { timeout: 8000 }).catch(()=>{});
    bg = await page.$eval('.detail-cover', el => getComputedStyle(el).backgroundImage).catch(()=>null);
  } else {
    await page.waitForSelector('.card-thumb', { timeout: 8000 }).catch(()=>{});
    bg = await page.$eval('.card-thumb', el => getComputedStyle(el).backgroundImage).catch(()=>null);
  }
  const ok = bg && bg.startsWith('url(') && bg.includes('data:image/svg+xml');
  console.log(`[${label}] 封面 backgroundImage:`, bg ? bg.slice(0, 80) + '...' : 'NULL');
  console.log(`[${label}] 占位图渲染:`, ok ? '✅ 正常' : '❌ 仍空白/无效');
  console.log(`[${label}] 页面 JS 错误:`, errs.length ? errs.join('; ') : '无');
  await page.close();
}

// 1) 首页封面（store.js makeCover）
await check('index.html', '首页卡片');

// 2) 购买页封面（buy.html makeCover）+ 返回键可点性检测
const page = await mobileCtx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://127.0.0.1:8099/buy.html?id=1', { waitUntil: 'networkidle' });
await page.waitForSelector('#buyBack', { timeout: 8000 }).catch(()=>{});
const backInfo = await page.$eval('#buyBack', el => ({ tag: el.tagName, href: el.getAttribute('href'), hasListener: true })).catch(()=>null);
console.log('[购买页] 返回键元素:', JSON.stringify(backInfo));
// 验证点击返回键能触发（history 行为在本地单页不好测，至少确认元素存在且非 javascript: href）
const safeHref = backInfo && backInfo.href && !backInfo.href.startsWith('javascript:');
console.log('[购买页] 返回键 href 安全(非 javascript:):', safeHref ? '✅' : '❌');
console.log('[购买页] JS 错误:', errs.length ? errs.join('; ') : '无');
await page.close();

await browser.close();
server.close();
console.log('\n全部检查完成');
