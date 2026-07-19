#!/usr/bin/env python3
# 轻量 mock：提供 public/ 静态文件 + 假 /api/config、/api/products/{id}、/api/checkout
import http.server, socketserver, json, re, os

ROOT = os.path.join(os.path.dirname(__file__), "..", "public")
PORT = 8090

PRODUCT = {
    "id": 1,
    "name": "AI 文案生成器 Pro",
    "subtitle": "一键生成高质量营销文案",
    "description": "这是商品详情描述。支付后自动发卡，卡密秒到。",
    "price": 19900,
    "category_slug": "ai",
    "category_name": "AI 前沿",
    "delivery_type": "CARD_AUTO",
    "stock_mode": "UNLIMITED",
    "min_buy": 1,
    "max_buy": 5,
    "cover_image": None,
    "purchase_note": "下单后请在订单页查收卡密。",
}

CONFIG = {
    "site": {"site_name": "SutaShopX 商城", "currency": "usd", "footer_text": "© 2026 SutaShopX", "support_contact": "微信 shidai616", "notice": "欢迎光临"},
    "categories": [{"slug": "ai", "name": "AI 前沿"}, {"slug": "tools", "name": "工具软件"}],
    "banners": [],
    "gateways": [
        {"id": "usdt", "display_name": "USDT 加密货币"},
        {"id": "epay", "display_name": "微信/支付宝"},
    ],
}

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=os.path.abspath(ROOT), **kw)

    def do_GET(self):
        if self.path.startswith("/api/config"):
            return self.json(CONFIG)
        if self.path.startswith("/api/products/"):
            m = re.match(r"^/api/products/(\d+)", self.path)
            if m:
                return self.json({"product": PRODUCT})
            return self.json({"product": PRODUCT})
        if self.path.startswith("/api/products"):
            # 列表（可能带 ?cat=&page=&q= 查询参数）
            return self.json({
                "items": [PRODUCT],
                "page": 1,
                "totalPages": 1,
                "total": 1,
            })
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/checkout":
            length = int(self.headers.get("content-length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
            return self.json({"ok": True, "payUrl": "https://example.com/pay/mock?order=" + str(body.get("productId"))})
        self.send_error(404)

    def json(self, obj):
        data = json.dumps(obj).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass

with socketserver.TCPServer(("127.0.0.1", PORT), H) as httpd:
    print(f"mock server on http://127.0.0.1:{PORT}")
    httpd.serve_forever()
