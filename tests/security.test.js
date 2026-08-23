/* Verification for the 8 confirmed mail-review findings. */

process.chdir("d:\\CodeAlpha Internship\\NovaCart");
require("dotenv").config({ quiet: true, path: require("path").join(__dirname, "..", ".env") });

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? "  -> " + detail : ""}`); }
};

const env = require("../server/utils/env");

(async () => {
  const realNodeEnv = process.env.NODE_ENV;
  const realAppUrl = process.env.APP_URL;
  const realSmtp = process.env.SMTP_HOST;

  console.log("\n#1 + #4  FAIL-OPEN GUARDS  (isDev must be an allowlist)");
  for (const value of [undefined, "", "production", "prod", "Development", "staging"]) {
    process.env.NODE_ENV = value;
    if (value === undefined) { delete process.env.NODE_ENV; }
    check(`NODE_ENV=${JSON.stringify(value)} -> isDev() false`, env.isDev() === false, String(env.isDev()));
  }
  process.env.NODE_ENV = "development";
  check('NODE_ENV="development" -> isDev() true', env.isDev() === true);

  console.log("\n#2 + #6  HOST-HEADER POISONING");
  const evilReq = { protocol: "http", get: () => "attacker.com" };
  process.env.APP_URL = "https://novacart.example";
  check("APP_URL set -> forged Host ignored",
        env.baseUrl(evilReq) === "https://novacart.example", env.baseUrl(evilReq));

  process.env.APP_URL = "https://novacart.example/";
  check("  trailing slash trimmed",
        env.baseUrl(evilReq) === "https://novacart.example", env.baseUrl(evilReq));

  delete process.env.APP_URL;
  process.env.NODE_ENV = "production";
  check("no APP_URL in production -> request host NOT used",
        !env.baseUrl(evilReq).includes("attacker.com"), env.baseUrl(evilReq));

  process.env.NODE_ENV = "development";
  check("no APP_URL in development -> request host allowed (local convenience)",
        env.baseUrl(evilReq) === "http://attacker.com", env.baseUrl(evilReq));

  console.log("\n#5  PRODUCTION PREFLIGHT");
  process.env.NODE_ENV = "production";
  delete process.env.APP_URL;
  let problems = env.productionChecks();
  check("production without APP_URL -> refuses to boot", problems.length > 0);
  check("  message explains the risk",
        problems.some(p => /Host header/i.test(p)), problems.join(" | "));

  process.env.APP_URL = "https://novacart.example";
  const savedSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "tooshort";
  problems = env.productionChecks();
  check("production with weak JWT_SECRET -> refuses to boot",
        problems.some(p => /JWT_SECRET/i.test(p)), problems.join(" | "));

  process.env.JWT_SECRET = savedSecret;
  check("production fully configured -> boots", env.productionChecks().length === 0);

  process.env.NODE_ENV = "development";
  check("development skips the preflight", env.productionChecks().length === 0);

  console.log("\n#8  MAIL MODE RESOLUTION");
  process.env.SMTP_HOST = "smtp.gmail.com";
  check("SMTP_HOST set -> smtp mode", env.mailMode() === "smtp", env.mailMode());
  delete process.env.SMTP_HOST;
  process.env.MAIL_ETHEREAL = "true";
  process.env.NODE_ENV = "production";
  check("ethereal refused in production", env.mailMode() === "console", env.mailMode());
  process.env.NODE_ENV = "development";
  check("ethereal allowed in development", env.mailMode() === "ethereal", env.mailMode());
  process.env.MAIL_ETHEREAL = "false";
  check("nothing configured -> console", env.mailMode() === "console", env.mailMode());

  // restore
  process.env.NODE_ENV = realNodeEnv;
  process.env.APP_URL = realAppUrl;
  process.env.SMTP_HOST = realSmtp;

  console.log("\n#1  LIVE: reset token must never appear in the HTTP response");
  const r = await fetch("http://localhost:5000/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", Host: "attacker.com" },
    body: JSON.stringify({ email: "definitely-not-registered@example.com" })
  });
  const body = await r.json();
  check("unknown email -> 200 neutral", r.status === 200 && /if an account exists/i.test(body.message));
  check("  no devResetUrl", !body.devResetUrl, JSON.stringify(body));
  check("  no token anywhere in the response", !/token/i.test(JSON.stringify(body)));

  console.log("\n#3  TIMING: registered vs unknown address");
  const time = async (email) => {
    const t = Date.now();
    await fetch("http://localhost:5000/api/auth/forgot-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    return Date.now() - t;
  };
  const unknownMs = await time("nobody-here@example.com");
  const knownMs = await time(process.env.ADMIN_EMAIL);
  const gap = Math.abs(knownMs - unknownMs);
  console.log(`        unknown: ${unknownMs}ms   registered: ${knownMs}ms   gap: ${gap}ms`);
  check("gap under 400ms (SMTP round-trip is off the request path)", gap < 400, `${gap}ms`);

  console.log(`\n${"=".repeat(52)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(52)}`);
  process.exit(fail ? 1 : 0);
})();
