// ============================================================
//  BU31 商城 · 管理后台
// ============================================================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const API_BASE = '';
let TOKEN = localStorage.getItem('bu31-admin-token') || '';
let CATS = [];

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}
async function api(path, method = 'GET', body) {
  const opt = { method, headers: {} };
  if (TOKEN) opt.headers['Authorization'] = 'Bearer ' + TOKEN;
  if (body !== undefined) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(API_BASE + path, opt);
  if (r.status === 401) { logout(); throw new Error('未登录'); }
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}
function money(p) { return (p / 100).toFixed(2); }

// 用 base64 JSON 上传文件到 R2（绕开 Cloudflare 对 multipart formData 的解析崩溃）
async function uploadToR2(file, inputEl) {
  const b64 = await new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result);
      const comma = s.indexOf(',');
      res(comma >= 0 ? s.slice(comma + 1) : s);
    };
    reader.onerror = () => rej(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
  const r = await fetch('/api/admin/upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream', data: b64 })
  });
  const d = await r.json().catch(() => ({}));
  if (r.ok && d.url) { if (inputEl) inputEl.value = d.url; return d.url; }
  toast(d.error || '上传失败');
  return null;
}

function openModal(title, html, wide) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  $('#modalCard').classList.toggle('wide', !!wide);
  $('#modalMask').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() { $('#modalMask').classList.remove('open'); document.body.style.overflow = ''; }
$('#modalClose').onclick = closeModal;
$('#modalMask').onclick = (e) => { if (e.target === $('#modalMask')) closeModal(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// ---------- 登录态 ----------
function showLogin() { $('#loginView').classList.remove('hidden'); $('#adminView').classList.add('hidden'); }
function showAdmin() { $('#loginView').classList.add('hidden'); $('#adminView').classList.remove('hidden'); }
async function logout() {
  TOKEN = ''; localStorage.removeItem('bu31-admin-token');
  try { await api('/api/admin/logout', 'POST'); } catch (e) {}
  showLogin();
}
$('#logoutBtn').onclick = logout;

$('#loginBtn').onclick = async () => {
  const username = $('#loginUser').value.trim();
  const password = $('#loginPass').value;
  if (!username || !password) { toast('请输入账号和密码'); return; }
  const r = await api('/api/admin/login', 'POST', { username, password });
  if (r.ok) {
    TOKEN = r.data.token || '';
    if (TOKEN) localStorage.setItem('bu31-admin-token', TOKEN);
    $('#adminUser').textContent = '你好，' + (r.data.admin.nickname || r.data.admin.username);
    await afterLogin();
  } else { toast(r.data.error || '登录失败'); }
};

async function afterLogin() {
  // 拉分类供表单使用
  const c = await api('/api/admin/categories');
  CATS = c.ok ? c.data.items : [];
  showAdmin();
  switchTab('overview');
}

// ---------- 导航 ----------
const TITLES = { overview: '概览', products: '商品管理', orders: '订单管理', banners: '幻灯片管理', gateways: '支付配置', categories: '分类管理', machine: '机器批量', settings: '站点设置' };
function switchTab(tab) {
  $$('#adminNav button[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.admin-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + tab));
  $('#adminTitle').textContent = TITLES[tab];
  if (tab === 'overview') renderOverview();
  if (tab === 'products') renderProducts();
  if (tab === 'orders') renderOrders();
  if (tab === 'banners') renderBanners();
  if (tab === 'gateways') renderGateways();
  if (tab === 'categories') renderCategories();
  if (tab === 'machine') renderMachine();
  if (tab === 'settings') renderSettings();
}
$('#adminNav').onclick = (e) => { const b = e.target.closest('button[data-tab]'); if (b) { switchTab(b.dataset.tab); if (window.innerWidth <= 760) closeAdminSide(); } };
function openAdminSide() { $('#adminSide').classList.add('open'); $('#adminMask').classList.add('open'); }
function closeAdminSide() { $('#adminSide').classList.remove('open'); $('#adminMask').classList.remove('open'); }
$('#adminMenuBtn').onclick = () => $('#adminSide').classList.contains('open') ? closeAdminSide() : openAdminSide();
$('#adminMask').onclick = closeAdminSide;

// ---------- 概览 ----------
async function renderOverview() {
  const r = await api('/api/admin/stats');
  if (!r.ok) return;
  const s = r.data;
  let low = '';
  if (s.lowStock && s.lowStock.length) {
    low = '<div style="margin-top:18px;" class="table-card"><table class="data"><tr><th>商品</th><th>剩余卡密</th></tr>' +
      s.lowStock.map(p => `<tr><td>${p.name}</td><td><span class="badge badge-red">${p.avail}</span></td></tr>`).join('') + '</table></div>';
  } else { low = '<div style="margin-top:18px;" class="empty">暂无库存预警 🎉</div>'; }
  $('#panel-overview').innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="num">${s.products}</div><div class="lbl">在售/全部商品</div></div>
      <div class="stat-card"><div class="num">${s.paidOrders}</div><div class="lbl">已支付订单</div></div>
      <div class="stat-card"><div class="num">${s.pendingOrders}</div><div class="lbl">待支付订单</div></div>
      <div class="stat-card warn"><div class="num">${money(s.revenue)}</div><div class="lbl">累计成交额</div></div>
    </div>
    <h3 style="margin:6px 0 10px;font-size:15px;">库存预警（≤5）</h3>${low}`;
}

// ---------- 商品 ----------
async function renderProducts() {
  const r = await api('/api/admin/products');
  if (!r.ok) return;
  const items = r.data.items || [];
  const rows = items.length ? items.map(p => {
    const stockTxt = p.delivery_type === 'CARD_AUTO'
      ? `卡密 ${p.availableCards ?? 0}`
      : (p.stock_mode === 'UNLIMITED' ? '无限' : `库存 ${p.stock}`);
    return `<tr>
      <td>#${p.id}</td>
      <td><b>${p.name}</b><br><small style="color:var(--color-ink-soft)">${p.subtitle || ''}</small></td>
      <td>${p.category_name || '-'}</td>
      <td>${money(p.price)}</td>
      <td>${stockTxt}</td>
      <td><span class="badge ${p.status === 1 ? 'badge-green' : 'badge-gray'}">${p.status === 1 ? '在售' : '下架'}</span></td>
      <td><div class="row-actions">
        <button class="mini-btn" data-act="edit" data-id="${p.id}">编辑</button>
        ${p.delivery_type === 'CARD_AUTO' ? `<button class="mini-btn" data-act="keys" data-id="${p.id}">卡密</button>` : ''}
        <button class="mini-btn danger" data-act="del" data-id="${p.id}">删除</button>
      </div></td></tr>`;
  }).join('') : '<tr><td colspan="6" class="empty">还没有商品，点右上角新增</td></tr>';
  $('#panel-products').innerHTML = `
    <div class="toolbar"><div class="grow"></div><button class="btn btn-primary" id="addProduct">+ 新增商品</button></div>
    <div class="table-card"><table class="data">
      <tr><th>ID</th><th>名称</th><th>分类</th><th>价格</th><th>库存</th><th>状态</th><th>操作</th></tr>
      ${rows}
    </table></div>`;
  $('#addProduct').onclick = () => openProductForm(null);
  $$('#panel-products [data-act]').forEach(b => {
    const id = +b.dataset.id;
    if (b.dataset.act === 'edit') b.onclick = () => openProductForm(id);
    if (b.dataset.act === 'keys') b.onclick = () => openKeys(id);
    if (b.dataset.act === 'del') b.onclick = () => delProduct(id);
  });
}

async function openProductForm(id) {
  let p = null;
  if (id) { const r = await api('/api/admin/products/' + id); if (r.ok) p = r.data; }
  const catOpts = '<option value="">无分类</option>' + CATS.map(c => `<option value="${c.id}" ${p && p.category_id === c.id ? 'selected' : ''}>${c.name}</option>`).join('');
  const dt = p ? p.delivery_type : 'CARD_AUTO';
  const sm = p ? p.stock_mode : 'FINITE';
  openModal(id ? '编辑商品' : '新增商品', `
    <div class="field"><label>商品名称 *</label><input id="f_name" value="${p ? p.name : ''}"></div>
    <div class="field"><label>分类</label><select id="f_cat">${catOpts}</select></div>
    <div class="field"><label>副标题</label><input id="f_sub" value="${p ? (p.subtitle || '') : ''}"></div>
    <div class="field"><label>价格（${p ? '' : ''}元/美元，自动×100 存储）</label><input id="f_price" type="number" step="0.01" value="${p ? (p.price / 100) : ''}"></div>
    <div class="field"><label>发货方式</label><select id="f_dt">
      <option value="CARD_AUTO" ${dt === 'CARD_AUTO' ? 'selected' : ''}>自动发卡（卡密）</option>
      <option value="FIXED" ${dt === 'FIXED' ? 'selected' : ''}>固定内容</option>
      <option value="MANUAL" ${dt === 'MANUAL' ? 'selected' : ''}>人工发货</option></select></div>
    <div class="field" id="f_fixed_wrap" style="${dt === 'FIXED' ? '' : 'display:none;'}"><label>固定发货内容</label><textarea id="f_fixed">${p ? (p.fixed_content || '') : ''}</textarea></div>
    <div class="field"><label>库存模式</label><select id="f_sm">
      <option value="FINITE" ${sm === 'FINITE' ? 'selected' : ''}>有限</option>
      <option value="UNLIMITED" ${sm === 'UNLIMITED' ? 'selected' : ''}>无限</option></select></div>
    <div class="field"><label>库存数量（有限模式；自动发卡商品导入卡密后自动同步）</label><input id="f_stock" type="number" value="${p ? p.stock : 0}"></div>
    <div style="display:flex;gap:12px;">
      <div class="field" style="flex:1;"><label>最小购买</label><input id="f_min" type="number" value="${p ? p.min_buy : 1}"></div>
      <div class="field" style="flex:1;"><label>最大购买</label><input id="f_max" type="number" value="${p ? p.max_buy : 1}"></div>
      <div class="field" style="flex:1;"><label>排序</label><input id="f_sort" type="number" value="${p ? p.sort : 0}"></div>
    </div>
    <div class="field"><label>状态</label><select id="f_status">
      <option value="1" ${!p || p.status === 1 ? 'selected' : ''}>在售</option>
      <option value="0" ${p && p.status === 0 ? 'selected' : ''}>下架</option></select></div>
    <div class="field"><label>封面图（可选）</label>
      <div style="display:flex;gap:8px;align-items:center;">
        <input id="f_cover" value="${p ? (p.cover_image || '') : ''}" placeholder="粘贴 URL 或点右侧上传">
        <button class="mini-btn" id="f_upload" type="button">上传</button>
      </div>
      <input type="file" id="f_file" accept="image/*" style="display:none;">
    </div>
    <div class="field"><label>购买须知</label><textarea id="f_note">${p ? (p.purchase_note || '') : ''}</textarea></div>
    <div class="field"><label>详情描述</label><textarea id="f_desc">${p ? (p.description || '') : ''}</textarea></div>
    <div style="display:flex;gap:10px;margin-top:10px;">
      <button class="btn btn-primary" id="f_save" style="flex:1;justify-content:center;padding:11px;">保存</button>
      <button class="btn" id="f_cancel" style="flex:1;justify-content:center;padding:11px;">取消</button>
    </div>`, true);
  $('#f_dt').onchange = () => { $('#f_fixed_wrap').style.display = $('#f_dt').value === 'FIXED' ? '' : 'none'; };
  $('#f_upload').onclick = () => $('#f_file').click();
  $('#f_file').onchange = async () => {
    const f = $('#f_file').files[0]; if (!f) return;
    $('#f_upload').textContent = '上传中…';
    const url = await uploadToR2(f, $('#f_cover'));
    $('#f_upload').textContent = '上传';
    if (url) toast('上传成功');
  };
  $('#f_cancel').onclick = closeModal;
  $('#f_save').onclick = async () => {
    const payload = {
      name: $('#f_name').value.trim(),
      category_id: $('#f_cat').value ? +$('#f_cat').value : null,
      subtitle: $('#f_sub').value.trim(),
      price: Math.round(parseFloat($('#f_price').value || 0) * 100),
      delivery_type: $('#f_dt').value,
      fixed_content: $('#f_fixed').value,
      stock_mode: $('#f_sm').value,
      stock: parseInt($('#f_stock').value || 0, 10),
      min_buy: parseInt($('#f_min').value || 1, 10),
      max_buy: parseInt($('#f_max').value || 1, 10),
      sort: parseInt($('#f_sort').value || 0, 10),
      status: $('#f_status').value === '1' ? 1 : 0,
      cover_image: $('#f_cover').value.trim(),
      purchase_note: $('#f_note').value,
      description: $('#f_desc').value,
    };
    if (!payload.name) { toast('请填写商品名称'); return; }
    const r = id ? await api('/api/admin/products/' + id, 'PUT', payload) : await api('/api/admin/products', 'POST', payload);
    if (r.ok) { toast('已保存'); closeModal(); renderProducts(); }
    else toast(r.data.error || '保存失败');
  };
}

async function delProduct(id) {
  if (!confirm('确定删除该商品？关联卡密也会一并删除。')) return;
  const r = await api('/api/admin/products/' + id, 'DELETE');
  if (r.ok) { toast('已删除'); renderProducts(); } else toast(r.data.error || '删除失败');
}

async function openKeys(id) {
  const prod = await api('/api/admin/products/' + id);
  const list = await api('/api/admin/products/' + id + '/keys');
  const items = list.ok ? list.data.items : [];
  const rows = items.length ? items.map(c => `<tr>
    <td style="font-family:monospace;">${c.content}</td>
    <td><span class="badge ${c.status === 0 ? 'badge-green' : c.status === 1 ? 'badge-orange' : 'badge-gray'}">${c.status === 0 ? '未售' : c.status === 1 ? '已售' : '禁用'}</span></td>
    <td><span class="badge badge-gray">${c.batch_no || '-'}</span></td>
    <td><button class="mini-btn danger" data-del="${c.id}">删除</button></td></tr>`).join('')
    : '<tr><td colspan="4" class="empty">还没有卡密</td></tr>';
  openModal('卡密管理 · ' + (prod.ok ? prod.data.name : '#' + id), `
    <div class="field"><label>① 一键生成卡密（tiaomama 风格：前缀 + 自增数字 + 后缀，零外部 key）</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 10px;">
        <input id="g_count" type="number" min="1" value="10" style="width:84px;" placeholder="数量">
        <input id="g_prefix" placeholder="前缀(如 SN-)" style="width:108px;">
        <input id="g_start" type="number" min="0" value="1" style="width:72px;" placeholder="起始">
        <input id="g_digits" type="number" min="1" max="12" value="7" style="width:64px;" placeholder="位数">
        <input id="g_suffix" placeholder="后缀" style="width:84px;">
      </div>
    </div>
    <button class="btn btn-primary" id="g_btn" style="width:100%;justify-content:center;padding:11px;margin-bottom:16px;">⚡ 生成卡密</button>
    <div class="field"><label>② 或批量粘贴导入卡密（每行一条，可粘贴多行）</label>
      <textarea id="k_import" placeholder="KEY-001&#10;KEY-002&#10;KEY-003"></textarea></div>
    <div class="field"><label>批次号（可选，生成/导入共用）</label><input id="k_batch" placeholder="batch-001"></div>
    <button class="btn btn-primary" id="k_import_btn" style="width:100%;justify-content:center;padding:11px;margin-bottom:16px;">导入卡密</button>
    <div class="table-card"><table class="data"><tr><th>卡密</th><th>状态</th><th>批次</th><th>操作</th></tr>${rows}</table></div>`, true);
  $('#g_btn').onclick = async () => {
    const count = parseInt($('#g_count').value || '0', 10);
    if (!count || count < 1) { toast('请填写生成数量'); return; }
    const r = await api('/api/admin/products/' + id + '/generate-keys', 'POST', {
      count, prefix: $('#g_prefix').value.trim(), suffix: $('#g_suffix').value.trim(),
      start: parseInt($('#g_start').value || '1', 10), digits: parseInt($('#g_digits').value || '7', 10),
      batch_no: $('#k_batch').value.trim()
    });
    if (r.ok) { toast('已生成 ' + r.data.generated + ' 张（示例：' + (r.data.sample || []).join('、') + '）'); openKeys(id); renderProducts(); }
    else toast(r.data.error || '生成失败');
  };
  $('#k_import_btn').onclick = async () => {
    const keys = $('#k_import').value;
    if (!keys.trim()) { toast('请输入卡密'); return; }
    const r = await api('/api/admin/products/' + id + '/keys', 'POST', { keys, batch_no: $('#k_batch').value.trim() });
    if (r.ok) { toast('已导入 ' + r.data.imported + ' 张'); openKeys(id); renderProducts(); }
    else toast(r.data.error || '导入失败');
  };
  $$('#modalBody [data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('删除这张卡密？')) return;
    const r = await api('/api/admin/cards/' + b.dataset.del, 'DELETE');
    if (r.ok) { toast('已删除'); openKeys(id); renderProducts(); } else toast('删除失败');
  });
}

// ---------- 订单 ----------
async function renderOrders() {
  const status = $('#orderFilter') ? $('#orderFilter').value : 'all';
  const r = await api('/api/admin/orders?status=' + status);
  if (!r.ok) return;
  const items = r.data.items || [];
  const dtMap = { CARD_AUTO: '卡密', FIXED: '固定内容', MANUAL: '人工' };
  const badgeMap = { PENDING: 'badge-orange', PAID: 'badge-blue', DELIVERED: 'badge-green', CLOSED: 'badge-gray', FAILED: 'badge-red' };
  const rows = items.length ? items.map(o => {
    const badge = badgeMap[o.status] || 'badge-gray';
    const dt = dtMap[o.delivery_type] || '-';
    return `<tr>
      <td class="col-chk"><input type="checkbox" class="ord-chk" data-id="${o.id}"></td>
      <td><b>${o.order_no}</b></td>
      <td>${o.product_name}</td>
      <td>${money(o.amount)}</td>
      <td>×${o.quantity}</td>
      <td><span class="badge ${badge}">${o.status}</span></td>
      <td>${dt}</td>
      <td>${o.contact_value || '-'}</td>
      <td>${new Date(o.created_at * 1000).toLocaleString()}</td>
      <td><button class="mini-btn" data-oid="${o.id}">详情</button></td></tr>`;
  }).join('') : '<tr><td colspan="10" class="empty">暂无订单</td></tr>';
  $('#panel-orders').innerHTML = `
    <div class="toolbar">
      <select id="orderFilter">
        <option value="all">全部</option><option value="PENDING">待支付</option>
        <option value="PAID">已支付</option><option value="DELIVERED">已发货</option>
        <option value="CLOSED">已关闭</option><option value="FAILED">失败</option>
      </select>
      <label class="chk-all"><input type="checkbox" id="orderSelectAll"> 全选</label>
      <button class="mini-btn danger" id="orderBatchDel" disabled>删除选中 (0)</button>
      <div class="grow"></div>
    </div>
    <div class="table-card"><table class="data">
      <tr><th class="col-chk"><input type="checkbox" id="orderSelectAllHead"></th><th>订单号</th><th>商品</th><th>金额</th><th>数量</th><th>状态</th><th>发货方式</th><th>联系</th><th>创建时间</th><th>操作</th></tr>
      ${rows}</table></div>`;
  $('#orderFilter').value = status;
  $('#orderFilter').onchange = renderOrders;
  $$('#panel-orders [data-oid]').forEach(b => b.onclick = () => openOrder(+b.dataset.oid));

  // 选择 / 批量删除逻辑
  const checks = $$('#panel-orders .ord-chk');
  const syncSel = () => {
    const sel = checks.filter(c => c.checked);
    const btn = $('#orderBatchDel');
    btn.disabled = sel.length === 0;
    btn.textContent = '删除选中 (' + sel.length + ')';
    const all = checks.length > 0 && sel.length === checks.length;
    $('#orderSelectAll').checked = all;
    $('#orderSelectAllHead').checked = all;
  };
  checks.forEach(c => c.onchange = syncSel);
  const doSelectAll = (checked) => { checks.forEach(c => c.checked = checked); syncSel(); };
  $('#orderSelectAll').onchange = (e) => doSelectAll(e.target.checked);
  $('#orderSelectAllHead').onchange = (e) => doSelectAll(e.target.checked);
  $('#orderBatchDel').onclick = async () => {
    const sel = checks.filter(c => c.checked).map(c => +c.dataset.id);
    if (!sel.length) return;
    if (!confirm('确定删除选中的 ' + sel.length + ' 个订单？此操作不可恢复。')) return;
    const rr = await api('/api/admin/orders', 'DELETE', { ids: sel });
    if (rr.ok) { toast('已删除 ' + (rr.data.deleted || sel.length) + ' 个订单'); renderOrders(); }
    else toast(rr.data.error || '删除失败');
  };
}

async function openOrder(id) {
  const r = await api('/api/admin/orders/' + id);
  if (!r.ok) { toast('订单不存在'); return; }
  const o = r.data.order;
  const keys = o.delivered_keys || [];
  const keysHtml = keys.length
    ? keys.map(k => `<div class="key-line"><span>${k}</span></div>`).join('')
    : '<div class="empty">尚未发货</div>';
  const canResend = o.status === 'PAID' || o.status === 'PENDING' || o.status === 'FAILED';
  openModal('订单 ' + o.order_no, `
    <div style="font-size:13px;color:var(--color-ink-mid);line-height:2;">
      商品：<b>${o.product_name}</b><br>
      金额：${money(o.amount)} · 数量 ×${o.quantity}<br>
      状态：<span class="badge ${o.status === 'DELIVERED' ? 'badge-green' : o.status === 'PAID' ? 'badge-blue' : o.status === 'PENDING' ? 'badge-orange' : 'badge-gray'}">${o.status}</span><br>
      发货方式：${({ CARD_AUTO: '卡密', FIXED: '固定内容', MANUAL: '人工' })[o.delivery_type] || '-'}<br>
      支付方式：${o.payment_provider || '-'}<br>
      联系：${o.contact_value || '-'}<br>
      创建：${new Date(o.created_at * 1000).toLocaleString()}
    </div>
    <h3 style="margin:16px 0 8px;font-size:14px;">已发卡密</h3>
    <div class="keys-box">${keysHtml}</div>
    ${o.delivery_note ? `<p style="font-size:13px;color:var(--color-accent-warm);">${o.delivery_note}</p>` : ''}
    ${canResend ? `<button class="btn btn-warm" id="resendBtn" style="width:100%;justify-content:center;padding:11px;">手动补发 / 重新发货</button>` : ''}`, true);
  if (canResend) $('#resendBtn').onclick = async () => {
    const rr = await api('/api/admin/orders/' + id + '?action=resend', 'POST');
    if (rr.ok) { toast('补发成功'); openOrder(id); renderOrders(); } else toast(rr.data.error || '补发失败');
  };
}

// ---------- 支付配置（网关） ----------
const GW_TYPES = [
  { v: 'usdt', t: 'USDT (TRC20/ERC20)' },
  { v: 'alipay', t: '支付宝' },
  { v: 'epay', t: '易支付' },
  { v: 'stripe', t: 'Stripe' },
  { v: 'wechat', t: '微信支付' },
];
async function renderGateways() {
  const r = await api('/api/admin/gateways');
  if (!r.ok) return;
  const items = r.data.items || [];
  const rows = items.length ? items.map(g => {
    const extra = safeParse(g.extra);
    let extraTxt = '';
    if (g.type === 'usdt') extraTxt = `链:${extra.chain || 'TRC20'} · 钱包:${extra.wallet ? extra.wallet.slice(0, 8) + '…' : '未填'}`;
    return `<tr>
      <td>#${g.id}</td>
      <td><span class="badge badge-blue">${gwLabel(g.type)}</span> <b>${g.display_name}</b></td>
      <td>${g.gateway_url ? `<a href="${g.gateway_url}" target="_blank" style="color:var(--color-accent-cool);word-break:break-all;">${g.gateway_url}</a>` : '-'}</td>
      <td>${extraTxt || '-'}</td>
      <td><label class="switch"><input type="checkbox" data-toggle="${g.id}" ${g.enabled === 1 ? 'checked' : ''}><span class="slider"></span></label></td>
      <td><div class="row-actions">
        <button class="mini-btn" data-act="edit" data-id="${g.id}">编辑</button>
        <button class="mini-btn danger" data-act="del" data-id="${g.id}">删除</button>
      </div></td></tr>`;
  }).join('')
    : '<tr><td colspan="6" class="empty">还没有支付网关</td></tr>';
  $('#panel-gateways').innerHTML = `
    <div class="toolbar"><div class="grow"></div><button class="btn btn-primary" id="addGw">+ 新增网关</button></div>
    <div class="table-card"><table class="data">
      <tr><th>ID</th><th>名称</th><th>网关地址</th><th>参数</th><th>启用</th><th>操作</th></tr>${rows}</table></div>
    <p style="font-size:12px;color:var(--color-ink-soft);margin-top:12px;">USDT 支持 BEpusdt 网关（填网关地址+密钥后自动创建收款订单）或直接填钱包地址收款。支付宝/易支付/微信按要求填商户信息，暂走演示，后续适配真实下单。</p>`;
  $('#addGw').onclick = () => openGatewayForm(null);
  $$('#panel-gateways [data-act]').forEach(b => {
    const id = +b.dataset.id;
    if (b.dataset.act === 'edit') b.onclick = () => openGatewayForm(id);
    if (b.dataset.act === 'del') b.onclick = async () => {
      if (!confirm('删除该网关？')) return;
      const r2 = await api('/api/admin/gateways/' + id, 'DELETE');
      if (r2.ok) { toast('已删除'); renderGateways(); } else toast('删除失败');
    };
  });
  $$('#panel-gateways [data-toggle]').forEach(c => c.onchange = async () => {
    const id = +c.dataset.toggle;
    const g = (await api('/api/admin/gateways')).data.items.find(x => x.id === id);
    if (!g) return;
    g.enabled = c.checked ? 1 : 0;
    await api('/api/admin/gateways/' + id, 'PUT', g);
    toast(c.checked ? '已启用' : '已禁用');
  });
}
function gwLabel(t) { return (GW_TYPES.find(x => x.v === t) || {}).t || t; }
function safeParse(str) { try { return str ? JSON.parse(str) : {}; } catch { return {}; } }

async function openGatewayForm(id) {
  let g = null; if (id) { const r = await api('/api/admin/gateways'); if (r.ok) g = (r.data.items || []).find(x => x.id === id) || null; }
  const type = g ? g.type : 'usdt';
  const extra = g ? safeParse(g.extra) : {};
  const typeOpts = GW_TYPES.map(x => `<option value="${x.v}" ${type === x.v ? 'selected' : ''}>${x.t}</option>`).join('');
  openModal(id ? '编辑网关' : '新增网关', `
    <div class="field"><label>网关类型 *</label><select id="g_type">${typeOpts}</select></div>
    <div class="field"><label>显示名称 *</label><input id="g_name" value="${g ? g.display_name : ''}" placeholder="如 USDT-TRC20"></div>
    <div class="field"><label>网关地址（BEpusdt/Epay 等，可空）</label><input id="g_url" value="${g ? (g.gateway_url || '') : ''}" placeholder="https://..."></div>
    <div class="field"><label>App ID / 商户号</label><input id="g_appid" value="${g ? (g.app_id || '') : ''}"></div>
    <div class="field"><label>App Secret / API Key</label><input id="g_secret" type="password" value="${g ? (g.app_secret || '') : ''}" placeholder="留空则不修改密钥"></div>
    <div class="field" id="g_usdt_wrap" style="${type === 'usdt' ? '' : 'display:none;'}">
      <label>USDT 参数（JSON）</label>
      <textarea id="g_extra" placeholder='{"chain":"TRC20","currency":"USDT","wallet":"你的钱包地址","rate":1}'>${g ? g.extra : '{"chain":"TRC20","currency":"USDT","wallet":"","rate":1}'}</textarea>
    </div>
    <div style="display:flex;gap:12px;">
      <div class="field" style="flex:1;"><label>排序</label><input id="g_sort" type="number" value="${g ? g.sort : 0}"></div>
      <div class="field" style="flex:1;"><label>启用</label><select id="g_enabled">
        <option value="1" ${!g || g.enabled === 1 ? 'selected' : ''}>启用</option>
        <option value="0" ${g && g.enabled === 0 ? 'selected' : ''}>禁用</option></select></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:10px;">
      <button class="btn btn-primary" id="g_save" style="flex:1;justify-content:center;padding:11px;">保存</button>
      <button class="btn" id="g_cancel" style="flex:1;justify-content:center;padding:11px;">取消</button>
    </div>`, true);
  $('#g_type').onchange = () => { $('#g_usdt_wrap').style.display = $('#g_type').value === 'usdt' ? '' : 'none'; };
  $('#g_cancel').onclick = closeModal;
  $('#g_save').onclick = async () => {
    let extra = $('#g_extra').value.trim();
    if ($('#g_type').value === 'usdt') {
      if (!extra) extra = '{}';
      try { JSON.parse(extra); } catch { toast('USDT 参数不是合法 JSON'); return; }
    } else { extra = '{}'; }
    const payload = {
      type: $('#g_type').value, display_name: $('#g_name').value.trim(),
      gateway_url: $('#g_url').value.trim(), app_id: $('#g_appid').value.trim(),
      app_secret: $('#g_secret').value, extra,
      sort: parseInt($('#g_sort').value || 0, 10), enabled: $('#g_enabled').value === '1' ? 1 : 0,
    };
    if (!payload.display_name) { toast('请填写显示名称'); return; }
    const r = id ? await api('/api/admin/gateways/' + id, 'PUT', payload) : await api('/api/admin/gateways', 'POST', payload);
    if (r.ok) { toast('已保存'); closeModal(); renderGateways(); } else toast(r.data.error || '保存失败');
  };
}

// ---------- 幻灯片（Banner） ----------
const GRAD_PRESETS = [
  { label: '橙蓝', value: 'linear-gradient(135deg,#ff8a5a,#5b8fff)' },
  { label: '蓝绿', value: 'linear-gradient(135deg,#5b8fff,#4dc99a)' },
  { label: '紫棕', value: 'linear-gradient(135deg,#b292ff,#c4b6a8)' },
  { label: '粉紫', value: 'linear-gradient(135deg,#ff7eb3,#8a5bff)' },
  { label: '青蓝', value: 'linear-gradient(135deg,#43cea2,#185a9d)' },
  { label: '日落', value: 'linear-gradient(135deg,#ff9966,#ff5e62)' },
];
function bannerPreviewStyle(b) {
  if (b.mode === 'image' && b.image_url) return `background-image:url('${(b.image_url || '').replace(/'/g, "%27")}');background-size:cover;background-position:center;`;
  const grad = b.gradient || GRAD_PRESETS[0].value;
  const cs = grad.match(/#[a-f0-9]+/gi) || ['#ff8a5a', '#5b8fff'];
  return `background-image:linear-gradient(135deg,${cs[0]},${cs[1] || cs[0]});`;
}
async function renderBanners() {
  const r = await api('/api/admin/banners');
  if (!r.ok) return;
  const items = r.data.items || [];
  const rows = items.length ? items.map(b => `<tr>
    <td>#${b.id}</td>
    <td><div style="width:120px;height:44px;border-radius:8px;${bannerPreviewStyle(b)}"></div></td>
    <td><b>${b.title}</b>${b.tag ? ` <span class="badge badge-blue">${b.tag}</span>` : ''}<br><small style="color:var(--color-ink-soft)">${b.subtitle || ''}</small></td>
    <td>${b.mode === 'image' ? '图片' : '渐变'}</td>
    <td>${b.link_url ? `<a href="${b.link_url}" target="_blank" style="color:var(--color-accent-cool);">有链接</a>` : '-'}</td>
    <td>${b.sort}</td>
    <td><span class="badge ${b.status === 1 ? 'badge-green' : 'badge-gray'}">${b.status === 1 ? '显示' : '隐藏'}</span></td>
    <td><div class="row-actions">
      <button class="mini-btn" data-act="edit" data-id="${b.id}">编辑</button>
      <button class="mini-btn danger" data-act="del" data-id="${b.id}">删除</button>
    </div></td></tr>`).join('')
    : '<tr><td colspan="8" class="empty">还没有幻灯片，点右上角新增</td></tr>';
  $('#panel-banners').innerHTML = `
    <div class="toolbar"><div class="grow"></div><button class="btn btn-primary" id="addBanner">+ 新增幻灯片</button></div>
    <div class="table-card"><table class="data">
      <tr><th>ID</th><th>预览</th><th>标题</th><th>类型</th><th>跳转</th><th>排序</th><th>状态</th><th>操作</th></tr>${rows}</table></div>`;
  $('#addBanner').onclick = () => openBannerForm(null);
  $$('#panel-banners [data-act]').forEach(b => {
    const id = +b.dataset.id;
    if (b.dataset.act === 'edit') b.onclick = () => openBannerForm(id);
    if (b.dataset.act === 'del') b.onclick = async () => {
      if (!confirm('删除该幻灯片？')) return;
      const r2 = await api('/api/admin/banners/' + id, 'DELETE');
      if (r2.ok) { toast('已删除'); renderBanners(); } else toast('删除失败');
    };
  });
}

async function openBannerForm(id) {
  let b = null; if (id) { const r = await api('/api/admin/banners'); if (r.ok) b = (r.data.items || []).find(x => x.id === id) || null; }
  const mode = b ? b.mode : 'gradient';
  const grad = b ? (b.gradient || GRAD_PRESETS[0].value) : GRAD_PRESETS[0].value;
  const gradOpts = GRAD_PRESETS.map(g => `<option value="${g.value}" ${grad === g.value ? 'selected' : ''}>${g.label}</option>`).join('')
    + `<option value="__custom" ${GRAD_PRESETS.every(g => g.value !== grad) ? 'selected' : ''}>自定义…</option>`;
  openModal(id ? '编辑幻灯片' : '新增幻灯片', `
    <div class="field"><label>主标题 *</label><input id="b_title" value="${b ? b.title : ''}"></div>
    <div class="field"><label>角标（如 限时 / 精选，可空）</label><input id="b_tag" value="${b ? (b.tag || '') : ''}"></div>
    <div class="field"><label>描述文案</label><textarea id="b_sub">${b ? (b.subtitle || '') : ''}</textarea></div>
    <div class="field"><label>展示类型</label><select id="b_mode">
      <option value="gradient" ${mode === 'gradient' ? 'selected' : ''}>渐变色块</option>
      <option value="image" ${mode === 'image' ? 'selected' : ''}>图片</option></select></div>
    <div class="field" id="b_grad_wrap" style="${mode === 'gradient' ? '' : 'display:none;'}">
      <label>渐变配色</label>
      <select id="b_grad_sel">${gradOpts}</select>
      <input id="b_grad" style="margin-top:8px;" placeholder="linear-gradient(135deg,#ff8a5a,#5b8fff)" value="${grad}">
    </div>
    <div class="field" id="b_img_wrap" style="${mode === 'image' ? '' : 'display:none;'}">
      <label>图片（URL 或上传）</label>
      <div style="display:flex;gap:8px;align-items:center;">
        <input id="b_img" value="${b ? (b.image_url || '') : ''}" placeholder="https://.../banner.jpg">
        <button class="mini-btn" id="b_upload" type="button">上传</button>
      </div>
      <input type="file" id="b_file" accept="image/*" style="display:none;">
    </div>
    <div class="field"><label>点击跳转链接（可空；http 开头新窗口打开）</label><input id="b_link" value="${b ? (b.link_url || '') : ''}" placeholder="/  或  https://..."></div>
    <div style="display:flex;gap:12px;">
      <div class="field" style="flex:1;"><label>排序（小在前）</label><input id="b_sort" type="number" value="${b ? b.sort : 0}"></div>
      <div class="field" style="flex:1;"><label>状态</label><select id="b_status">
        <option value="1" ${!b || b.status === 1 ? 'selected' : ''}>显示</option>
        <option value="0" ${b && b.status === 0 ? 'selected' : ''}>隐藏</option></select></div>
    </div>
    <div class="field"><label>预览</label><div id="b_preview" style="height:88px;border-radius:12px;display:flex;align-items:flex-end;padding:14px;color:#fff;font-weight:700;text-shadow:0 1px 4px #0006;${bannerPreviewStyle({ mode, gradient: grad, image_url: b ? b.image_url : '' })}">${b ? b.title : '标题预览'}</div></div>
    <div style="display:flex;gap:10px;margin-top:10px;">
      <button class="btn btn-primary" id="b_save" style="flex:1;justify-content:center;padding:11px;">保存</button>
      <button class="btn" id="b_cancel" style="flex:1;justify-content:center;padding:11px;">取消</button>
    </div>`, true);

  const refreshPreview = () => {
    const m = $('#b_mode').value;
    $('#b_preview').style.cssText = `height:88px;border-radius:12px;display:flex;align-items:flex-end;padding:14px;color:#fff;font-weight:700;text-shadow:0 1px 4px #0006;` +
      bannerPreviewStyle({ mode: m, gradient: $('#b_grad').value, image_url: $('#b_img').value });
    $('#b_preview').textContent = $('#b_title').value || '标题预览';
  };
  $('#b_mode').onchange = () => {
    const m = $('#b_mode').value;
    $('#b_grad_wrap').style.display = m === 'gradient' ? '' : 'none';
    $('#b_img_wrap').style.display = m === 'image' ? '' : 'none';
    refreshPreview();
  };
  $('#b_upload').onclick = () => $('#b_file').click();
  $('#b_file').onchange = async () => {
    const f = $('#b_file').files[0]; if (!f) return;
    $('#b_upload').textContent = '上传中…';
    const url = await uploadToR2(f, $('#b_img'));
    $('#b_upload').textContent = '上传';
    if (url) { refreshPreview(); toast('上传成功'); }
  };
  $('#b_grad_sel').onchange = () => { if ($('#b_grad_sel').value !== '__custom') { $('#b_grad').value = $('#b_grad_sel').value; } refreshPreview(); };
  ['b_grad', 'b_img', 'b_title'].forEach(id2 => $('#' + id2).oninput = refreshPreview);
  $('#b_cancel').onclick = closeModal;
  $('#b_save').onclick = async () => {
    const payload = {
      title: $('#b_title').value.trim(), tag: $('#b_tag').value.trim(), subtitle: $('#b_sub').value.trim(),
      mode: $('#b_mode').value, gradient: $('#b_grad').value.trim(), image_url: $('#b_img').value.trim(),
      link_url: $('#b_link').value.trim(), sort: parseInt($('#b_sort').value || 0, 10),
      status: $('#b_status').value === '1' ? 1 : 0,
    };
    if (!payload.title) { toast('请填写主标题'); return; }
    const r = id ? await api('/api/admin/banners/' + id, 'PUT', payload) : await api('/api/admin/banners', 'POST', payload);
    if (r.ok) { toast('已保存'); closeModal(); renderBanners(); } else toast(r.data.error || '保存失败');
  };
}

// ---------- 分类 ----------
async function renderCategories() {
  const r = await api('/api/admin/categories');
  if (!r.ok) return;
  const items = r.data.items || [];
  const rows = items.length ? items.map(c => `<tr>
    <td>#${c.id}</td><td><b>${c.name}</b></td><td><code>${c.slug}</code></td>
    <td>${c.description || '-'}</td>
    <td><span class="badge ${c.status === 1 ? 'badge-green' : 'badge-gray'}">${c.status === 1 ? '显示' : '隐藏'}</span></td>
    <td><div class="row-actions">
      <button class="mini-btn" data-act="edit" data-id="${c.id}">编辑</button>
      <button class="mini-btn danger" data-act="del" data-id="${c.id}">删除</button>
    </div></td></tr>`).join('')
    : '<tr><td colspan="6" class="empty">还没有分类</td></tr>';
  $('#panel-categories').innerHTML = `
    <div class="toolbar"><div class="grow"></div><button class="btn btn-primary" id="addCat">+ 新增分类</button></div>
    <div class="table-card"><table class="data">
      <tr><th>ID</th><th>名称</th><th>标识</th><th>描述</th><th>状态</th><th>操作</th></tr>${rows}</table></div>`;
  $('#addCat').onclick = () => openCatForm(null);
  $$('#panel-categories [data-act]').forEach(b => {
    const id = +b.dataset.id;
    if (b.dataset.act === 'edit') b.onclick = () => openCatForm(id);
    if (b.dataset.act === 'del') b.onclick = async () => {
      if (!confirm('删除该分类？')) return;
      const r2 = await api('/api/admin/categories/' + id, 'DELETE');
      if (r2.ok) { toast('已删除'); renderCategories(); } else toast('删除失败');
    };
  });
}

async function openCatForm(id) {
  let c = null; if (id) { const r = await api('/api/admin/categories/' + id); if (r.ok) c = r.data; }
  openModal(id ? '编辑分类' : '新增分类', `
    <div class="field"><label>名称 *</label><input id="c_name" value="${c ? c.name : ''}"></div>
    <div class="field"><label>英文标识（slug，唯一）*</label><input id="c_slug" value="${c ? c.slug : ''}"></div>
    <div class="field"><label>描述</label><input id="c_desc" value="${c ? (c.description || '') : ''}"></div>
    <div class="field"><label>排序</label><input id="c_sort" type="number" value="${c ? c.sort : 0}"></div>
    <div class="field"><label>状态</label><select id="c_status">
      <option value="1" ${!c || c.status === 1 ? 'selected' : ''}>显示</option>
      <option value="0" ${c && c.status === 0 ? 'selected' : ''}>隐藏</option></select></div>
    <div style="display:flex;gap:10px;margin-top:10px;">
      <button class="btn btn-primary" id="c_save" style="flex:1;justify-content:center;padding:11px;">保存</button>
      <button class="btn" id="c_cancel" style="flex:1;justify-content:center;padding:11px;">取消</button>
    </div>`, true);
  $('#c_cancel').onclick = closeModal;
  $('#c_save').onclick = async () => {
    const payload = { name: $('#c_name').value.trim(), slug: $('#c_slug').value.trim(), description: $('#c_desc').value.trim(), sort: parseInt($('#c_sort').value || 0, 10), status: $('#c_status').value === '1' ? 1 : 0 };
    if (!payload.name || !payload.slug) { toast('请填写名称和标识'); return; }
    const r = id ? await api('/api/admin/categories/' + id, 'PUT', payload) : await api('/api/admin/categories', 'POST', payload);
    if (r.ok) { toast('已保存'); closeModal(); renderCategories(); } else toast(r.data.error || '保存失败');
  };
}

// ---------- 机器批量（AI 运营入口）----------
async function renderMachine() {
  $('#panel-machine').innerHTML = `
    <div class="table-card" style="padding:22px;">
      <p style="color:var(--color-ink-soft);font-size:13px;line-height:1.7;margin-bottom:16px;">
        <b>日常生成/导入卡密不用碰这个面板</b>：在「商品管理」点商品行的「卡密」按钮，里面有「⚡ 生成卡密」和粘贴导入，走后台登录态、<b>零外部 key</b>。<br>
        本面板仅供 <b>AI / 脚本</b> 远程批量运营。调用接口需在请求头带 <code>x-api-key</code>（Cloudflare 后台设置的 <code>AI_API_KEY</code> 变量），与后台账号密码隔离。<br>
        接口：<br>
        • <code>POST /api/machine/products/bulk</code> —— 批量建商品（JSON 数组，含 name/price/category_slug/delivery_type；price 单位为元/美元，自动×100 存分）<br>
        • <code>POST /api/machine/cards/import</code> —— 批量导入卡密，<b>免记数字 ID</b>，用 <code>product_ref="分类slug/商品slug"</code> 或商品名定位：<code>{ "product_ref":"ai/chatgpt-plus", "keys":["k1","k2"] }</code><br>
        • <code>POST /api/machine/products/{id}/keys</code> —— 旧接口，按数字 ID 导入（仍可用）<br>
        • <code>DELETE /api/machine/category/{slug}</code> —— 整类清空（商品+卡密）
      </p>
      <div class="field"><label>API Key (x-api-key)</label><input id="m_key" type="password" placeholder="在 Cloudflare 后台设置的 AI_API_KEY"></div>
      <div class="field"><label>操作</label>
        <select id="m_op">
          <option value="products">批量建商品</option>
          <option value="keys">导入卡密(按分类/商品名)</option>
          <option value="clearcat">整类清空</option>
        </select>
      </div>
      <div class="field" id="m_pid_field" style="display:none;"><label>product_ref（分类slug/商品slug 或商品名，免记数字ID）</label><input id="m_pid" placeholder="如 ai/chatgpt-plus 或 ChatGPT Plus"></div>
      <div class="field" id="m_slug_field"><label>分类 slug（整类清空时填，如 ai）</label><input id="m_slug" placeholder="ai"></div>
      <div class="field"><label>JSON 内容</label>
        <textarea id="m_body" style="min-height:200px;font-family:monospace;" placeholder='批量建商品示例：\n[\n  {"name":"ChatGPT  Plus","price":19.9,"category_slug":"ai","delivery_type":"CARD_AUTO"}\n]'></textarea>
      </div>
      <button class="btn btn-primary" id="m_run" style="width:100%;justify-content:center;padding:11px;margin-top:8px;">执行</button>
      <pre id="m_out" style="margin-top:14px;background:var(--color-surface-soft);border:1px solid var(--color-line);border-radius:8px;padding:12px;font-size:12px;white-space:pre-wrap;max-height:240px;overflow:auto;display:none;"></pre>
    </div>`;

  const op = $('#m_op');
  const syncOp = () => {
    $('#m_pid_field').style.display = op.value === 'keys' ? 'block' : 'none';
    $('#m_slug_field').style.display = op.value === 'clearcat' ? 'block' : 'none';
    $('#m_body').style.display = op.value === 'clearcat' ? 'none' : 'block';
  };
  op.onchange = syncOp; syncOp();

  $('#m_run').onclick = async () => {
    const key = $('#m_key').value.trim(), opv = op.value;
    if (!key) { toast('请填写 API Key'); return; }
    let path, method = 'POST', body = null;
    try {
      if (opv === 'products') { path = '/api/machine/products/bulk'; body = JSON.parse($('#m_body').value); }
      else if (opv === 'keys') {
        const ref = $('#m_pid').value.trim();
        if (!ref) { toast('请填写 product_ref（分类slug/商品slug 或商品名）'); return; }
        path = '/api/machine/cards/import';
        const raw = $('#m_body').value.trim();
        let keys; try { keys = JSON.parse(raw); } catch { keys = { keys: raw }; }
        body = (keys && Array.isArray(keys.keys)) ? { product_ref: ref, keys: keys.keys } : { product_ref: ref, keys: (typeof keys === 'string' ? keys : (keys.keys || raw)) };
      } else { path = '/api/machine/category/' + $('#m_slug').value.trim(); method = 'DELETE'; }
    } catch (e) { toast('JSON 解析失败：' + e.message); return; }
    const out = $('#m_out'); out.style.display = 'block'; out.textContent = '请求中…';
    try {
      const r = await fetch(path, {
        method, headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: body ? JSON.stringify(body) : undefined
      });
      const d = await r.json().catch(() => ({}));
      out.textContent = 'HTTP ' + r.status + '\n' + JSON.stringify(d, null, 2);
      if (r.ok) { toast('执行成功'); if (opv !== 'clearcat') renderMachine(); }
      else toast(d.error || '执行失败');
    } catch (e) { out.textContent = '请求异常：' + e.message; }
  };
}

// ---------- 设置 ----------
async function renderSettings() {
  const r = await api('/api/admin/settings');
  if (!r.ok) return;
  const s = r.data.settings || {};
  $('#panel-settings').innerHTML = `
    <div class="table-card" style="padding:22px;">
      <div class="field"><label>站点名称</label><input id="s_name" value="${s.site_name || ''}"></div>
      <div class="field"><label>副标题</label><input id="s_sub" value="${s.subtitle || ''}"></div>
      <div class="field"><label>公告</label><textarea id="s_notice">${s.notice || ''}</textarea></div>
      <div class="field"><label>客服联系方式</label><input id="s_contact" value="${s.support_contact || ''}"></div>
      <div class="field"><label>页脚文字</label><input id="s_footer" value="${s.footer_text || ''}"></div>
      <div class="field"><label>下单页提示</label><textarea id="s_order">${s.order_notice || ''}</textarea></div>
      <div class="field"><label>货币（usd/cny）</label><select id="s_currency">
        <option value="usd" ${s.currency === 'usd' ? 'selected' : ''}>美元 USD ($)</option>
        <option value="cny" ${s.currency === 'cny' ? 'selected' : ''}>人民币 CNY (¥)</option></select></div>
      <button class="btn btn-primary" id="s_save" style="width:100%;justify-content:center;padding:11px;margin-top:8px;">保存设置</button>
      <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--color-line);">
        <h3 style="font-size:14px;margin-bottom:10px;">🔔 飞书通知（新订单支付成功时推送）</h3>
        <div class="field"><label>飞书机器人 Webhook</label><input id="s_feishu_url" value="${s.feishu_webhook || ''}" placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/xxxx"></div>
        <div class="field"><label>签名密钥 Secret（可选，机器人开启加签时填）</label><input id="s_feishu_secret" type="password" value="${s.feishu_secret || ''}" placeholder="飞书机器人安全设置里的签名密钥"></div>
        <button class="btn" id="s_feishu_test" style="width:100%;justify-content:center;padding:11px;margin-top:4px;">发送测试消息</button>
        <p style="font-size:12px;color:var(--color-ink-soft);margin-top:10px;">在飞书群添加「自定义机器人」后复制 Webhook 地址填入；若机器人开启了「签名校验」，需一并填 Secret。填好后直接点「发送测试消息」即可（会自动保存，无需先点顶部「保存」）；验证通过后再填其它设置、点顶部「保存」。每笔支付成功的订单都会推送到该群。</p>
      </div>
      <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--color-line);">
        <h3 style="font-size:14px;margin-bottom:10px;">修改管理员密码</h3>
        <div class="field"><label>当前密码</label><input id="s_pwd_old" type="password" placeholder="请输入当前密码"></div>
        <div class="field"><label>新密码</label><input id="s_pwd" type="password" placeholder="至少 6 位"></div>
        <button class="btn" id="s_pwd_btn" style="width:100%;justify-content:center;padding:11px;">更新密码</button>
      </div>
    </div>`;
  $('#s_save').onclick = async () => {
    const payload = { site_name: $('#s_name').value, subtitle: $('#s_sub').value, notice: $('#s_notice').value, support_contact: $('#s_contact').value, footer_text: $('#s_footer').value, order_notice: $('#s_order').value, currency: $('#s_currency').value, feishu_webhook: $('#s_feishu_url').value.trim(), feishu_secret: $('#s_feishu_secret').value };
    const r2 = await api('/api/admin/settings', 'PUT', payload);
    if (r2.ok) toast('设置已保存'); else toast(r2.data.error || '保存失败');
  };
  $('#s_feishu_test').onclick = async () => {
    const webhook = ($('#s_feishu_url').value || '').trim();
    const secret = $('#s_feishu_secret').value || '';
    if (!webhook) { toast('请先填写飞书机器人 Webhook'); return; }
    const r2 = await api('/api/admin/feishu/test', 'POST', { webhook, secret });
    if (r2.ok) { toast('测试消息已发送，请到飞书群查看'); return; }
    // 后端已把飞书真实错误码/原因写进 d.error，直接显示
    toast((r2.data && r2.data.error) || '发送失败');
  };
  $('#s_pwd_btn').onclick = async () => {
    const old = $('#s_pwd_old').value;
    const pwd = $('#s_pwd').value;
    if (!old) { toast('请输入当前密码'); return; }
    if (!pwd) { toast('请输入新密码（至少 6 位）'); return; }
    const r2 = await api('/api/admin/password', 'PUT', { old_password: old, password: pwd });
    if (r2.ok) { toast('密码已更新，请用新密码重新登录'); $('#s_pwd_old').value = ''; $('#s_pwd').value = ''; } else toast(r2.data.error || '更新失败');
  };
}

// ---------- 启动 ----------
(async function init() {
  if (TOKEN) {
    const me = await api('/api/admin/me');
    if (me.ok) { $('#adminUser').textContent = '你好，' + (me.data.admin.nickname || me.data.admin.username); await afterLogin(); return; }
  }
  showLogin();
})();
