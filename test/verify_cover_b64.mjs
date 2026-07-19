import { createRequire } from 'module';
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('public');
const MOCK = [{ id:1, name:'A', subtitle:'s', description:'d', price:990, category_slug:'business', category_name:'创业', delivery_type:'CARD_AUTO', stock_mode:'UNLIMITED', availableStock:99, min_buy:1, max_buy:1, cover_image:null }];
const server = http.createServer((req,res)=>{
  const u = req.url.split('?')[0];
  if (u==='/api/config'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({site:{site_name:'SX',currency:'usd',footer_text:'x'},categories:[{slug:'business',name:'创业'}],banners:[],gateways:[]}));return;}
  if (u==='/api/products'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({items:MOCK,total:1,page:1,totalPages:1}));return;}
  if (u.startsWith('/api/products/')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({product:MOCK[0]}));return;}
  let p=decodeURIComponent(u); if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{ if(e){res.writeHead(404);res.end('nf');return;} const ext=path.extname(p); const ct=ext==='.html'?'text/html':ext==='.js'?'text/javascript':ext==='.css'?'text/css':'application/octet-stream'; res.writeHead(200,{'content-type':ct}); res.end(b); });
});
await new Promise(r=>server.listen(8099,'localhost',r));

const browser = await chromium.launch();

// 用真实浏览器加载 data URI 成 <img>，检测能否解码（naturalWidth>0 = 真渲染成功）
async function testUA(label, ua) {
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, userAgent: ua });
  const page = await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('http://localhost:8099/index.html',{waitUntil:'networkidle'});
  await page.waitForSelector('.card-thumb',{timeout:8000}).catch(()=>{});
  // 取卡片背景 data URI
  const bg = await page.$eval('.card-thumb', el => {
    const m = getComputedStyle(el).backgroundImage.match(/url\("?(data:[^"')]+)"?\)/);
    return m ? m[1] : null;
  }).catch(()=>null);
  let decoded = false, natW = 0;
  if (bg) {
    // 在页面里把 data URI 当 img 加载，看能不能真解码
    const res = await page.evaluate(uri => new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ ok: false, w: 0, h: 0 });
      img.src = uri;
      setTimeout(() => resolve({ ok: false, w: 0, h: 0, timeout: true }), 3000);
    }), bg);
    decoded = res.ok; natW = res.w;
  }
  const fmt = bg ? bg.slice(0, 30) : 'NULL';
  console.log(`[${label}]`);
  console.log(`  data URI 格式: ${fmt}...`);
  console.log(`  能解码成图片: ${decoded ? '✅ 是 (naturalWidth='+natW+')' : '❌ 否（白图）'}`);
  console.log(`  JS错误: ${errs.length?errs.join('; '):'无'}`);
  await ctx.close();
  return decoded;
}

const results = [];
results.push(await testUA('新版 Edge', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'));
results.push(await testUA('老版 Edge (EdgeHTML)', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/18.17763'));
results.push(await testUA('老安卓 WebView', 'Mozilla/5.0 (Linux; Android 5.1; SM-G928G Build/LMY47X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/47.0.2526.83 Mobile Safari/537.36'));
results.push(await testUA('iOS Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1'));

await browser.close();
server.close();
console.log('\n========== 汇总 ==========');
console.log(results.every(Boolean) ? '✅ 所有浏览器 UA 下占位图都能显示' : '❌ 仍有浏览器显示白图');
