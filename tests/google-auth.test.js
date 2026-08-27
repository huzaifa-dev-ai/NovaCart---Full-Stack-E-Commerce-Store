/* =============================================================
   NovaCart — Google Sign-In tests
   -------------------------------------------------------------
   Two halves:

   A. PROTOCOL — drives a live server (started here on its own port
      with throwaway credentials) through the OAuth handshake and
      every way it can go wrong. What this proves is the important
      part: nothing short of a genuine, signature-verified response
      from Google ever produces a session cookie.

   B. ACCOUNT MATCHING — calls resolveAccount() directly against the
      database, because the happy path needs an ID token that only
      Google can sign. These cover linking, creation and the rule
      that a Google login can never mint an admin by itself.

   Run:  npm run test:google      (server must NOT already own 5099)
   ============================================================= */

require("dotenv").config({ quiet: true });

const { spawn } = require("child_process");
const path = require("path");
const mongoose = require("mongoose");

const PORT = 5099;
const BASE = `http://127.0.0.1:${PORT}`;
const API = `${BASE}/api`;

// Deliberately fake. Google will reject them, which is exactly what the
// protocol half needs: it must fail closed, never fall back to trusting us.
const FAKE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const FAKE_SECRET = "test-client-secret";

let pass = 0;
let fail = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    pass += 1;
    console.log("  PASS  " + label);
  } else {
    fail += 1;
    failures.push(label);
    console.log("  FAIL  " + label + (detail ? "  -> " + detail : ""));
  }
}

/* ---------- HTTP helper that never follows redirects ---------- */

async function get(pathname, { cookie } = {}) {
  const res = await fetch(API + pathname, {
    redirect: "manual",
    headers: cookie ? { Cookie: cookie } : {}
  });
  return {
    status: res.status,
    location: res.headers.get("location") || "",
    setCookie: res.headers.getSetCookie ? res.headers.getSetCookie() : [],
    json: await res.json().catch(() => null)
  };
}

async function post(pathname, body, cookie) {
  const res = await fetch(API + pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body)
  });
  return {
    status: res.status,
    json: await res.json().catch(() => null),
    cookie: (res.headers.get("set-cookie") || "").split(";")[0]
  };
}

/** Pull one cookie's value out of a Set-Cookie list. */
function cookieValue(list, name) {
  const hit = (list || []).find((c) => c.startsWith(name + "="));
  return hit ? hit.split(";")[0].slice(name.length + 1) : "";
}

function cookieAttrs(list, name) {
  return (list || []).find((c) => c.startsWith(name + "=")) || "";
}

/* ---------- Boot a server with Google switched on ---------- */

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, "..", "server", "server.js")], {
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: "development",
        USE_HTTPS: "false",              // plain HTTP keeps the test client simple
        APP_URL: BASE,
        GOOGLE_CLIENT_ID: FAKE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: FAKE_SECRET,
        GOOGLE_REDIRECT_URI: `${BASE}/api/auth/google/callback`
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let log = "";
    const timer = setTimeout(() => reject(new Error("server did not start:\n" + log)), 30000);

    child.stdout.on("data", (chunk) => {
      log += chunk;
      if (log.includes("NovaCart server running")) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.stderr.on("data", (chunk) => { log += chunk; });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early (${code}):\n${log}`));
    });
  });
}

/* =============================================================
   A. PROTOCOL
   ============================================================= */

async function protocolTests() {
  console.log("\n=== 1. FEATURE FLAG ===");

  const status = await get("/auth/google/status");
  check("status reports enabled when credentials exist", status.json && status.json.enabled === true,
    JSON.stringify(status.json));

  console.log("\n=== 2. STARTING THE FLOW ===");

  const start = await get("/auth/google?intent=login");
  check("start redirects (302)", start.status === 302, "got " + start.status);
  check("  sends the browser to Google", start.location.startsWith("https://accounts.google.com/o/oauth2/v2/auth"),
    start.location.slice(0, 60));

  const authUrl = new URL(start.location || "https://x.invalid");
  check("  asks only for identity scopes", authUrl.searchParams.get("scope") === "openid email profile",
    authUrl.searchParams.get("scope"));
  check("  response_type=code (not a browser-side token)", authUrl.searchParams.get("response_type") === "code");
  check("  carries a state parameter", (authUrl.searchParams.get("state") || "").length >= 40);
  check("  carries a nonce", (authUrl.searchParams.get("nonce") || "").length >= 20);
  check("  uses PKCE with S256, not plain", authUrl.searchParams.get("code_challenge_method") === "S256",
    authUrl.searchParams.get("code_challenge_method"));
  check("  sends a challenge, never the verifier",
    (authUrl.searchParams.get("code_challenge") || "").length >= 40 &&
    !start.location.includes("code_verifier"));
  check("  redirect_uri matches our configured callback",
    authUrl.searchParams.get("redirect_uri") === `${BASE}/api/auth/google/callback`,
    authUrl.searchParams.get("redirect_uri"));
  check("  client secret is NOT in the redirect", !start.location.includes(FAKE_SECRET));

  console.log("\n=== 3. THE STATE COOKIE ===");

  const stateCookieRaw = cookieAttrs(start.setCookie, "novacart_oauth");
  const sealed = cookieValue(start.setCookie, "novacart_oauth");

  check("state cookie is set", !!sealed);
  check("  httpOnly (JavaScript cannot read it)", /HttpOnly/i.test(stateCookieRaw), stateCookieRaw);
  check("  SameSite=Lax so it survives the return trip", /SameSite=Lax/i.test(stateCookieRaw));
  check("  scoped to /api/auth, not the whole site", /Path=\/api\/auth/i.test(stateCookieRaw), stateCookieRaw);
  check("  short-lived (10 minutes)", /Max-Age=600/i.test(stateCookieRaw), stateCookieRaw);

  // The verifier lives in the cookie, but sealed as a signed JWT.
  const claims = JSON.parse(Buffer.from(sealed.split(".")[1], "base64url").toString());
  check("  sealed with the oauth issuer, not the session issuer",
    claims.iss === "novacart-oauth", claims.iss);
  check("  no `sub` claim, so it can never pass as a session token", claims.sub === undefined);

  const replay = await get("/auth/me", { cookie: "novacart_token=" + sealed });
  check("state cookie REPLAYED as a session token is rejected -> 401", replay.status === 401,
    "got " + replay.status);

  console.log("\n=== 4. OPEN REDIRECT ===");

  const evil = await get("/auth/google?intent=login&next=" + encodeURIComponent("https://evil.example/steal"));
  const evilClaims = JSON.parse(Buffer.from(
    cookieValue(evil.setCookie, "novacart_oauth").split(".")[1], "base64url").toString());
  check("an absolute ?next= is discarded", evilClaims.next === "", JSON.stringify(evilClaims.next));

  for (const attempt of ["//evil.example", "..%2f..%2fetc", "javascript:alert(1)", "\\\\evil.example", "wallet.html"]) {
    const res = await get("/auth/google?intent=login&next=" + encodeURIComponent(attempt));
    const c = JSON.parse(Buffer.from(
      cookieValue(res.setCookie, "novacart_oauth").split(".")[1], "base64url").toString());
    check(`  "${attempt}" is discarded`, c.next === "", JSON.stringify(c.next));
  }

  const good = await get("/auth/google?intent=login&next=" + encodeURIComponent("checkout.html"));
  const goodClaims = JSON.parse(Buffer.from(
    cookieValue(good.setCookie, "novacart_oauth").split(".")[1], "base64url").toString());
  check("a known page IS kept", goodClaims.next === "checkout.html", goodClaims.next);

  console.log("\n=== 4b. THE INTENT IS SEALED, NOT SUPPLIED ===");

  const sealedIntent = async (query) => {
    const res = await get("/auth/google" + query);
    const raw = cookieValue(res.setCookie, "novacart_oauth");
    return JSON.parse(Buffer.from(raw.split(".")[1], "base64url").toString());
  };

  check("?intent=register is recorded", (await sealedIntent("?intent=register")).intent === "register");
  check("?intent=login is recorded", (await sealedIntent("?intent=login")).intent === "login");
  // Neither gate is a safe default — "login" links an existing account and
  // disables its password, "register" creates one — so an unstated intent is
  // turned away rather than guessed.
  const refusedIntent = async (query) => {
    const res = await get("/auth/google" + query);
    return res.status === 302 &&
           res.location.includes("error=google_no_intent") &&
           !cookieValue(res.setCookie, "novacart_oauth");
  };
  check("a MISSING intent is refused, not guessed", await refusedIntent(""));
  check("an unknown intent is refused", await refusedIntent("?intent=whatever"));
  check("  including one that merely looks right", await refusedIntent("?intent=REGISTER"));
  check("  and an empty one", await refusedIntent("?intent="));

  // The gate would be worthless if the callback read it off the query string:
  // anyone refused at one door could just relabel themselves at the other.
  const loginFlow = await get("/auth/google?intent=login");
  const loginSealed = cookieValue(loginFlow.setCookie, "novacart_oauth");
  const loginClaims = JSON.parse(Buffer.from(loginSealed.split(".")[1], "base64url").toString());

  const flipped = await get(
    `/auth/google/callback?code=abc&state=${loginClaims.state}&intent=register`,
    { cookie: "novacart_oauth=" + loginSealed });
  check("appending &intent=register to the callback cannot flip the gate",
    !flipped.location.includes("error=google_already_registered"), flipped.location);
  check("  and still no session is issued", !cookieValue(flipped.setCookie, "novacart_token"));

  console.log("\n=== 5. THE CALLBACK REFUSES EVERYTHING IT SHOULD ===");

  const validStateCookie = "novacart_oauth=" + sealed;
  const savedState = claims.state;

  const noCookie = await get("/auth/google/callback?code=abc&state=" + savedState);
  check("no state cookie -> back to login with google_state",
    noCookie.status === 302 && noCookie.location.includes("error=google_state"), noCookie.location);
  check("  and NO session cookie is issued",
    !cookieValue(noCookie.setCookie, "novacart_token"));

  const wrongState = await get("/auth/google/callback?code=abc&state=" + "x".repeat(savedState.length),
    { cookie: validStateCookie });
  check("forged state -> google_state (CSRF blocked)",
    wrongState.location.includes("error=google_state"), wrongState.location);
  check("  and NO session cookie is issued", !cookieValue(wrongState.setCookie, "novacart_token"));

  const emptyState = await get("/auth/google/callback?code=abc", { cookie: validStateCookie });
  check("missing state -> google_state", emptyState.location.includes("error=google_state"));

  const tampered = "novacart_oauth=" + sealed.slice(0, -6) + "AAAAAA";
  const badSig = await get(`/auth/google/callback?code=abc&state=${savedState}`, { cookie: tampered });
  check("a re-signed state cookie is rejected -> google_state",
    badSig.location.includes("error=google_state"), badSig.location);

  const denied = await get("/auth/google/callback?error=access_denied&state=" + savedState,
    { cookie: validStateCookie });
  check("user pressed Cancel -> google_denied", denied.location.includes("error=google_denied"),
    denied.location);

  console.log("\n=== 6. THE CORE GUARANTEE: no Google, no session ===");

  // State is valid, so we reach the token exchange — which fails, because
  // our credentials are fake. This is the attack that matters: a forged
  // callback must not be able to talk its way into a session.
  const forgedLogin = await get(`/auth/google/callback?code=forged_code&state=${savedState}`,
    { cookie: validStateCookie });
  check("a forged code cannot be exchanged -> google_failed",
    forgedLogin.location.includes("error=google_failed"), forgedLogin.location);
  check("  NO session cookie was issued", !cookieValue(forgedLogin.setCookie, "novacart_token"),
    cookieValue(forgedLogin.setCookie, "novacart_token"));
  check("  the state cookie is cleared, so it cannot be retried",
    (forgedLogin.setCookie || []).some((c) => c.startsWith("novacart_oauth=;")));

  console.log("\n=== 7. PASSWORD ACCOUNTS ARE UNAFFECTED ===");

  const email = `googletest${Date.now()}@example.com`;
  const reg = await post("/auth/register", { name: "Local User", email, password: "Passw0rd123" });
  check("ordinary email registration still works -> 201", reg.status === 201, "got " + reg.status);
  check("  toPublic reports the sign-in method",
    reg.json.user.authProvider === "local" && reg.json.user.hasPassword === true,
    JSON.stringify({ p: reg.json.user.authProvider, h: reg.json.user.hasPassword }));
  check("  and never leaks the hash", reg.json.user.password === undefined);

  const login = await post("/auth/login", { email, password: "Passw0rd123" });
  check("password login still works -> 200", login.status === 200, "got " + login.status);
}

/* =============================================================
   B. ACCOUNT MATCHING
   ============================================================= */

async function accountTests() {
  const { resolveAccount, displayName, safeNext, safeAvatar } =
    require("../server/controllers/googleAuthController");
  const User = require("../server/models/User");

  console.log("\n=== 8. safeNext() ===");
  check("keeps a whitelisted page", safeNext("orders.html") === "orders.html");
  check("keeps its query string", safeNext("product.html?id=7") === "product.html?id=7");
  check("strips a leading ./", safeNext("./cart.html") === "cart.html");
  check("drops an unknown page", safeNext("secret-admin.html") === "");
  check("drops an absolute URL", safeNext("https://evil.example") === "");
  check("drops a protocol-relative URL", safeNext("//evil.example") === "");
  check("drops traversal", safeNext("../../etc/passwd") === "");
  check("drops a javascript: URL", safeNext("javascript:alert(1)") === "");
  check("drops empty input", safeNext("") === "" && safeNext(null) === "");

  console.log("\n=== 9. displayName() ===");
  check("uses the Google name", displayName({ name: "Ada Lovelace" }, "ada@x.com") === "Ada Lovelace");
  check("falls back to the email local part when absent",
    displayName({}, "ada.lovelace@x.com") === "ada lovelace");
  check("truncates to the 60-char schema limit",
    displayName({ name: "A".repeat(200) }, "a@x.com").length === 60);
  check("never returns something under the 2-char minimum",
    displayName({ name: "" }, "a@x.com").length >= 2, displayName({ name: "" }, "a@x.com"));

  console.log("\n=== 9b. safeAvatar() ===");
  const GOOG = "https://lh3.googleusercontent.com/a/ACg8ocAbC";
  check("accepts a Google avatar", safeAvatar(GOOG + "=s96-c").startsWith(GOOG));
  check("  normalises the size to 96px",
    safeAvatar(GOOG + "=s64-c").endsWith("=s96-c"), safeAvatar(GOOG + "=s64-c"));
  check("  adds a size when there is none",
    safeAvatar(GOOG).endsWith("=s96-c"), safeAvatar(GOOG));
  check("accepts other lh hosts", !!safeAvatar("https://lh6.googleusercontent.com/a/x"));
  check("rejects a foreign host", safeAvatar("https://evil.example/x.png") === "");
  check("rejects a lookalike host",
    safeAvatar("https://lh3.googleusercontent.com.evil.example/x") === "",
    safeAvatar("https://lh3.googleusercontent.com.evil.example/x"));
  check("rejects plain http", safeAvatar("http://lh3.googleusercontent.com/a/x") === "");
  check("rejects a javascript: URL", safeAvatar("javascript:alert(1)") === "");
  check("rejects a data: URL", safeAvatar("data:image/svg+xml,<svg onload=alert(1)>") === "");
  check("rejects junk", safeAvatar("not a url") === "" && safeAvatar(null) === "");

  const stamp = Date.now();
  const created = [];

  try {
    console.log("\n=== 10. NEW GOOGLE ACCOUNT ===");
    const freshEmail = `gnew${stamp}@example.com`;
    const a = await resolveAccount({
      sub: `sub-new-${stamp}`,
      name: "Grace Hopper",
      picture: "https://lh3.googleusercontent.com/a/GRACE=s64-c"
    }, freshEmail, { intent: "register" });
    created.push(a.user._id);

    check("  the Google profile photo is stored",
      a.user.avatar === "https://lh3.googleusercontent.com/a/GRACE=s96-c", a.user.avatar);
    check("  and reaches the frontend via toPublic()",
      a.user.toPublic().avatar === a.user.avatar);

    check("a first-time Google user is created", a.created === true);
    check("  authProvider is google", a.user.authProvider === "google", a.user.authProvider);
    check("  no password hash exists to attack", !a.user.password, String(a.user.password));
    check("  role is customer, never taken from Google", a.user.role === "customer", a.user.role);
    check("  googleId stores Google's sub", a.user.googleId === `sub-new-${stamp}`);

    const reloaded = await User.findById(a.user._id).select("+password");
    check("  reloaded from the database, still no password", !reloaded.password);
    check("  hasPassword is false for the UI", reloaded.toPublic().hasPassword === false);

    console.log("\n=== 11. RETURNING GOOGLE USER ===");
    const again = await resolveAccount(
      { sub: `sub-new-${stamp}`, name: "Grace Hopper" }, freshEmail, { intent: "login" });
    check("second sign-in matches, does not duplicate", again.created === false);
    check("  same account id", again.user._id.equals(a.user._id));
    check("  exactly one row for that sub",
      (await User.countDocuments({ googleId: `sub-new-${stamp}` })) === 1);

    console.log("\n=== 11b. THE PHOTO IS REFRESHED, NOT FROZEN ===");

    // resolveAccount() updates the document but leaves the write to
    // googleCallback, which saves it alongside lastLoginAt. Do the same here,
    // so these assertions run against what is actually persisted rather than
    // an in-memory copy that would never have reached the database.
    const signInWithPicture = async (picture) => {
      const res = await resolveAccount(
        { sub: `sub-new-${stamp}`, name: "Grace Hopper", picture }, freshEmail,
        { intent: "login" });
      res.user.lastLoginAt = new Date();
      await res.user.save({ validateBeforeSave: false });
      return User.findById(res.user._id);        // re-read: prove it stuck
    };

    const changed = await signInWithPicture("https://lh3.googleusercontent.com/a/GRACE-NEW-PHOTO=s96-c");
    check("a new Google photo replaces the old one",
      changed.avatar === "https://lh3.googleusercontent.com/a/GRACE-NEW-PHOTO=s96-c",
      changed.avatar);

    const hostile = await signInWithPicture("https://evil.example/tracker.gif");
    check("a non-Google picture URL is never stored",
      hostile.avatar !== "https://evil.example/tracker.gif", hostile.avatar);
    check("  and the previous good photo is kept",
      hostile.avatar === "https://lh3.googleusercontent.com/a/GRACE-NEW-PHOTO=s96-c",
      hostile.avatar);

    const dropped = await signInWithPicture(undefined);
    check("a sign-in with no picture claim leaves the photo alone",
      dropped.avatar === "https://lh3.googleusercontent.com/a/GRACE-NEW-PHOTO=s96-c",
      dropped.avatar);

    console.log("\n=== 12. GOOGLE ADDRESS CHANGED, SUB DID NOT ===");
    const renamed = await resolveAccount(
      { sub: `sub-new-${stamp}`, name: "Grace Hopper" }, `moved${stamp}@example.com`,
      { intent: "login" });
    check("still the same account (matched on sub, not email)",
      renamed.user._id.equals(a.user._id));
    check("  and no second account appeared",
      (await User.countDocuments({ email: `moved${stamp}@example.com` })) === 0);

    console.log("\n=== 13. LINKING TO AN EXISTING PASSWORD ACCOUNT ===");
    const localEmail = `glink${stamp}@example.com`;
    const local = await User.create({ name: "Existing Shopper", email: localEmail, password: "Passw0rd123" });
    created.push(local._id);

    const linked = await resolveAccount(
      { sub: `sub-link-${stamp}`, name: "Existing Shopper" }, localEmail, { intent: "login" });
    check("an existing account is linked, not duplicated", linked.linked === true && linked.created === false);
    check("  same account id", linked.user._id.equals(local._id));
    check("  only one account for that address",
      (await User.countDocuments({ email: localEmail })) === 1);
    check("  and the link is timestamped for the audit trail", !!linked.user.googleLinkedAt);

    // This suite used to assert the opposite — that the password survived.
    // An adversarial review showed why that was the bug, not the feature:
    // NovaCart never verifies email ownership at registration, so anyone can
    // register victim@example.com first, wait for the real owner to arrive
    // through Google, and keep a working password on the joined account.
    const afterLink = await User.findById(local._id).select("+password");
    check("  an UNPROVEN password is disabled by the link", !afterLink.password,
      String(afterLink.password));
    check("  passwordVersion bumped, so old sessions die", afterLink.passwordVersion === 1,
      String(afterLink.passwordVersion));
    check("  the caller is told, so it can send the right email",
      linked.passwordDisabled === true, String(linked.passwordDisabled));

    console.log("\n=== 13b. BUT A DELIBERATE LINK KEEPS THE PASSWORD ===");

    // Being signed in to the account IS proof of ownership, so "sign in, then
    // add Google" is safe and must not cost anyone their password.
    const bothEmail = `gboth${stamp}@example.com`;
    const both = await User.create({ name: "Careful Shopper", email: bothEmail, password: "Passw0rd123" });
    created.push(both._id);

    const deliberate = await resolveAccount(
      { sub: `sub-both-${stamp}`, name: "Careful Shopper" },
      bothEmail,
      { sessionUserId: both._id, intent: "login" }
    );
    check("linking while signed in keeps the password", deliberate.passwordDisabled === false,
      String(deliberate.passwordDisabled));

    const afterBoth = await User.findById(both._id).select("+password");
    check("  the hash survives", !!afterBoth.password);
    check("  so both sign-in methods now reach one account",
      afterBoth.googleId === `sub-both-${stamp}` && !!afterBoth.password);
    check("  and sessions are NOT invalidated", (afterBoth.passwordVersion || 0) === 0,
      String(afterBoth.passwordVersion));

    console.log("\n=== 13c. A DIFFERENT GOOGLE ACCOUNT CANNOT SEIZE THE ADDRESS ===");

    const seize = await resolveAccount(
      { sub: `sub-INTRUDER-${stamp}`, name: "Intruder" }, bothEmail, { intent: "login" });
    check("a second Google identity on a bound address is refused",
      seize.conflict === true, JSON.stringify(seize).slice(0, 70));
    const untouched = await User.findById(both._id);
    check("  the original googleId is unchanged",
      untouched.googleId === `sub-both-${stamp}`, untouched.googleId);
    check("  and no session is produced", !seize.user);

    console.log("\n=== 14. ROLE POLICY ===");
    const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    check("ADMIN_EMAIL is configured, so the rule is meaningful", !!adminEmail, "(unset)");

    const impostor = await resolveAccount(
      { sub: `sub-imp-${stamp}`, name: "Not The Admin" }, `notadmin${stamp}@example.com`,
      { intent: "register" });
    created.push(impostor.user._id);
    check("a Google sign-in cannot mint an admin", impostor.user.role === "customer", impostor.user.role);

    console.log("\n=== 14b. THE TWO BUTTONS ARE DIFFERENT GATES ===");

    // Sign-in admits only accounts that already exist; registration admits
    // only ones that do not. The important property on every refusal is that
    // NOTHING is written — no half-made account, no touched timestamps.

    const strangerEmail = `stranger${stamp}@example.com`;
    const strangerSub = `sub-stranger-${stamp}`;

    const beforeCount = await User.countDocuments();

    const coldLogin = await resolveAccount(
      { sub: strangerSub, name: "Never Registered" }, strangerEmail, { intent: "login" });
    check("SIGN IN + no account  -> refused", coldLogin.noAccount === true,
      JSON.stringify(coldLogin).slice(0, 70));
    check("  no session is produced", !coldLogin.user);
    check("  and NO account was created",
      (await User.countDocuments({ email: strangerEmail })) === 0);
    check("  the collection is unchanged", (await User.countDocuments()) === beforeCount);

    const coldRegister = await resolveAccount(
      { sub: strangerSub, name: "Never Registered" }, strangerEmail, { intent: "register" });
    created.push(coldRegister.user && coldRegister.user._id);
    check("REGISTER + no account -> allowed", coldRegister.created === true,
      JSON.stringify({ created: coldRegister.created }));
    check("  the account now exists",
      (await User.countDocuments({ email: strangerEmail })) === 1);

    const warmLogin = await resolveAccount(
      { sub: strangerSub, name: "Never Registered" }, strangerEmail, { intent: "login" });
    check("SIGN IN + account      -> allowed", !!warmLogin.user && !warmLogin.noAccount);
    check("  and it is the same account", warmLogin.user._id.equals(coldRegister.user._id));

    const warmRegister = await resolveAccount(
      { sub: strangerSub, name: "Never Registered" }, strangerEmail, { intent: "register" });
    check("REGISTER + account     -> refused", warmRegister.alreadyRegistered === true,
      JSON.stringify(warmRegister).slice(0, 70));
    check("  no session is produced", !warmRegister.user);
    check("  still exactly one account",
      (await User.countDocuments({ email: strangerEmail })) === 1);

    console.log("\n=== 14c. A PASSWORD ACCOUNT COUNTS AS REGISTERED ===");

    // Someone who signed up with email+password already exists, even though
    // they have never touched Google. The register gate must say so rather
    // than silently linking.
    const pwEmail = `pwonly${stamp}@example.com`;
    const pwUser = await User.create({ name: "Password Only", email: pwEmail, password: "Passw0rd123" });
    created.push(pwUser._id);

    const pwRegister = await resolveAccount(
      { sub: `sub-pw-${stamp}`, name: "Password Only" }, pwEmail, { intent: "register" });
    check("REGISTER on an email+password account -> refused",
      pwRegister.alreadyRegistered === true, JSON.stringify(pwRegister).slice(0, 70));

    const untouchedPw = await User.findById(pwUser._id).select("+password");
    check("  their password was NOT disabled by the refusal", !!untouchedPw.password);
    check("  and no googleId was attached", !untouchedPw.googleId, String(untouchedPw.googleId));

    const pwLogin = await resolveAccount(
      { sub: `sub-pw-${stamp}`, name: "Password Only" }, pwEmail, { intent: "login" });
    check("SIGN IN on the same account -> allowed, and links", pwLogin.linked === true);

    console.log("\n=== 15. UNIQUENESS ===");
    let duplicateRejected = false;
    try {
      await User.create({
        name: "Sub Thief", email: `thief${stamp}@example.com`,
        authProvider: "google", googleId: `sub-new-${stamp}`
      });
    } catch (error) {
      duplicateRejected = error.code === 11000;
    }
    check("two accounts cannot share one googleId", duplicateRejected);

    const p1 = await User.create({ name: "Plain One", email: `p1${stamp}@example.com`, password: "Passw0rd123" });
    const p2 = await User.create({ name: "Plain Two", email: `p2${stamp}@example.com`, password: "Passw0rd123" });
    created.push(p1._id, p2._id);
    check("but many password accounts can coexist without a googleId",
      !p1.googleId && !p2.googleId);
  } finally {
    const ids = created.filter(Boolean);
    if (ids.length) { await User.deleteMany({ _id: { $in: ids } }); }
    await User.deleteMany({ email: /@example\.com$/, googleId: { $exists: true } });
  }
}

/* =============================================================
   C. PASSWORD-LESS ACCOUNT MESSAGING  (needs the live server)
   ============================================================= */

async function messagingTests() {
  const User = require("../server/models/User");
  const stamp = Date.now();
  const email = `gmsg${stamp}@example.com`;

  const user = await User.create({
    name: "Google Only", email, authProvider: "google", googleId: `sub-msg-${stamp}`
  });

  try {
    console.log("\n=== 16. SIGNING IN TO A GOOGLE-ONLY ACCOUNT WITH A PASSWORD ===");
    const attempt = await post("/auth/login", { email, password: "Passw0rd123" });
    check("password login is refused -> 401", attempt.status === 401, "got " + attempt.status);
    check("  and points at the Google button", attempt.json.code === "USE_GOOGLE", attempt.json.code);
    check("  no session cookie is issued", !attempt.cookie.startsWith("novacart_token="),
      attempt.cookie);

    console.log("\n=== 17. IT IS STILL NOT A PASSWORD ORACLE ===");
    const wrong = await post("/auth/login", { email, password: "CompletelyWrong9" });
    check("a different password gets the same answer", wrong.json.code === "USE_GOOGLE",
      wrong.json.code);
    check("  so no password can be confirmed or ruled out",
      wrong.json.error === attempt.json.error);

    console.log("\n=== 18. RECOVERY IS STILL POSSIBLE ===");
    const forgot = await post("/auth/forgot-password", { email });
    check("forgot-password accepts a Google-only account -> 200", forgot.status === 200,
      "got " + forgot.status);
    const withCode = await User.findOne({ email }).select("+resetOtp");
    check("  a one-time code was issued, so they can add a password", !!withCode.resetOtp);
  } finally {
    await User.deleteOne({ _id: user._id });
  }
}

/* ---------- Runner ---------- */

(async () => {
  let child = null;
  try {
    console.log("\n" + "=".repeat(60));
    console.log("  NovaCart — Google Sign-In");
    console.log("=".repeat(60));

    child = await startServer();
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

    await protocolTests();
    await accountTests();
    await messagingTests();
  } catch (error) {
    fail += 1;
    failures.push("harness: " + error.message);
    console.error("\n💥  " + error.stack);
  } finally {
    if (child) { child.kill(); }
    await mongoose.disconnect().catch(() => {});
  }

  console.log("\n" + "=".repeat(60));
  console.log(`  ${pass} passed, ${fail} failed`);
  if (failures.length) { failures.forEach((f) => console.log("    ✗ " + f)); }
  console.log("=".repeat(60) + "\n");
  process.exit(fail ? 1 : 0);
})();
