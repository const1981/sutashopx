// ============================================================
//  BU31 商城 · 支付成功 / 订单结果页
// ============================================================
function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}
const params = new URLSearchParams(location.search);
const orderNo = params.get('order');
const token = params.get('token') || '';
const isDemo = params.get('demo') === '1';
const isCancel = params.get('cancel') === '1';
const isCrypto = params.get('crypto') === '1';

function setStatus(icon, title, desc) {
  document.getElementById('statusIcon').innerHTML = icon;
  document.getElementById('statusTitle').textContent = title;
  document.getElementById('statusDesc').textContent = desc;
}
const checkIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>';
const waitIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10" /><path d="M12 6v6l4 2"/></svg>';
const xIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>';

function renderResult(data) {
  const o = data.order;
  document.getElementById('demoPay').classList.add('hidden');
  document.getElementById('resultCard').classList.remove('hidden');
  document.getElementById('prodName').textContent = o.product_name;
  document.getElementById('orderMeta').textContent = `订单号 ${o.order_no} · 数量 ${o.quantity} · 状态 ${o.status === 'DELIVERED' ? '已发货' : o.status === 'PAID' ? '已支付' : o.status}`;
  const keys = data.keys || [];
  const keysArea = document.getElementById('keysArea');
  const isCard = (o.delivery_type || 'CARD_AUTO') === 'CARD_AUTO';
  const noun = isCard ? '卡密' : '付费内容';
  if (keys.length) {
    keysArea.innerHTML = `<div style="font-weight:600;margin-bottom:8px;">您的${noun}：</div>` +
      keys.map(k => `<div class="key-line"><span>${k}</span><button class="copy-btn" data-k="${k}">复制</button></div>`).join('');
    keysArea.querySelectorAll('.copy-btn').forEach(b => b.onclick = () => {
      navigator.clipboard.writeText(b.dataset.k); toast('已复制');
    });
    const copyAllBtn = document.getElementById('copyAll');
    copyAllBtn.textContent = '复制全部' + noun;
    copyAllBtn.onclick = () => { navigator.clipboard.writeText(keys.join('\n')); toast('已复制全部'); };
    setStatus(checkIcon, '商品已发放', `请妥善保管下方${noun}，离开本页后将无法再次查看`);
  } else {
    keysArea.innerHTML = '<div style="color:var(--color-ink-soft);">本次为人工发货 / 固定内容商品，请留意站内说明或联系客服。</div>';
    setStatus(checkIcon, '支付成功', '正在为你处理发货');
  }
  const note = document.getElementById('noteArea');
  note.textContent = o.delivery_note || '';
}

if (!orderNo) {
  setStatus(xIcon, '缺少订单信息', '请从支付回链进入本页');
} else if (isCancel) {
  setStatus(xIcon, '支付已取消', '你未完成支付，可返回商品页重新下单');
} else if (isDemo) {
  // 演示支付：先尝试直接查（可能已支付），否则展示模拟按钮
  fetch(`/api/orders/${orderNo}?token=${token}`).then(r => r.json()).then(d => {
    if (d.order && (d.order.status === 'PAID' || d.order.status === 'DELIVERED')) {
      renderResult(d);
    } else {
      setStatus(waitIcon, '待支付确认', '点击下方按钮模拟支付完成');
      document.getElementById('demoPay').classList.remove('hidden');
      document.getElementById('demoBtn').onclick = async () => {
        document.getElementById('demoBtn').disabled = true; document.getElementById('demoBtn').textContent = '处理中…';
        const r = await fetch('/api/pay/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderNo }) });
        const d2 = await r.json();
        if (r.ok) { renderResult({ order: { order_no: orderNo, product_name: '', quantity: 1, status: d2.status, delivery_type: d2.delivery_type }, keys: d2.keys, note: d2.note }); }
        else { toast(d2.error || '失败'); document.getElementById('demoBtn').disabled = false; document.getElementById('demoBtn').textContent = '模拟支付成功'; }
      };
    }
  }).catch(() => { setStatus(xIcon, '查询失败', '网络错误'); });
} else if (isCrypto) {
  // USDT 收款页：展示地址+金额，支持手动确认 + 轮询
  setStatus(waitIcon, '等待支付', '请向以下地址转账对应金额');
  document.getElementById('cryptoPay').classList.remove('hidden');
  fetch(`/api/pay/usdt/info?order=${orderNo}`).then(r => r.json()).then(d => {
    if (d.paid) { return poll(); }
    const c = d.crypto || {};
    document.getElementById('cryptoAmount').textContent = (c.amount || '') + ' ' + (c.currency || 'USDT');
    document.getElementById('cryptoChain').textContent = c.chain || 'TRC20';
    document.getElementById('cryptoCur').textContent = c.currency || 'USDT';
    document.getElementById('cryptoAddr').textContent = c.address || '未配置钱包地址';
    const qr = document.getElementById('cryptoQr');
    if (c.qr) {
      // BEpusdt 返回的是图片地址或 dataURL
      qr.innerHTML = `<img src="${c.qr}" alt="收款二维码" style="width:160px;height:160px;border-radius:10px;background:#fff;padding:8px;">`;
    } else { qr.innerHTML = ''; }
  }).catch(() => {});
  document.getElementById('copyAddr').onclick = () => {
    const a = document.getElementById('cryptoAddr').textContent;
    if (a && a !== '未配置钱包地址') { navigator.clipboard.writeText(a); toast('已复制地址'); }
  };
  document.getElementById('paidBtn').onclick = async () => {
    document.getElementById('paidBtn').disabled = true; document.getElementById('paidBtn').textContent = '确认中…';
    const r = await fetch('/api/pay/usdt/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderNo, token }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.status && d.status !== 'PENDING') { poll(); }
    else { document.getElementById('paidBtn').disabled = false; document.getElementById('paidBtn').textContent = '我已支付'; toast(d.error || '确认失败，若已转账请稍候系统自动到账'); }
  };
  function poll() {
    let tries = 0;
    const tick = async () => {
      try {
        const r = await fetch(`/api/orders/${orderNo}?token=${token}`);
        const d = await r.json();
        if (d.order && (d.order.status === 'PAID' || d.order.status === 'DELIVERED')) {
          document.getElementById('cryptoPay').classList.add('hidden');
          renderResult(d); return;
        }
      } catch (e) {}
      if (tries++ < 40) setTimeout(tick, 3000);
      else setStatus(xIcon, '暂未确认', '如已支付但未显示卡密，请稍后刷新或联系客服');
    };
    tick();
  }
} else {
  // Stripe 等真实支付：轮询等待 webhook 标记已付
  setStatus(waitIcon, '支付确认中…', '正在等待支付网关回调，请稍候');
  let tries = 0;
  const poll = async () => {
    try {
      const r = await fetch(`/api/orders/${orderNo}?token=${token}`);
      const d = await r.json();
      if (d.order && (d.order.status === 'PAID' || d.order.status === 'DELIVERED')) { renderResult(d); return; }
    } catch (e) {}
    if (tries++ < 20) setTimeout(poll, 3000);
    else setStatus(xIcon, '暂未确认', '如已支付但未显示卡密，请稍后刷新或联系客服');
  };
  poll();
}
