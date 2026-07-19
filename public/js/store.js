// ============================================================
//  SutaShopX 商城 · 前台交互
// ============================================================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let SITE = null;          // 站点配置
let CATS = [];            // 分类列表
let BANNERS = [];         // 幻灯片（后台管理）
let GATEWAYS = [];        // 已启用支付网关
let currentCat = 'all';
let currentPage = 1;
let currentQ = '';
const PAGE_SIZE = 12;

const TONE = {
  ai:        { tone: 'tone-ai',        color: 'var(--color-accent-warm)', grad: 'linear-gradient(135deg,var(--tone-ai-1),var(--tone-ai-2))',        icon: '<path d="M12 2a4 4 0 0 1 4 4v2h2a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3h-2v2a4 4 0 0 1-8 0v-2H6a3 3 0 0 1-3-3v-3a3 3 0 0 1 3-3h2V6a4 4 0 0 1 4-4z"/><circle cx="10" cy="11" r="1" fill="currentColor"/><circle cx="14" cy="11" r="1" fill="currentColor"/>' },
  tools:     { tone: 'tone-tools',     color: 'var(--color-accent-cool)', grad: 'linear-gradient(135deg,var(--tone-tools-1),var(--tone-tools-2))',  icon: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2-2 2.5-2.5z"/>' },
  business:  { tone: 'tone-business',  color: '#9a7fff',                   grad: 'linear-gradient(135deg,var(--tone-business-1),var(--tone-business-2))', icon: '<path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/>' },
  materials: { tone: 'tone-materials', color: '#e8b94d',                   grad: 'linear-gradient(135deg,var(--tone-materials-1),var(--tone-materials-2))', icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>' },
};

function money(price) {
  const cur = (SITE && SITE.currency) || 'usd';
  const sym = cur === 'cny' ? '¥' : cur === 'usd' ? '$' : '';
  return sym + (price / 100).toFixed(2);
}

// #rrggbb → rgb(r,g,b)，避免 SVG 里出现 # 导致部分浏览器 data URI 解析失败
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    || /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
  if (!m) return 'rgb(136,136,136)';
  let r, g, b;
  if (hex.replace('#', '').length === 3) { r = parseInt(m[1] + m[1], 16); g = parseInt(m[2] + m[2], 16); b = parseInt(m[3] + m[3], 16); }
  else { r = parseInt(m[1], 16); g = parseInt(m[2], 16); b = parseInt(m[3], 16); }
  return `rgb(${r},${g},${b})`;
}

// 占位封面（基于分类色生成 SVG）
// 用 base64 编码整个 data URI —— 这是所有浏览器（含旧版 Edge、老安卓 WebView、
// 国产内核）都 100% 支持的格式，彻底规避 utf8/charset 前缀与 # 字符转义的兼容坑。
function makeCover(seed, cat) {
  const [h1, h2] = (TONE[cat] && TONE[cat].grad.match(/#[a-f0-9]+/gi)) || ['#888888', '#aaaaaa'];
  const c1 = hexToRgb(h1), c2 = hexToRgb(h2);
  let s = seed.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const shapes = [];
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rnd() * 400), y = Math.floor(rnd() * 250), r = Math.floor(rnd() * 80) + 30;
    shapes.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="rgb(255,255,255)" opacity="${(rnd() * 0.4 + 0.1).toFixed(2)}"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="400" height="250" fill="url(#g)"/>${shapes.join('')}<text x="20" y="225" font-family="Arial,sans-serif" font-size="22" font-weight="800" fill="rgb(255,255,255)" opacity="0.85">SutaShopX</text></svg>`;
  // base64 编码：btoa 需要 latin1，SVG 全是 ASCII 字符，直接用即可
  try {
    return 'data:image/svg+xml;base64,' + btoa(svg);
  } catch (e) {
    // 极端兜底：仍用 charset=utf-8（此时 SVG 已无 #，各浏览器都能解析）
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------------- 初始化配置 ----------------
async function loadConfig() {
  const r = await fetch('/api/config');
  const data = await r.json();
  SITE = data.site; CATS = data.categories || []; BANNERS = data.banners || []; GATEWAYS = data.gateways || [];
  if (SITE) {
    document.title = SITE.site_name + ' · 精选数字好物';
    $('#brandName').textContent = SITE.site_name;
    $('#footerText').textContent = SITE.footer_text || ('© 2026 ' + SITE.site_name);
    $('#footContact').textContent = SITE.support_contact || '联系客服';
    if (SITE.notice) renderNotice([SITE.notice]);
  }
  renderTabs();
}

function renderTabs() {
  const names = { all: '全部' };
  CATS.forEach(c => names[c.slug] = c.name);
  const tabs = ['all', ...CATS.map(c => c.slug)];
  $('#headerTabs').innerHTML = tabs.map(s =>
    `<button class="tab-btn ${s === currentCat ? 'active' : ''}" data-cat="${s}">${names[s]}</button>`).join('');
  $('#drawerTabs').innerHTML = tabs.map(s =>
    `<a class="drawer-tab ${s === currentCat ? 'active' : ''}" data-cat="${s}">${names[s]}</a>`).join('');
}

// ---------------- 公告 ----------------
function renderNotice(list) {
  const track = $('#noticeTrack');
  if (!list.length) { track.innerHTML = ''; return; }
  track.innerHTML = list.map(t => `<div class="notice-item"><span>${t}</span></div>`).join('');
  if (list.length > 1) {
    let i = 0;
    setInterval(() => { i = (i + 1) % list.length; track.style.transform = `translateY(-${i * 22}px)`; }, 3500);
  }
}

// ---------------- Banner（后台管理） ----------------
let bIdx = 0, bTimer = null;
function bannerVisualStyle(b) {
  if (b.mode === 'image' && b.image_url) {
    // 图片模式：图片铺底 + 轻微高光
    return `background-image:radial-gradient(circle at 20% 30%, #ffffff22, transparent 50%),url('${b.image_url.replace(/'/g, "%27")}');background-size:cover;background-position:center;`;
  }
  // 渐变模式：取渐变里的颜色，回退到品牌色
  const grad = b.gradient || 'linear-gradient(135deg,#ff8a5a,#5b8fff)';
  const colors = grad.match(/#[a-f0-9]+/gi) || ['#ff8a5a', '#5b8fff'];
  const a = colors[0], c = colors[1] || colors[0];
  return `background-image:linear-gradient(135deg,${a},${c}),radial-gradient(circle at 20% 30%, #ffffff33, transparent 50%);`;
}
function renderBanner() {
  const zone = $('#bannerZone');
  if (!BANNERS.length) { if (zone) zone.style.display = 'none'; return; }
  if (zone) zone.style.display = '';
  $('#bannerTrack').innerHTML = BANNERS.map((b, i) => {
    const clickable = b.link_url ? ` data-link="${b.link_url}" style="cursor:pointer;"` : '';
    return `<div class="banner-slide ${i === 0 ? 'active' : ''}"${clickable}>
      <div class="banner-visual" style="${bannerVisualStyle(b)}"></div>
      <div class="banner-shade"></div>
      <div class="banner-content">
        ${b.tag ? `<span class="banner-tag">${b.tag}</span>` : ''}
        <h2 class="banner-title">${b.title}</h2>
        ${b.subtitle ? `<p class="banner-desc">${b.subtitle}</p>` : ''}
      </div></div>`;
  }).join('');
  $('#bannerDots').innerHTML = BANNERS.map((_, i) => `<button data-i="${i}" class="${i === 0 ? 'active' : ''}"></button>`).join('');
  $$('#bannerDots button').forEach(b => b.onclick = (e) => { e.stopPropagation(); goBanner(+b.dataset.i); });
  $$('#bannerTrack .banner-slide[data-link]').forEach(s => s.onclick = () => {
    const url = s.dataset.link;
    if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener');
    else window.location.href = url;
  });
  resetBanner();
}
function goBanner(i) { bIdx = (i + BANNERS.length) % BANNERS.length; $('#bannerTrack').style.transform = `translateX(-${bIdx * 100}%)`; $$('#bannerTrack .banner-slide').forEach((s, idx) => s.classList.toggle('active', idx === bIdx)); $$('#bannerDots button').forEach((b, idx) => b.classList.toggle('active', idx === bIdx)); resetBanner(); }
function resetBanner() { clearInterval(bTimer); bTimer = setInterval(() => goBanner(bIdx + 1), 5000); }

// ---------------- 商品列表 ----------------
function skeletonHTML(n = 8) {
  let cards = '';
  for (let i = 0; i < n; i++) {
    cards += `<div class="skel-card"><div class="skel-thumb"></div><div class="skel-body"><div class="skel-line lg w70"></div><div class="skel-line w90"></div><div class="skel-line w50"></div><div class="skel-line w40"></div></div></div>`;
  }
  return `<div class="feed-skeleton">${cards}</div>`;
}
async function loadProducts() {
  if (currentPage === 1) $('#feedGrid').innerHTML = skeletonHTML(8);
  let url = `/api/products?cat=${encodeURIComponent(currentCat)}&page=${currentPage}&q=${encodeURIComponent(currentQ)}`;
  const r = await fetch(url);
  const data = await r.json();
  let items = data.items || [];
  const sort = ($$('#feedSort button').find(b => b.classList.contains('active')) || {}).dataset?.sort || 'default';
  if (sort === 'price_asc') items = [...items].sort((a, b) => a.price - b.price);
  if (sort === 'price_desc') items = [...items].sort((a, b) => b.price - a.price);

  const catName = currentCat === 'all' ? '全部商品' : (CATS.find(c => c.slug === currentCat) || {}).name || '商品';
  $('#feedTitle').textContent = currentQ ? `搜索：“${currentQ}”` : catName;
  $('#feedCount').textContent = `共 ${data.total} 件 · 第 ${data.page}/${data.totalPages} 页`;
  const csb = $('#clearSearchBtn');
  if (csb) csb.hidden = !currentQ;

  if (!items.length) {
    $('#feedGrid').innerHTML = '<div class="feed-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 7h18M3 12h18M3 17h12"/></svg><p>暂无商品</p><small>去后台添加数字商品，或换个分类看看～</small></div>';
  } else {
    $('#feedGrid').innerHTML = items.map((p, i) => {
      const tone = (TONE[p.category_slug] || TONE.ai).tone;
      const stockTxt = p.stock_mode === 'UNLIMITED'
        ? '<span class="stock-hint">库存充足</span>'
        : (p.availableStock <= 0 ? '<span class="stock-hint stock-low">已售罄</span>'
          : (p.availableStock <= 5 ? `<span class="stock-hint stock-low">仅剩 ${p.availableStock} 件</span>` : `<span class="stock-hint">库存 ${p.availableStock}</span>`));
      const soldOut = p.stock_mode !== 'UNLIMITED' && p.availableStock <= 0;
      return `<article class="feed-card ${tone}" data-id="${p.id}" style="animation-delay:${i * 50}ms">
        <div class="card-thumb"><div class="card-thumb-tone"></div>
          <img loading="lazy" decoding="async" src="${p.cover_image || makeCover('p' + p.id, p.category_slug)}" alt="${p.name}">
          <span class="card-type-badge">${p.category_name || '商品'}</span>
        </div>
        <div class="card-body">
          <div class="title-row"><h3>${p.name}</h3></div>
          <p class="summary">${p.subtitle || p.description || ''}</p>
          <div class="price-row">
            <span class="price"><small>${money(p.price).replace(/[\d.,]+$/, '')}</small>${money(p.price).replace(/^[^\d]*/, '')}</span>
            ${stockTxt}
          </div>
          <div style="margin-top:4px;"><button class="buy-btn" data-id="${p.id}" ${soldOut ? 'disabled' : ''}>${soldOut ? '已售罄' : '立即购买'}</button></div>
        </div></article>`;
    }).join('');
    // 手机端（≤820px）直接跳转到独立购买页，避免弹窗在部分内核上不弹出
    $$('#feedGrid .feed-card').forEach(c => c.onclick = () => {
      if (window.matchMedia('(max-width: 820px)').matches) { location.href = 'buy.html?id=' + c.dataset.id; return; }
      openDetail(+c.dataset.id);
    });
    $$('#feedGrid .buy-btn').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      if (window.matchMedia('(max-width: 820px)').matches) { location.href = 'buy.html?id=' + b.dataset.id; return; }
      openDetail(+b.dataset.id);
    });
  }
  renderPagination(data);
}

function renderPagination(data) {
  const p = data.page, total = data.totalPages;
  if (total <= 1) { $('#feedPagination').innerHTML = ''; return; }
  let html = `<button class="page-btn" ${p === 1 ? 'disabled' : ''} data-p="${p - 1}">‹</button>`;
  const set = new Set([1, 2, total - 1, total, p - 1, p, p + 1]);
  const sorted = [...set].filter(x => x >= 1 && x <= total).sort((a, b) => a - b);
  let prev = 0;
  sorted.forEach(n => { if (n - prev > 1) html += '<span class="page-ellipsis">…</span>'; html += `<button class="page-btn ${n === p ? 'active' : ''}" data-p="${n}">${n}</button>`; prev = n; });
  html += `<button class="page-btn" ${p === total ? 'disabled' : ''} data-p="${p + 1}">›</button>`;
  $('#feedPagination').innerHTML = html;
  $$('#feedPagination button[data-p]').forEach(b => b.onclick = () => { currentPage = +b.dataset.p; loadProducts(); window.scrollTo({ top: $('#feedShell').offsetTop - 80, behavior: 'smooth' }); });
}

// ---------------- 商品详情 / 购买 ----------------
async function openDetail(id) {
  const r = await fetch('/api/products/' + id);
  if (!r.ok) { toast('商品不存在'); return; }
  const { product } = await r.json();
  const tone = (TONE[product.category_slug] || TONE.ai).tone;
  const min = product.min_buy || 1, max = product.max_buy || 1;
  $('#modalTitle').textContent = product.name;
  const stockTxt = product.stock_mode === 'UNLIMITED' ? '库存充足' : `库存 ${product.availableStock ?? product.stock}`;
  $('#modalBody').innerHTML = `
    <div class="detail-cover"><img src="${product.cover_image || makeCover('p' + product.id, product.category_slug)}" alt="${product.name}"></div>
    <div class="detail-meta">
      <span class="tag-chip tag-chip--blue">${product.category_name || '商品'}</span>
      <span class="tag-chip tag-chip--mint">${product.delivery_type === 'CARD_AUTO' ? '自动发卡' : product.delivery_type === 'FIXED' ? '固定内容' : '人工发货'}</span>
      <span class="tag-chip tag-chip--orange">${stockTxt}</span>
    </div>
    <p class="detail-desc">${product.description || product.subtitle || '暂无描述'}</p>
    <div class="detail-price"><span class="price">${money(product.price)}</span><span class="stock-hint">/ 件</span></div>
    <div class="contact-row"><input id="contactInput" type="text" placeholder="联系方式的选填（如邮箱/微信，便于售后）"></div>
    <div class="qty-row"><label>购买数量</label>
      <div class="qty-ctrl">
        <button id="qtyMinus">−</button>
        <input id="qtyInput" type="number" min="${min}" max="${max}" value="${min}">
        <button id="qtyPlus">+</button>
      </div>
      <span class="stock-hint">限购 ${min}~${max} 件</span>
    </div>
    <div class="buy-action">
      ${GATEWAYS.length ? `<div class="gw-select"><label>支付方式</label><select id="gwSelect">${GATEWAYS.map(g => `<option value="${g.id}">${g.display_name}</option>`).join('')}</select></div>` : ''}
      <span class="total">合计：<b id="totalPrice">${money(product.price * min)}</b></span>
      <button class="btn btn-primary" id="buyNow" style="padding:11px 26px;">去支付</button>
    </div>
    ${product.purchase_note ? `<p style="font-size:12px;color:var(--color-ink-soft);margin-top:12px;">${product.purchase_note}</p>` : ''}`;

  let qty = min;
  const sync = () => {
    qty = Math.max(min, Math.min(max, parseInt($('#qtyInput').value) || min));
    $('#qtyInput').value = qty;
    $('#totalPrice').textContent = money(product.price * qty);
  };
  $('#qtyMinus').onclick = () => { $('#qtyInput').value = qty - 1; sync(); };
  $('#qtyPlus').onclick = () => { $('#qtyInput').value = qty + 1; sync(); };
  $('#qtyInput').oninput = sync;
  $('#buyNow').onclick = () => buy(product, qty);
  openModal();
}

async function buy(product, qty) {
  $('#buyNow').disabled = true; $('#buyNow').textContent = '下单中…';
  try {
    const r = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: product.id, quantity: qty, contact: $('#contactInput').value.trim(), gateway: $('#gwSelect') ? $('#gwSelect').value : 0 }),
    });
    const data = await r.json();
    if (!r.ok) { toast(data.error || '下单失败'); $('#buyNow').disabled = false; $('#buyNow').textContent = '去支付'; return; }
    toast('正在跳转到支付…');
    setTimeout(() => { window.location.href = data.payUrl; }, 400);
  } catch (e) { toast('网络错误'); $('#buyNow').disabled = false; $('#buyNow').textContent = '去支付'; }
}

// ---------------- Modal / 抽屉 / 主题 ----------------
function openModal() { $('#modalMask').classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeModal() { $('#modalMask').classList.remove('open'); document.body.style.overflow = ''; }
$('#modalClose').onclick = closeModal;
$('#modalMask').onclick = (e) => { if (e.target === $('#modalMask')) closeModal(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function openDrawer() { $('#hamburger').classList.add('open'); $('#drawerPanel').classList.add('open'); $('#drawerMask').classList.add('open'); }
function closeDrawer() { $('#hamburger').classList.remove('open'); $('#drawerPanel').classList.remove('open'); $('#drawerMask').classList.remove('open'); }
$('#hamburger').onclick = () => $('#drawerPanel').classList.contains('open') ? closeDrawer() : openDrawer();
$('#drawerMask').onclick = closeDrawer;

function switchCat(cat) {
  currentCat = cat; currentPage = 1; renderTabs(); loadProducts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('#headerTabs').onclick = (e) => { const b = e.target.closest('.tab-btn'); if (b) switchCat(b.dataset.cat); };
$('#drawerTabs').onclick = (e) => { const b = e.target.closest('.drawer-tab'); if (b) { switchCat(b.dataset.cat); closeDrawer(); } };
$('#feedSort').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $$('#feedSort button').forEach(x => x.classList.remove('active')); b.classList.add('active'); loadProducts(); };

const themeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const moonIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem('sutashopx-theme', t); } catch (e) {} }
function toggleTheme() { const cur = document.documentElement.getAttribute('data-theme'); applyTheme(cur === 'dark' ? 'light' : 'dark'); }
$('#themeToggle').onclick = toggleTheme;
$('#themeToggleMobile').onclick = toggleTheme;
try { const s = localStorage.getItem('sutashopx-theme'); if (s) document.documentElement.setAttribute('data-theme', s); } catch (e) {}

$('#backTop').onclick = (e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
$('#bannerPrev').onclick = () => goBanner(bIdx - 1);
$('#bannerNext').onclick = () => goBanner(bIdx + 1);
$('#bannerZone').addEventListener('pointerdown', () => { clearInterval(bTimer); });
$('#bannerZone').addEventListener('pointerup', resetBanner);

// 搜索框（置于顶部 header，桌面 + 移动端）
(function () {
  const bind = (sel) => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = e.target.value.trim();
        if (!v) { clearSearch(); return; }
        currentQ = v;
        currentPage = 1;
        loadProducts();
        window.scrollTo({ top: ($('#feedShell').offsetTop || 0) - 80, behavior: 'smooth' });
        // 同步另一个搜索框
        const other = sel === '#headerSearch' ? $('#mobileSearch') : $('#headerSearch');
        if (other && other.value !== e.target.value) other.value = e.target.value;
        // 若在抽屉里搜索，收起抽屉
        if (sel === '#mobileSearch' && typeof closeDrawer === 'function') closeDrawer();
      }
    });
  };
  bind('#headerSearch');
  bind('#mobileSearch');

  // 桌面端圆形搜索按钮：点击展开/收起下拉
  const sBtn = $('#headerSearchBtn');
  const sPop = $('#searchPop');
  if (sBtn && sPop) {
    sBtn.onclick = (e) => { e.stopPropagation(); sPop.classList.toggle('open'); if (sPop.classList.contains('open')) $('#headerSearch').focus(); };
    sPop.onclick = (e) => e.stopPropagation();
    document.addEventListener('click', () => sPop.classList.remove('open'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sPop.classList.remove('open'); });
  }

  // 清除搜索，回到全部商品
  function clearSearch() {
    currentQ = '';
    currentPage = 1;
    const a = $('#headerSearch'), b = $('#mobileSearch');
    if (a) a.value = '';
    if (b) b.value = '';
    if (sPop) sPop.classList.remove('open');
    loadProducts();
  }
  const scBtn = $('#searchClear');
  if (scBtn) scBtn.onclick = clearSearch;
  const mcBtn = $('#mobileClear');
  if (mcBtn) mcBtn.onclick = clearSearch;
  const fsb = $('#clearSearchBtn');
  if (fsb) fsb.onclick = clearSearch;
})();

// ---------------- 启动 ----------------
(async function init() {
  await loadConfig();
  renderBanner();
  await loadProducts();
})();
