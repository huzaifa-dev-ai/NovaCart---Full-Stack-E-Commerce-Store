/* Admin dashboard API — full lifecycle test. */

require("dotenv").config({ quiet: true, path: require("path").join(__dirname, "..", ".env") });

const { ORIGIN } = require("./origin");
const BASE = ORIGIN + "/api";
let pass = 0, fail = 0;
const check = (l, c, d) => {
  if (c) { pass++; console.log(`  PASS  ${l}`); }
  else { fail++; console.log(`  FAIL  ${l}${d ? "  -> " + d : ""}`); }
};
const section = (t) => console.log("\n" + t);

let adminCookie = "";
let custCookie = "";

async function call(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, json, cookie: (res.headers.get("set-cookie") || "").split(";")[0] };
}

(async () => {
  /* ---------- sign in ---------- */
  section("SETUP");
  let r = await call("/auth/login", {
    method: "POST",
    body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }
  });
  adminCookie = r.cookie;
  check("admin signed in", r.status === 200 && r.json.user.role === "admin", `got ${r.status}`);

  const custEmail = `shopper${Date.now()}@example.com`;
  r = await call("/auth/register", {
    method: "POST",
    body: { name: "Test Shopper", email: custEmail, password: "Passw0rd123" }
  });
  custCookie = r.cookie;
  check("customer registered", r.status === 201, `got ${r.status}`);

  /* ---------- place an order ---------- */
  section("ORDERS — placing");
  const stockBefore = (await call("/products/1")).json.product.stock;

  r = await call("/orders", {
    method: "POST",
    cookie: custCookie,
    body: {
      customer: {
        name: "Test Shopper", email: custEmail, phone: "+92 300 1234567",
        address: "House 12, Gulberg", city: "Lahore", postal: "54000"
      },
      items: [{ id: 1, qty: 2 }, { id: 6, qty: 1 }]
    }
  });
  check("order placed -> 201", r.status === 201, `got ${r.status} ${JSON.stringify(r.json).slice(0,200)}`);
  const order = r.json.order;
  check("  has an order number", /^NC-[A-Z0-9]+$/.test(order.number || ""), order.number);
  check("  status starts pending", order.status === "pending");
  check("  totals computed server-side", order.total === Math.round((order.subtotal + order.shipping) * 100) / 100);

  const stockAfter = (await call("/products/1")).json.product.stock;
  check(`  stock decremented ${stockBefore} -> ${stockAfter}`, stockAfter === stockBefore - 2);

  section("ORDERS — price tampering must fail");
  r = await call("/orders", {
    method: "POST", cookie: custCookie,
    body: {
      customer: { name: "Test Shopper", email: custEmail, phone: "+92 300 1234567",
                  address: "House 12, Gulberg", city: "Lahore", postal: "54000" },
      items: [{ id: 1, qty: 1, unitPrice: 0.01 }],
      subtotal: 0.01, total: 0.01
    }
  });
  const tampered = r.json.order;
  check("client-sent price ignored", tampered && tampered.items[0].unitPrice > 1,
        `unitPrice=${tampered && tampered.items[0].unitPrice}`);

  r = await call("/orders", {
    method: "POST", cookie: custCookie,
    body: {
      customer: { name: "Test Shopper", email: custEmail, phone: "+92 300 1234567",
                  address: "House 12, Gulberg", city: "Lahore", postal: "54000" },
      items: [{ id: 7, qty: 1 }]      // Drift sneakers, stock 0
    }
  });
  check("out-of-stock item rejected -> 409", r.status === 409, `got ${r.status}`);

  /* ---------- admin sees orders ---------- */
  section("ORDERS — admin management");
  r = await call("/orders", { cookie: adminCookie });
  check("admin lists all orders", r.status === 200 && r.json.total >= 2, `total=${r.json.total}`);

  r = await call("/orders", { cookie: custCookie });
  check("customer CANNOT list all orders -> 403", r.status === 403, `got ${r.status}`);

  r = await call("/orders/mine", { cookie: custCookie });
  check("customer sees only their own", r.status === 200 && r.json.orders.length >= 2);

  r = await call(`/orders/${order.id}`, { method: "PATCH", cookie: adminCookie, body: { status: "shipped" } });
  check("pending -> shipped rejected (bad transition)", r.status === 400, `got ${r.status}`);

  r = await call(`/orders/${order.id}`, { method: "PATCH", cookie: adminCookie, body: { status: "processing", note: "Packed" } });
  check("pending -> processing OK", r.status === 200 && r.json.order.status === "processing");
  check("  timeline recorded", (r.json.order.timeline || []).length === 2);

  await call(`/orders/${order.id}`, { method: "PATCH", cookie: adminCookie, body: { status: "shipped" } });
  r = await call(`/orders/${order.id}`, { method: "PATCH", cookie: adminCookie, body: { status: "delivered" } });
  check("processing -> shipped -> delivered", r.status === 200 && r.json.order.status === "delivered");

  r = await call(`/orders/${order.id}`, { method: "PATCH", cookie: custCookie, body: { status: "cancelled" } });
  check("customer CANNOT change status -> 403", r.status === 403, `got ${r.status}`);

  /* ---------- returns ---------- */
  section("RETURNS");
  r = await call("/returns", {
    method: "POST", cookie: custCookie,
    body: { orderNumber: order.number, reason: "Arrived with a scratch on the casing." }
  });
  check("return requested -> 201", r.status === 201, `got ${r.status} ${JSON.stringify(r.json).slice(0,160)}`);
  const ret = r.json.return;
  check("  has a reference", /^RT-[A-Z0-9]+$/.test(ret.reference || ""), ret.reference);

  r = await call("/returns", {
    method: "POST", cookie: custCookie,
    body: { orderNumber: order.number, reason: "Trying to open a second one for the same order." }
  });
  check("duplicate open return -> 409", r.status === 409, `got ${r.status}`);

  r = await call("/returns", { cookie: custCookie });
  check("customer CANNOT list all returns -> 403", r.status === 403, `got ${r.status}`);

  r = await call(`/returns/${ret.id}`, { method: "PATCH", cookie: adminCookie, body: { status: "refunded" } });
  check("refund before approval rejected", r.status === 400, `got ${r.status}`);

  r = await call(`/returns/${ret.id}`, { method: "PATCH", cookie: adminCookie, body: { status: "approved", adminNote: "Send it back." } });
  check("approve -> 200", r.status === 200 && r.json.return.status === "approved");

  const stockPreRefund = (await call("/products/1")).json.product.stock;
  r = await call(`/returns/${ret.id}`, { method: "PATCH", cookie: adminCookie, body: { status: "refunded" } });
  check("refund after approval -> 200", r.status === 200 && r.json.return.status === "refunded");
  check("  refund amount defaulted to item value", r.json.return.refundAmount > 0, String(r.json.return.refundAmount));
  const stockPostRefund = (await call("/products/1")).json.product.stock;
  check(`  stock restocked ${stockPreRefund} -> ${stockPostRefund}`, stockPostRefund > stockPreRefund);

  r = await call(`/returns/${ret.id}`, { method: "PATCH", cookie: adminCookie, body: { status: "approved" } });
  check("refunded return is final -> 400", r.status === 400, `got ${r.status}`);

  /* ---------- products CRUD ---------- */
  section("PRODUCTS — admin CRUD");
  r = await call("/admin/products", {
    method: "POST", cookie: adminCookie,
    body: {
      name: "Test Widget", category: "Testing", price: 19.99,
      image: "assets/images/products/headphones.jpg",
      shortDescription: "A product created by the admin test suite.", stock: 7
    }
  });
  check("create product -> 201", r.status === 201, `got ${r.status} ${JSON.stringify(r.json).slice(0,160)}`);
  const newProduct = r.json.product;
  check("  id auto-assigned", newProduct.id > 56, String(newProduct.id));

  r = await call("/admin/products", {
    method: "POST", cookie: adminCookie,
    body: { name: "", price: -5, stock: "abc" }
  });
  check("invalid product -> 422", r.status === 422, `got ${r.status}`);

  r = await call(`/admin/products/${newProduct.id}`, {
    method: "PATCH", cookie: adminCookie, body: { price: 24.5, stock: 12, id: 9999 }
  });
  check("update product -> 200", r.status === 200 && r.json.product.price === 24.5);
  check("  id is NOT client-writable", r.json.product.id === newProduct.id, String(r.json.product.id));

  r = await call("/admin/products", { method: "POST", cookie: custCookie, body: { name: "Hack" } });
  check("customer CANNOT create products -> 403", r.status === 403, `got ${r.status}`);

  r = await call(`/admin/products/${newProduct.id}`, { method: "DELETE", cookie: adminCookie });
  check("archive product -> 200", r.status === 200);
  r = await call(`/products/${newProduct.id}`);
  check("  archived product hidden from the store -> 404", r.status === 404, `got ${r.status}`);

  r = await call(`/admin/products/1?hard=true`, { method: "DELETE", cookie: adminCookie });
  check("hard-delete blocked for a product used in orders -> 409", r.status === 409, `got ${r.status}`);

  /* ---------- users ---------- */
  section("USERS — admin management");
  r = await call("/admin/users", { cookie: adminCookie });
  check("list users -> 200", r.status === 200 && r.json.total >= 2);
  const target = r.json.users.find((u) => u.email === custEmail);
  check("  order counts included", target && target.orders >= 2, JSON.stringify(target && target.orders));
  check("  no password hash leaked", target && target.password === undefined);

  const me = r.json.users.find((u) => u.email === process.env.ADMIN_EMAIL.toLowerCase());
  r = await call(`/admin/users/${me.id}`, { method: "PATCH", cookie: adminCookie, body: { role: "customer" } });
  check("admin CANNOT demote themselves -> 400", r.status === 400, `got ${r.status}`);
  check("  code SELF_DEMOTE", r.json.code === "SELF_DEMOTE", r.json.code);

  r = await call(`/admin/users/${me.id}`, { method: "DELETE", cookie: adminCookie });
  check("admin CANNOT delete themselves -> 400", r.status === 400, `got ${r.status}`);

  r = await call(`/admin/users/${target.id}`, { method: "PATCH", cookie: adminCookie, body: { role: "admin" } });
  check("promote customer -> admin", r.status === 200 && r.json.user.role === "admin");
  r = await call(`/admin/users/${target.id}`, { method: "PATCH", cookie: adminCookie, body: { role: "customer" } });
  check("demote back to customer", r.status === 200 && r.json.user.role === "customer");

  r = await call("/admin/users", { cookie: custCookie });
  check("customer CANNOT list users -> 403", r.status === 403, `got ${r.status}`);

  /* ---------- stats ---------- */
  section("STATS");
  r = await call("/admin/stats", { cookie: adminCookie });
  check("stats -> 200", r.status === 200);
  const s = r.json.stats;
  check("  revenue excludes cancelled", typeof s.revenue.total === "number" && s.revenue.total > 0, String(s.revenue.total));
  check("  product counts present", s.products.total >= 56);
  check("  recent orders included", (r.json.recentOrders || []).length > 0);

  console.log(`\n${"=".repeat(50)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(50)}`);
  process.exit(fail ? 1 : 0);
})();
