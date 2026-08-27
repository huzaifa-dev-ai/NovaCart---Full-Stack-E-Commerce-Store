/* =============================================================
   NovaCart — Google Sign-In
   -------------------------------------------------------------
   GET /api/auth/google           start the flow (browser redirect)
                                  ?intent=login    existing accounts only
                                  ?intent=register new accounts only
   GET /api/auth/google/callback  Google sends the user back here
   GET /api/auth/google/status    is the feature switched on?

   OAuth 2.0 Authorization Code flow with PKCE. The short version:

     1. We mint a random `state`, `nonce` and PKCE `verifier`, seal
        them into a signed, httpOnly, 10-minute cookie, and send the
        browser to Google.
     2. Google sends the browser back with a one-time `code`.
     3. We check `state` against the cookie (CSRF), swap the code for
        an ID token over a direct server-to-server call, and verify
        that token's signature against Google's public keys.
     4. Only then do we look up or create the account and issue the
        same httpOnly session cookie a password login would.

   Because these handlers are reached by *browser navigation*, not
   fetch(), every failure ends in a redirect back to login.html with
   an ?error= code the page can render — never a JSON error body,
   which the user would see as raw text.
   ============================================================= */

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const User = require("../models/User");
const { google, ENDPOINTS } = require("../config/google");
const { signToken, setAuthCookie } = require("../utils/token");
const { roleFor } = require("./authController");
const { sendMail } = require("../utils/mailer");
const { welcomeEmail, googleLinkedEmail } = require("../utils/emailTemplates");
const { baseUrl, isProd } = require("../utils/env");

const STATE_COOKIE = "novacart_oauth";
const STATE_TTL_MIN = 10;

// A separate issuer from the session token. Even if this cookie were
// somehow replayed as `novacart_token`, verifyToken() demands issuer
// "novacart" and would reject it — the two can never be confused.
const STATE_ISSUER = "novacart-oauth";

const GOOGLE_TIMEOUT_MS = 10000;

/* ---------- Redirect safety ---------- */

// Mirrors SAFE_NEXT in public/js/auth-page.js. Validated here as well,
// because this list is what stops ?next=https://evil.example turning the
// callback into an open redirect that borrows NovaCart's good name.
const SAFE_NEXT = [
  "index.html", "products.html", "product.html", "cart.html",
  "checkout.html", "about.html", "contact.html", "help.html",
  "admin.html", "orders.html"
];

/**
 * Reduce a caller-supplied ?next= to a known page name, or nothing.
 * @returns {string} a relative page (possibly with a query string), or ""
 */
function safeNext(raw) {
  const value = String(raw || "").trim();
  if (!value) { return ""; }

  // Reject anything that could leave the site: absolute URLs, scheme-
  // relative "//evil.example", backslash tricks, path traversal.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) { return ""; }
  if (value.startsWith("//") || value.includes("\\") || value.includes("..")) { return ""; }

  const page = value.replace(/^\.?\//, "").split("?")[0].split("#")[0];
  if (SAFE_NEXT.indexOf(page) === -1) { return ""; }

  return value.replace(/^\.?\//, "");
}

/** Same-origin absolute path, with ?signin=google appended for the toast. */
function landingUrl(page) {
  const target = page || "index.html";
  return `/${target}${target.includes("?") ? "&" : "?"}signin=google`;
}

/* ---------- The state cookie ---------- */

function stateCookieOptions() {
  return {
    httpOnly: true,
    // Must be "lax", not "strict": the user returns from accounts.google.com
    // by top-level navigation, and a strict cookie would not be sent — the
    // flow would fail its own CSRF check every time.
    sameSite: "lax",
    // isProd(), not NODE_ENV === "production": an unset or misspelled value
    // must mean "assume production and set Secure", never "drop it".
    secure: isProd(),
    path: "/api/auth",
    maxAge: STATE_TTL_MIN * 60 * 1000
  };
}

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error("JWT_SECRET is missing or too short (needs 32+ characters).");
  }
  return value;
}

/** Length-safe constant-time compare for the state parameter. */
function sameSecret(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length || left.length === 0) { return false; }
  return crypto.timingSafeEqual(left, right);
}

/* ---------- Talking to Google ---------- */

/**
 * Swap the one-time code for tokens. This is a direct server-to-server
 * POST over TLS, so the client secret and the resulting ID token never
 * pass through the browser.
 */
async function exchangeCode(code, codeVerifier) {
  const response = await fetch(ENDPOINTS.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: google.clientId,
      client_secret: google.clientSecret,
      redirect_uri: google.redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier
    }),
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Google token exchange failed (${response.status}): ` +
      `${data.error || "unknown"} ${data.error_description || ""}`.trim()
    );
  }
  return data;
}

/**
 * Verify the ID token's signature against Google's published keys, and
 * that it was issued for *this* client. google-auth-library handles the
 * JWKS fetch, caching and rotation; hand-rolling that is exactly the sort
 * of thing that quietly ends up accepting unsigned tokens.
 */
let idTokenClient = null;

async function verifyIdToken(idToken) {
  // One client for the process. google-auth-library caches Google's signing
  // certificates on the instance, so building a new one per sign-in would
  // refetch the JWKS on every single login.
  if (!idTokenClient) { idTokenClient = new OAuth2Client(google.clientId); }
  const ticket = await idTokenClient.verifyIdToken({ idToken, audience: google.clientId });
  return ticket.getPayload();
}

/* ---------- Account resolution ---------- */

// Google serves avatars from lh3/lh4/... .googleusercontent.com.
const AVATAR_HOST = /^(lh\d+|[a-z0-9-]+)\.googleusercontent\.com$/i;

/**
 * Normalise the `picture` claim into a URL we are willing to put in an
 * <img src>.
 *
 * The claim arrives inside a Google-signed token, so it is not attacker
 * controlled — but it is still an external string heading for the DOM, and
 * pinning it to Google's own hosts costs nothing. Anything else is dropped
 * and the account simply falls back to its initial.
 */
function safeAvatar(picture) {
  const raw = String(picture || "").trim();
  if (!raw) { return ""; }

  let url;
  try {
    url = new URL(raw);
  } catch (error) {
    return "";
  }

  if (url.protocol !== "https:") { return ""; }
  if (!AVATAR_HOST.test(url.hostname)) { return ""; }

  // Google encodes the requested size in the path as "=s96-c". Pin it to 96px
  // so a 24px chip stays sharp on a high-density display instead of taking
  // whatever default the token happened to carry.
  if (url.search || url.hash) { return url.toString(); }
  return url.toString().replace(/=s\d+(-c)?$/, "") + "=s96-c";
}

/** Google display names can be long or (rarely) empty — fit them to the schema. */
function displayName(claims, email) {
  const raw = String(claims.name || claims.given_name || "").trim();
  const fallback = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  const chosen = raw.length >= 2 ? raw : fallback;
  return (chosen.length >= 2 ? chosen : "NovaCart Shopper").slice(0, 60);
}

/**
 * Match on Google's `sub` first, then on the verified email address.
 *
 * `sub` is the durable identifier: it never changes and is never reused,
 * whereas someone can change the email on their Google account. Matching
 * on sub first means such a change doesn't strand them with a second
 * account, and it means a *recycled* address can't inherit an old one.
 *
 * The email fallback only runs for addresses Google has verified (the
 * caller enforces that), so it links accounts to the person who actually
 * controls the mailbox.
 */
async function resolveAccount(claims, email, options = {}) {
  const avatar = safeAvatar(claims.picture);
  const intent = options.intent === "register" ? "register" : "login";

  const existingByGoogle = await User.findByGoogleId(claims.sub);

  // Both lookups happen BEFORE anything is written, so a refused attempt
  // leaves the database exactly as it found it — no half-created account,
  // no refreshed avatar, no touched lastLoginAt.
  //
  // "Already here" means matched by Google's sub OR by the email address.
  // Someone who signed up with a password and then tries the button on the
  // register page is an existing user, and belongs on the sign-in page.
  const existingByEmail = existingByGoogle
    ? null
    : await User.findOne({ email }).select("+password");

  const existing = existingByGoogle || existingByEmail;

  // The two buttons are deliberately not interchangeable.
  //
  // Note this tells the visitor whether THEIR OWN address has an account —
  // which is not an enumeration oracle, because reaching this point requires
  // signing in to that Google account first. They learn nothing about anyone
  // else, so the plain-English answer is safe to give here in a way it would
  // not be on the password form.
  if (intent === "register" && existing) {
    return { alreadyRegistered: true };
  }
  if (intent === "login" && !existing) {
    return { noAccount: true };
  }

  if (existingByGoogle) {
    // Re-read the photo on every sign-in. Google's avatar URLs are not
    // permanent, so a stored one eventually 404s; refreshing here keeps the
    // header showing a live image rather than a broken one.
    if (avatar && existingByGoogle.avatar !== avatar) {
      existingByGoogle.avatar = avatar;      // saved by the caller
    }
    return { user: existingByGoogle, created: false, linked: false };
  }

  if (existingByEmail) {
    // This address is already bound to a DIFFERENT Google identity. That
    // means the address moved between Google accounts (possible on Workspace,
    // where an address can be reassigned). Silently re-pointing the account
    // at the newcomer would hand them the previous owner's order history.
    if (existingByEmail.googleId && existingByEmail.googleId !== claims.sub) {
      return { conflict: true };
    }

    // ---- Pre-account hijacking defence ----
    //
    // NovaCart does not verify email ownership at registration, so a password
    // sitting on this account is NOT evidence that whoever set it owns the
    // address. Someone can register victim@example.com first and wait; when
    // the real owner arrives through Google, linking would quietly join the
    // two and leave the squatter's password working on the victim's account.
    //
    // So the password is disabled unless the person is ALREADY signed in to
    // this exact account — which is proof they hold it, and makes "sign in,
    // then add Google" a safe, deliberate link that keeps both methods.
    //
    // The durable fix is verifying email at registration; until then this
    // closes the hole without locking anyone out, since Google still works
    // and "Forgot password" can set a new one.
    const provedOwnership = options.sessionUserId &&
      existingByEmail._id.equals(options.sessionUserId);

    let passwordDisabled = false;
    if (existingByEmail.password && !provedOwnership) {
      existingByEmail.password = undefined;
      existingByEmail.passwordChangedAt = new Date();
      // Bumped by hand: the pre-save hook skips a cleared password, and every
      // session issued before this moment has to die with the credential.
      existingByEmail.passwordVersion = (existingByEmail.passwordVersion || 0) + 1;
      passwordDisabled = true;
    }

    existingByEmail.googleId = claims.sub;
    existingByEmail.googleLinkedAt = new Date();
    existingByEmail.lastLoginAt = new Date();
    if (avatar) { existingByEmail.avatar = avatar; }
    // validateBeforeSave:false — a legacy document must not be blocked from
    // signing in by a validation rule added after it was written.
    await existingByEmail.save({ validateBeforeSave: false });
    return { user: existingByEmail, created: false, linked: true, passwordDisabled };
  }

  const user = await User.create({
    name: displayName(claims, email),
    email,
    authProvider: "google",
    googleId: claims.sub,
    googleLinkedAt: new Date(),
    lastLoginAt: new Date(),
    avatar,
    // Role is decided by our own policy, never by anything Google sent.
    role: roleFor(email)
  });

  return { user, created: true, linked: false };
}

/* ---------- GET /api/auth/google ---------- */

async function googleStart(req, res, next) {
  try {
    const wanted = safeNext(req.query.next);

    if (!google.configured) {
      return res.redirect("/login.html?error=google_disabled");
    }

    const state = crypto.randomBytes(32).toString("base64url");
    const nonce = crypto.randomBytes(16).toString("base64url");

    // PKCE (RFC 7636): we send only the SHA-256 of the verifier now, and
    // the verifier itself later. Someone who intercepts the redirect back
    // still cannot redeem the code without it.
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

    // Which button was pressed. REQUIRED, and never inferred.
    //
    // Defaulting used to feel harmless, but neither gate is a safe default:
    // "login" links an existing account and disables its password, "register"
    // creates one. A request that does not say which door it came through has
    // no business doing either, so it is turned away.
    const intent = req.query.intent;
    if (intent !== "login" && intent !== "register") {
      return res.redirect("/login.html?error=google_no_intent");
    }

    const sealed = jwt.sign(
      { state, nonce, verifier, intent, next: wanted, remember: req.query.remember !== "false" },
      secret(),
      { expiresIn: `${STATE_TTL_MIN}m`, issuer: STATE_ISSUER }
    );
    res.cookie(STATE_COOKIE, sealed, stateCookieOptions());

    const url = new URL(ENDPOINTS.auth);
    url.searchParams.set("client_id", google.clientId);
    url.searchParams.set("redirect_uri", google.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", google.scopes.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    // We only need identity, so no refresh token is requested — nothing
    // long-lived to store, and nothing to leak.
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");

    res.redirect(url.toString());
  } catch (error) {
    next(error);
  }
}

/* ---------- GET /api/auth/google/callback ---------- */

async function googleCallback(req, res, _next) {
  /**
   * Every failure path lands the browser back on an auth page.
   *
   * `page` matters for the two intent refusals: someone who tried to sign in
   * without an account should arrive on the REGISTER form, and someone who
   * tried to register with an existing one should arrive on the SIGN-IN form.
   * Bouncing them both to the same place would leave them re-clicking a
   * button that cannot work.
   */
  const fail = (code, keepNext, page) => {
    res.clearCookie(STATE_COOKIE, { ...stateCookieOptions(), maxAge: undefined });
    const query = new URLSearchParams({ error: code });
    if (keepNext) { query.set("next", keepNext); }
    return res.redirect(`/${page || "login.html"}?${query.toString()}`);
  };

  let saved = null;

  try {
    if (!google.configured) { return fail("google_disabled"); }

    const sealed = req.cookies ? req.cookies[STATE_COOKIE] : null;
    if (!sealed) { return fail("google_state"); }

    try {
      saved = jwt.verify(sealed, secret(), { issuer: STATE_ISSUER });
    } catch (error) {
      return fail("google_state");
    }

    // The user pressed "Cancel" on Google's consent screen.
    if (req.query.error) {
      return fail(req.query.error === "access_denied" ? "google_denied" : "google_failed", saved.next);
    }

    // CSRF: this must be the same flow we started, in this same browser.
    if (!sameSecret(req.query.state, saved.state)) { return fail("google_state", saved.next); }

    const code = String(req.query.code || "");
    if (!code) { return fail("google_failed", saved.next); }

    const tokens = await exchangeCode(code, saved.verifier);
    if (!tokens.id_token) { return fail("google_failed", saved.next); }

    const claims = await verifyIdToken(tokens.id_token);

    // Replay protection: ties this ID token to the request we started.
    if (!claims || !sameSecret(claims.nonce, saved.nonce)) {
      return fail("google_state", saved.next);
    }

    const email = String(claims.email || "").trim().toLowerCase();

    // An unverified address proves nothing about who is signing in, and
    // linking on it would hand over any account that happens to share it.
    if (!email || claims.email_verified !== true) {
      return fail("google_unverified", saved.next);
    }

    let account;
    try {
      // attachUser has already resolved any existing session, so a link made
      // while signed in can be recognised as deliberate.
      account = await resolveAccount(claims, email, {
        sessionUserId: req.user ? req.user._id : null,
        // From the sealed cookie, never from the callback's query string —
        // otherwise anyone could flip the gate on the way back from Google.
        intent: saved.intent
      });
    } catch (error) {
      // Two callbacks racing can both miss the lookup and both insert.
      // The unique index rejects the loser; re-read and carry on.
      if (error && error.code === 11000) {
        const user = (await User.findByGoogleId(claims.sub)) || (await User.findOne({ email }));
        if (!user) { throw error; }
        account = { user, created: false, linked: false };
      } else {
        throw error;
      }
    }

    if (account.conflict) { return fail("google_conflict", saved.next); }

    // Tried to sign in, but nothing here matches that Google account.
    if (account.noAccount) {
      return fail("google_no_account", saved.next, "register.html");
    }
    // Tried to register, but that address already has an account.
    if (account.alreadyRegistered) {
      return fail("google_already_registered", saved.next, "login.html");
    }

    const { user, created, linked, passwordDisabled } = account;
    const remember = saved.remember !== false;

    if (!created && !linked) {
      user.lastLoginAt = new Date();
      await user.save({ validateBeforeSave: false });
    }

    const token = signToken(user, remember);
    setAuthCookie(res, token, remember);
    res.clearCookie(STATE_COOKIE, { ...stateCookieOptions(), maxAge: undefined });

    const destination = saved.next || (user.role === "admin" ? "admin.html" : "index.html");
    res.redirect(landingUrl(destination));

    /* ---- After the redirect: mail must never delay a sign-in ---- */

    if (created) {
      sendMail({ to: user.email, ...welcomeEmail({ name: user.name, siteUrl: baseUrl(req) }) })
        .catch((err) => console.warn("📧  Welcome email failed:", err.message));
    } else if (linked) {
      // Tell the account holder out-of-band that a Google identity was
      // attached. If it wasn't them, this is how they find out.
      sendMail({
        to: user.email,
        ...googleLinkedEmail({
          name: user.name,
          email: user.email,
          siteUrl: baseUrl(req),
          passwordDisabled
        })
      }).catch((err) => console.warn("📧  Link notice failed:", err.message));
    }
  } catch (error) {
    // Log the real reason for us; show the user something they can act on.
    console.error("🔐  Google sign-in failed:", error.message);
    return fail("google_failed", saved && saved.next);
  }
}

/* ---------- GET /api/auth/google/status ---------- */

/** Lets the login page show the button only when it would actually work. */
function googleStatus(_req, res) {
  res.json({ success: true, enabled: google.configured });
}

module.exports = {
  googleStart,
  googleCallback,
  googleStatus,
  // Exported for tests/google-auth.test.js, which exercises the account
  // matching rules directly — the full round trip needs Google itself.
  safeNext,
  resolveAccount,
  displayName,
  safeAvatar
};
