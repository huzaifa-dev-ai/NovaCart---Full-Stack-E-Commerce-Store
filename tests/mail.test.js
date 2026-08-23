/* Mail integration tests — console mode against the live server. */

const BASE = "http://localhost:5000/api";
let pass = 0, fail = 0;

const check = (label, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? "  -> " + detail : ""}`); }
};

async function call(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, json };
}

(async () => {
  const email = `mail${Date.now()}@example.com`;

  console.log("\n1. REGISTER — welcome email must not block or break signup");
  const t0 = Date.now();
  let r = await call("/auth/register", { name: "Mail Test", email, password: "Passw0rd123" });
  const ms = Date.now() - t0;
  check("register -> 201 (console mode can't break it)", r.status === 201, `got ${r.status}`);
  check(`  responded fast (${ms}ms — not waiting on mail)`, ms < 3000);

  console.log("\n2. FORGOT PASSWORD — console mode");
  r = await call("/auth/forgot-password", { email });
  check("-> 200 with neutral message", r.status === 200 && /if an account exists/i.test(r.json.message));
  check("  devResetUrl present (nothing was delivered)", !!r.json.devResetUrl);
  check("  no devPreviewUrl (not Ethereal mode)", !r.json.devPreviewUrl);

  console.log("\n3. CONTACT FORM");
  r = await call("/contact", {});
  check("empty body -> 422", r.status === 422, `got ${r.status}`);
  check("  flags name, email, message",
        ["name", "email", "message"].every(f => (r.json.errors || []).some(e => e.field === f)),
        JSON.stringify(r.json.errors));

  r = await call("/contact", { name: "X", email: "bad", message: "short" });
  check("bad values -> 422", r.status === 422, `got ${r.status}`);

  r = await call("/contact", {
    name: "Huzaifa Mushtaq",
    email: "ihuzaifamushtaq@gmail.com",
    message: "Testing the NovaCart contact form end to end. Please ignore this message."
  });
  check("valid message -> 200", r.status === 200, `got ${r.status} ${JSON.stringify(r.json)}`);
  check("  friendly confirmation", /reply to your email/i.test(r.json.message || ""), r.json.message);

  console.log("\n4. CONTACT RATE LIMIT (5/hour)");
  // 3 requests used above (all count). Two more valid ones = 5 total, then the 6th must be blocked.
  await call("/contact", { name: "Rate Test", email: "rt@example.com", message: "Filling up the limiter bucket now." });
  const fifth = await call("/contact", { name: "Rate Test", email: "rt@example.com", message: "Filling up the limiter bucket now." });
  check("5th request still passes", fifth.status === 200, `got ${fifth.status}`);
  const sixth = await call("/contact", { name: "Rate Test", email: "rt@example.com", message: "One over the limit." });
  check("6th request -> 429", sixth.status === 429, `got ${sixth.status}`);
  check("  code RATE_LIMITED", sixth.json && sixth.json.code === "RATE_LIMITED", sixth.json && sixth.json.code);

  console.log(`\n${"=".repeat(46)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(46)}`);
  process.exit(fail ? 1 : 0);
})();
