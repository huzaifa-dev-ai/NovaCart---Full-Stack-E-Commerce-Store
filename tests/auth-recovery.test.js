/* Tests for the five additions: remember-me, forgot, reset, change password, headers. */

const BASE = "http://localhost:5000/api/auth";
let pass = 0, fail = 0;

const check = (label, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? "  -> " + detail : ""}`); }
};

async function call(path, options = {}) {
  const res = await fetch(BASE + path, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, json, cookie: res.headers.get("set-cookie") || "" };
}

const section = (t) => console.log("\n" + t);

(async () => {
  const email = `flow${Date.now()}@example.com`;
  const PW1 = "Passw0rd123";
  const PW2 = "Brandnew456";
  const PW3 = "Thirdpass789";

  /* ---------- remember me ---------- */
  section("1. REMEMBER ME");

  await call("/register", { method: "POST", body: { name: "Flow Test", email, password: PW1 } });

  let r = await call("/login", { method: "POST", body: { email, password: PW1, remember: true } });
  check("remember:true -> persistent cookie (has Max-Age/Expires)",
        /Max-Age=|Expires=/i.test(r.cookie), r.cookie.slice(0, 120));
  const longCookie = r.cookie.split(";")[0];

  r = await call("/login", { method: "POST", body: { email, password: PW1, remember: false } });
  check("remember:false -> session cookie (no Max-Age/Expires)",
        !/Max-Age=|Expires=/i.test(r.cookie), r.cookie.slice(0, 120));
  const sessionCookie = r.cookie.split(";")[0];

  check("both cookies still work for /me",
        (await call("/me", { headers: { Cookie: sessionCookie } })).status === 200);

  /* ---------- forgot password ---------- */
  section("2. FORGOT PASSWORD");

  r = await call("/forgot-password", { method: "POST", body: { email } });
  check("known email -> 200", r.status === 200, `got ${r.status}`);
  check("  neutral message (no account disclosure)",
        /if an account exists/i.test(r.json.message || ""), r.json.message);
  check("  dev reset link provided", !!r.json.devResetUrl);
  const token = (r.json.devResetUrl || "").split("token=")[1];

  const unknown = await call("/forgot-password", { method: "POST", body: { email: "ghost@nowhere.test" } });
  check("unknown email -> also 200", unknown.status === 200, `got ${unknown.status}`);
  check("  identical message (cannot enumerate accounts)",
        unknown.json.message === r.json.message);

  r = await call("/forgot-password", { method: "POST", body: { email: "not-an-email" } });
  check("invalid email -> 422", r.status === 422, `got ${r.status}`);

  /* ---------- reset password ---------- */
  section("3. RESET PASSWORD");

  r = await call("/reset-password", { method: "POST", body: { token: "a".repeat(64), password: PW2 } });
  check("forged token -> 400", r.status === 400, `got ${r.status}`);
  check("  code RESET_TOKEN_INVALID", r.json.code === "RESET_TOKEN_INVALID", r.json.code);

  r = await call("/reset-password", { method: "POST", body: { token, password: "weak" } });
  check("weak new password -> 422", r.status === 422, `got ${r.status}`);

  r = await call("/reset-password", { method: "POST", body: { token, password: PW2 } });
  check("valid token+password -> 200", r.status === 200, `got ${r.status} ${JSON.stringify(r.json)}`);
  check("  NOT auto signed in (cookie cleared)",
        /novacart_token=;|Expires=Thu, 01 Jan 1970/i.test(r.cookie), r.cookie);

  r = await call("/reset-password", { method: "POST", body: { token, password: PW3 } });
  check("token is single-use (reuse -> 400)", r.status === 400, `got ${r.status}`);

  check("old password rejected after reset",
        (await call("/login", { method: "POST", body: { email, password: PW1 } })).status === 401);

  r = await call("/login", { method: "POST", body: { email, password: PW2, remember: true } });
  check("new password works", r.status === 200, `got ${r.status}`);
  const freshCookie = r.cookie.split(";")[0];

  section("4. RESET INVALIDATES OLD SESSIONS");
  r = await call("/me", { headers: { Cookie: longCookie } });
  check("session from before the reset -> 401", r.status === 401, `got ${r.status}`);
  check("  code PASSWORD_CHANGED", r.json.code === "PASSWORD_CHANGED", r.json.code);

  /* ---------- change password ---------- */
  section("5. CHANGE PASSWORD (signed in)");

  r = await call("/password", { method: "PATCH", body: { currentPassword: PW2, newPassword: PW3 } });
  check("no session -> 401", r.status === 401, `got ${r.status}`);

  r = await call("/password", {
    method: "PATCH", headers: { Cookie: freshCookie },
    body: { currentPassword: "WrongOne123", newPassword: PW3 }
  });
  check("wrong current password -> 401", r.status === 401, `got ${r.status}`);
  check("  code WRONG_PASSWORD", r.json.code === "WRONG_PASSWORD", r.json.code);

  r = await call("/password", {
    method: "PATCH", headers: { Cookie: freshCookie },
    body: { currentPassword: PW2, newPassword: PW2 }
  });
  check("reusing the same password -> 400", r.status === 400, `got ${r.status}`);

  r = await call("/password", {
    method: "PATCH", headers: { Cookie: freshCookie },
    body: { currentPassword: PW2, newPassword: "short" }
  });
  check("weak new password -> 422", r.status === 422, `got ${r.status}`);

  r = await call("/password", {
    method: "PATCH", headers: { Cookie: freshCookie },
    body: { currentPassword: PW2, newPassword: PW3 }
  });
  check("valid change -> 200", r.status === 200, `got ${r.status} ${JSON.stringify(r.json)}`);
  check("  issues a fresh session cookie", /novacart_token=/.test(r.cookie));
  const afterChange = r.cookie.split(";")[0];

  check("the caller stays signed in",
        (await call("/me", { headers: { Cookie: afterChange } })).status === 200);
  check("older session is now invalid",
        (await call("/me", { headers: { Cookie: freshCookie } })).status === 401);
  check("new password logs in",
        (await call("/login", { method: "POST", body: { email, password: PW3 } })).status === 200);

  console.log(`\n${"=".repeat(46)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(46)}`);
  process.exit(fail ? 1 : 0);
})();
