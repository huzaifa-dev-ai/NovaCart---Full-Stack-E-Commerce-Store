/* End-to-end tests against the live NovaCart auth API. */

const { ORIGIN } = require("./origin");
const BASE = ORIGIN + "/api/auth";
let pass = 0, fail = 0;

function check(label, condition, detail) {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? "  -> " + detail : ""}`); }
}

async function call(path, options = {}) {
  const res = await fetch(BASE + path, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json, cookie: res.headers.get("set-cookie") };
}

function section(title) { console.log("\n" + title); }

(async () => {
  const unique = `test${Date.now()}@example.com`;

  /* ---------- 1. Registration validation ---------- */
  section("1. REGISTRATION — validation");

  let r = await call("/register", { method: "POST", body: {} });
  check("empty body -> 422", r.status === 422, `got ${r.status}`);
  check("  reports every missing field", (r.json.errors || []).length >= 3,
        JSON.stringify(r.json.errors));

  r = await call("/register", { method: "POST", body: { name: "A", email: "nope", password: "short" } });
  check("bad name/email/password -> 422", r.status === 422, `got ${r.status}`);
  const fields = (r.json.errors || []).map(e => e.field);
  check("  flags name, email and password", ["name","email","password"].every(f => fields.includes(f)),
        fields.join(","));

  r = await call("/register", { method: "POST", body: { name: "Test User", email: unique, password: "alllettersonly" } });
  check("password with no number -> 422", r.status === 422, `got ${r.status}`);

  /* ---------- 2. Successful registration ---------- */
  section("2. REGISTRATION — success + role assignment");

  r = await call("/register", { method: "POST", body: { name: "Test Customer", email: unique, password: "Passw0rd123" } });
  check("valid signup -> 201", r.status === 201, `got ${r.status} ${JSON.stringify(r.json)}`);
  check("  role defaults to customer", r.json.user && r.json.user.role === "customer", r.json.user && r.json.user.role);
  check("  password NOT returned", r.json.user && r.json.user.password === undefined);
  check("  sets httpOnly session cookie", !!r.cookie && /HttpOnly/i.test(r.cookie), r.cookie);
  check("  cookie is SameSite protected", !!r.cookie && /SameSite/i.test(r.cookie));

  /* ---------- 3. Duplicate email ---------- */
  section("3. REGISTRATION — duplicate email");

  r = await call("/register", { method: "POST", body: { name: "Someone Else", email: unique, password: "Passw0rd123" } });
  check("duplicate -> 409", r.status === 409, `got ${r.status}`);
  check("  clear message", /already exists/i.test(r.json.error || ""), r.json.error);
  check("  code EMAIL_TAKEN", r.json.code === "EMAIL_TAKEN", r.json.code);

  r = await call("/register", { method: "POST", body: { name: "Case Test", email: unique.toUpperCase(), password: "Passw0rd123" } });
  check("duplicate ignoring case -> 409", r.status === 409, `got ${r.status}`);

  /* ---------- 4. Privilege escalation ---------- */
  section("4. SECURITY — role cannot be self-assigned");

  const sneaky = `sneaky${Date.now()}@example.com`;
  r = await call("/register", { method: "POST", body: { name: "Sneaky User", email: sneaky, password: "Passw0rd123", role: "admin" } });
  check('posting {"role":"admin"} -> still customer', r.json.user && r.json.user.role === "customer",
        r.json.user && r.json.user.role);

  /* ---------- 5. Login ---------- */
  section("5. LOGIN");

  r = await call("/login", { method: "POST", body: { email: unique, password: "WrongPassword1" } });
  check("wrong password -> 401", r.status === 401, `got ${r.status}`);
  check("  generic message (no user enumeration)", /email or password is incorrect/i.test(r.json.error || ""), r.json.error);

  r = await call("/login", { method: "POST", body: { email: "ghost@nowhere.com", password: "Whatever123" } });
  check("unknown email -> 401", r.status === 401, `got ${r.status}`);
  check("  identical message to wrong password", /email or password is incorrect/i.test(r.json.error || ""), r.json.error);

  r = await call("/login", { method: "POST", body: { email: unique, password: "Passw0rd123" } });
  check("correct credentials -> 200", r.status === 200, `got ${r.status} ${JSON.stringify(r.json)}`);
  check("  returns the user", r.json.user && r.json.user.email === unique);
  check("  issues session cookie", !!r.cookie && /novacart_token/.test(r.cookie));
  const customerCookie = r.cookie ? r.cookie.split(";")[0] : "";

  /* ---------- 6. Admin ---------- */
  section("6. ADMIN account");

  // Credentials come from .env so the test never goes stale when they change.
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  const ADMIN_PW = process.env.ADMIN_PASSWORD;
  if (!ADMIN_EMAIL || !ADMIN_PW) {
    console.log("  SKIP  admin tests — run with:  node -r dotenv/config <this file>");
  }

  r = await call("/login", { method: "POST", body: { email: ADMIN_EMAIL, password: ADMIN_PW } });
  check("admin signs in -> 200", r.status === 200, `got ${r.status} ${JSON.stringify(r.json)}`);
  check("  role is admin", r.json.user && r.json.user.role === "admin", r.json.user && r.json.user.role);
  check("  name correct", r.json.user && r.json.user.name === "Huzaifa Mushtaq", r.json.user && r.json.user.name);
  const adminCookie = r.cookie ? r.cookie.split(";")[0] : "";

  r = await call("/login", { method: "POST", body: { email: ADMIN_EMAIL, password: ADMIN_PW.toLowerCase() + "x" } });
  check("admin wrong password rejected -> 401", r.status === 401, `got ${r.status}`);

  /* ---------- 7. Session ---------- */
  section("7. SESSION — /me");

  r = await call("/me");
  check("no cookie -> 401", r.status === 401, `got ${r.status}`);
  check("  code NO_SESSION", r.json.code === "NO_SESSION", r.json.code);

  r = await call("/me", { headers: { Cookie: customerCookie } });
  check("customer cookie -> 200", r.status === 200, `got ${r.status}`);
  check("  role customer", r.json.user && r.json.user.role === "customer");

  r = await call("/me", { headers: { Cookie: adminCookie } });
  check("admin cookie -> 200 with admin role", r.status === 200 && r.json.user.role === "admin");

  r = await call("/me", { headers: { Cookie: "novacart_token=forged.token.value" } });
  check("forged token -> 401", r.status === 401, `got ${r.status}`);
  check("  code TOKEN_INVALID", r.json.code === "TOKEN_INVALID", r.json.code);

  /* ---------- 8. Logout ---------- */
  section("8. LOGOUT");

  const res = await fetch(BASE + "/logout", { method: "POST", headers: { Cookie: customerCookie } });
  const setCookie = res.headers.get("set-cookie") || "";
  check("logout -> 200", res.status === 200, `got ${res.status}`);
  check("  clears the cookie", /novacart_token=;|Expires=Thu, 01 Jan 1970/i.test(setCookie), setCookie);

  /* ---------- 9. Malformed input ---------- */
  section("9. ERROR HANDLING");

  const bad = await fetch(BASE + "/login", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json"
  });
  const badJson = await bad.json().catch(() => ({}));
  check("malformed JSON -> 400", bad.status === 400, `got ${bad.status}`);
  check("  code BAD_JSON", badJson.code === "BAD_JSON", badJson.code);

  r = await call("/register", { method: "POST", body: { name: "X".repeat(200), email: unique, password: "Passw0rd123" } });
  check("over-long name -> 422", r.status === 422, `got ${r.status}`);

  console.log(`\n${"=".repeat(46)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(46)}`);
  process.exit(fail ? 1 : 0);
})();
