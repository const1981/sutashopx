import { createRequire } from 'module';
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('public');
// 假后端：返回商品列表（含 cover_image=null 以触发占位图 makeCover）
const MOCK = [
  { id: 1, name: '测试商品A', subtitle: '示例', description: '描述', price: 990, category_slug: 'ai', category_name: 'AI', delivery_type: 'CARD_AUTO', stock_mode: 'UNLIMITED', availableStock: 99, min_buy: 1, max_buy: 1, cover_image: null },
];
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/api/config') { res.writeHead(200,{'content-type':'application/json'}); res.end(JSON.stringify({ site:{site_name:'SutaShopX',currency:'usd',footer_text:'© 2026'}, categories:[{slug:'ai',name:'AI'}], banners:[], gateways:[] })); return; }
  if (u === '/api/products') { res.writeHead(200,{'content-type':'application/json'}); res.end(JSON.stringify({ items: MOCK, total: 1, page: 1, totalPages: 1 })); return; }
  if (u.startsWith('/api/products/')) { const id = u.split('/').pop(); res.writeHead(200,{'content-type':'application/json'}); res.end(JSON.stringify({ product: MOCK.find(m=>String(m.id)===id) || MOCK[0] })); return; }
  // 静态文件
  let p = decodeURIComponent(u);
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
await new Promise(r => server.listen(8099, 'localhost', r));

const browser = await chromium.launch();
const mobileCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 5.1; SM-G928G Build/LMY47X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/47.0.2526.83 Mobile Safari/537.36',
});

// === 1) 首页卡片占位图 ===
{
  const page = await mobileCtx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('.card-thumb', { timeout: 8000 }).catch(()=>{});
  const bg = await page.$eval('.card-thumb', el => getComputedStyle(el).backgroundImage).catch(()=>null);
  const ok = bg && bg.startsWith('url("data:image/svg+xml');
  console.log('[首页] 封面 backgroundImage 前缀:', bg ? bg.slice(0, 55) : 'NULL');
  console.log('[首页] 占位图(老手机)渲染:', ok ? '✅ 正常' : '❌ 空白');
  console.log('[首页] JS错误:', errs.length ? errs.join('; ') : '无');
  await page.close();
}

// === 2) 购买页占位图 + 返回键 ===
{
  const page = await mobileCtx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8099/buy.html?id=1', { waitUntil: 'networkidle' });
  await page.waitForSelector('.detail-cover', { timeout: 8000 }).catch(()=>{});
  const bg = await page.$eval('.detail-cover', el => getComputedStyle(el).backgroundImage).catch(()=>null);
  const ok = bg && bg.startsWith('url("data:image/svg+xml');
  console.log('[购买页] 封面前缀:', bg ? bg.slice(0, 55) : 'NULL');
  console.log('[购买页] 占位图(老手机)渲染:', ok ? '✅ 正常' : '❌ 空白');
  // 点击返回键：应触发 history.back（本地无历史则跳/）
  const back = await page.$('#buyBack');
  console.log('[购买页] 返回键存在:', back ? '✅' : '❌');
  console.log('[购买页] JS错误:', errs.length ? errs.join('; ') : '无');
  await page.close();
}

await browser.close();
server.close();
console.log('\n✅ 验证结束');
