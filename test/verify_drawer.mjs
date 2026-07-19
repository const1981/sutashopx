import { createRequire } from 'module';
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('public');
const MOCK = [{ id:1, name:'A', subtitle:'s', description:'d', price:990, category_slug:'ai', category_name:'AI', delivery_type:'CARD_AUTO', stock_mode:'UNLIMITED', availableStock:99, min_buy:1, max_buy:1, cover_image:null }];
const server = http.createServer((req,res)=>{
  const u = req.url.split('?')[0];
  if (u==='/api/config'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({site:{site_name:'SX',currency:'usd',footer_text:'x'},categories:[{slug:'ai',name:'AI'},{slug:'tools',name:'工具'}],banners:[],gateways:[]}));return;}
  if (u==='/api/products'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({items:MOCK,total:1,page:1,totalPages:1}));return;}
  if (u.startsWith('/api/products/')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({product:MOCK[0]}));return;}
  let p=decodeURIComponent(u); if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{ if(e){res.writeHead(404);res.end('nf');return;} const ext=path.extname(p); const ct=ext==='.html'?'text/html':ext==='.js'?'text/javascript':ext==='.css'?'text/css':'application/octet-stream'; res.writeHead(200,{'content-type':ct}); res.end(b); });
});
await new Promise(r=>server.listen(8099,'localhost',r));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, userAgent:'Mozilla/5.0 (Linux; Android 5.1; SM-G928G Build/LMY47X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/47.0.2526.83 Mobile Safari/537.36' });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:8099/index.html',{waitUntil:'networkidle'});
await page.waitForSelector('#drawerTabs .drawer-tab',{timeout:8000}).catch(()=>{});
// 打开抽屉
await page.click('#hamburger');
await page.waitForTimeout(500);
const tabs = await page.$$eval('#drawerTabs .drawer-tab', els => els.map(el=>{
  const svg = el.querySelector('svg');
  const cs = getComputedStyle(el);
  const sc = svg?getComputedStyle(svg):null;
  return {
    text: el.childNodes[0].textContent.trim(),
    display: cs.display,
    svgW: sc? sc.width : 'NO-SVG',
    svgH: sc? sc.height : 'NO-SVG',
    flexShrink: sc? sc.flexShrink : 'n/a',
  };
}));
console.log('抽屉导航项数:', tabs.length);
tabs.forEach(t=>console.log("  ["+t.text+"] display="+t.display+" svg="+t.svgW+"x"+t.svgH+" flexShrink="+t.flexShrink));
// 判断是否变形：svg 尺寸应接近 18px，不被拉伸成巨长条
const deformed = tabs.some(t=> t.svgW==='NO-SVG' || parseFloat(t.svgW)>40 || parseFloat(t.svgH)>40);
console.log('箭头是否变形(>40px):', deformed?'❌ 仍变形':'✅ 正常(定宽高)');
console.log('JS错误:', errs.length?errs.join('; '):'无');
await browser.close();
server.close();
console.log('\n抽屉验证结束');
