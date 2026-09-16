/* The one-time-code reset, at the API level: the happy path, and every way
   guessing is supposed to fail. */

require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const crypto = require("crypto");
const { ORIGIN } = require("./origin");

let pass = 0, fail = 0;
const failures = [];
const check = (l, c, d) => {
  if (c) { pass++; console.log("  PASS  " + l); }
  else { fail++; failures.push(l); console.log("  FAIL  " + l + (d ? "  -> " + d : "")); }
};

const api = async (p, body) => {
  const res = await fetch(ORIGIN + "/api/auth" + p, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const User = require("../server/models/User");

  const email = `otpflow${Date.now()}@example.com`;
  const OLD_PW = "OldPassw0rd1";
  const NEW_PW = "BrandNewPass9";

  await User.create({ name: "OTP Flow", email, password: OLD_PW });

  /** Read the code straight from the model — the API only ever mails it. */
  const currentCode = async () => {
    // The digits are not recoverable from the stored hash, so mint a known
    // one the same way the controller does and use that.
    const u = await User.findForOtp(email);
    return u;
  };

  console.log("\n=== 1. ASKING FOR A CODE ===");

  const asked = await api("/forgot-password", { email });
  check("-> 200", asked.status === 200, "got " + asked.status);
  check("  neutral wording, says CODE not link",
    /reset code is on its way/i.test(asked.json.message || ""), asked.json.message);
  check("  no link is returned", !asked.json.devResetUrl);

  let u = await User.findForOtp(email);
  check("a code was minted", !!u.resetOtp,
    asked.status === 429 ? "rate-limited (429)" : "nothing stored on the account");

  // The forgot-password limiter is shared with the auth-recovery and mail
  // suites, so by the time `npm test` reaches this one the window can already
  // be spent. Without this guard every later assertion dereferences null and
  // the run dies with a libuv assertion instead of saying what went wrong.
  if (!u.resetOtp) {
    console.log(
      "\n  No code was minted, so the rest of this suite cannot run." +
      (asked.status === 429
        ? "\n  The server rate-limited the request. Restart it to reset the counters,"
        : "\n  Check the server is pointed at the same MONGODB_URI as this test,") +
      "\n  then run this suite on its own:  npm run test:otp\n"
    );
    console.log("=".repeat(56));
    console.log("  " + pass + " passed, " + fail + " failed");
    failures.forEach((f) => console.log("    x " + f));
    console.log("=".repeat(56) + "\n");
    await User.deleteOne({ email });
    await mongoose.disconnect();
    process.exitCode = 1;
    return;
  }

  check("  stored as a sha256 hash, not digits",
    u.resetOtp.length === 64 && /^[a-f0-9]+$/.test(u.resetOtp), u.resetOtp.slice(0, 12));
  check("  expires in 10 minutes",
    Math.round((u.resetOtpExpires - Date.now()) / 60000) === 10,
    String(Math.round((u.resetOtpExpires - Date.now()) / 60000)));
  check("  attempt counter starts at 0", u.resetOtpAttempts === 0, String(u.resetOtpAttempts));

  const unknown = await api("/forgot-password", { email: "nobody-here@example.com" });
  check("an unknown address gets the SAME answer",
    unknown.status === 200 && unknown.json.message === asked.json.message);

  console.log("\n=== 1b. ONE CODE A MINUTE ===");

  // A new code resets the guess counter, so without a floor here a script
  // could alternate "request code / burn 5 guesses" indefinitely.
  const firstHash = u.resetOtp;
  const firstExpiry = u.resetOtpExpires.getTime();

  const tooSoon = await api("/forgot-password", { email });
  check("an immediate second request -> still a plain 200", tooSoon.status === 200,
    "got " + tooSoon.status);
  check("  with the SAME wording, so nothing is revealed",
    tooSoon.json.message === asked.json.message, tooSoon.json.message);

  u = await User.findForOtp(email);
  check("  but no new code was minted", u.resetOtp === firstHash);
  check("  and the expiry was not extended", u.resetOtpExpires.getTime() === firstExpiry);
  check("  so the original code is still the live one", !!u.resetOtp);

  // Wind the clock back past the cooldown. The issue time is derived from the
  // expiry, so moving the expiry moves the issue time with it.
  u.resetOtpExpires = new Date(Date.now() + (User.OTP_TTL_MINUTES * 60 * 1000) -
    ((User.OTP_RESEND_SECONDS + 1) * 1000));
  await u.save({ validateBeforeSave: false });

  const later = await api("/forgot-password", { email });
  check("a request past the minute IS honoured", later.status === 200);
  u = await User.findForOtp(email);
  check("  a fresh code replaces the old one", u.resetOtp !== firstHash);
  check("  and the guess counter starts over", u.resetOtpAttempts === 0,
    String(u.resetOtpAttempts));

  console.log("\n=== 2. GUESSING IS CAPPED, AND THE CODE IS BURNED ===");

  // Mint a code we know, so the wrong guesses are genuinely wrong.
  u = await User.findForOtp(email);
  const known = u.createResetOtp();
  await u.save({ validateBeforeSave: false });

  const wrong = known === "000000" ? "111111" : "000000";

  for (let i = 1; i <= 4; i += 1) {
    const r = await api("/verify-otp", { email, code: wrong });
    if (i === 1) {
      check("a wrong code -> 400", r.status === 400, "got " + r.status);
      check("  code OTP_INVALID", r.json.code === "OTP_INVALID", r.json.code);
      check("  no token is handed out", !r.json.token);
    }
  }
  u = await User.findForOtp(email);
  check("4 wrong guesses are recorded", u.resetOtpAttempts === 4, String(u.resetOtpAttempts));
  check("  the code is still alive", !!u.resetOtp);

  await api("/verify-otp", { email, code: wrong });
  u = await User.findForOtp(email);
  check("the 5th wrong guess DESTROYS the code", !u.resetOtp, String(u.resetOtp));
  check("  and clears the counter with it", u.resetOtpAttempts === 0, String(u.resetOtpAttempts));

  const afterBurn = await api("/verify-otp", { email, code: known });
  check("even the CORRECT code is now refused", afterBurn.status === 400, "got " + afterBurn.status);
  check("  no token", !afterBurn.json.token);

  console.log("\n=== 3. THE ERRORS GIVE NOTHING AWAY ===");

  const noAccount = await api("/verify-otp", { email: "ghost@example.com", code: "123456" });
  const badCode = await api("/verify-otp", { email, code: "123456" });
  check("unknown address and wrong code read identically",
    noAccount.json.error === badCode.json.error && noAccount.status === badCode.status,
    JSON.stringify([noAccount.json.error, badCode.json.error]));
  check("  no hint about attempts remaining",
    !/attempt|remaining|left|tries/i.test(JSON.stringify(badCode.json)), JSON.stringify(badCode.json));

  console.log("\n=== 4. MALFORMED CODES NEVER REACH THE COUNTER ===");

  u = await User.findForOtp(email);
  const fresh = u.createResetOtp();
  await u.save({ validateBeforeSave: false });

  for (const junk of ["12345", "1234567", "abcdef", "", "12 34 56", "-12345"]) {
    await api("/verify-otp", { email, code: junk });
  }
  u = await User.findForOtp(email);
  check("6 malformed submissions burned 0 attempts", u.resetOtpAttempts === 0,
    String(u.resetOtpAttempts));
  check("  and the real code still works later", !!u.resetOtp);

  console.log("\n=== 5. THE HAPPY PATH ===");

  const good = await api("/verify-otp", { email, code: fresh });
  check("the right code -> 200", good.status === 200, "got " + good.status + " " + JSON.stringify(good.json));
  check("  hands back a reset token", typeof good.json.token === "string" && good.json.token.length >= 32,
    String(good.json.token).slice(0, 12));

  u = await User.findForOtp(email);
  check("  the code is consumed", !u.resetOtp);
  check("  and a reset token now exists", !!u.passwordResetToken);
  check("  stored hashed, not raw",
    u.passwordResetToken !== good.json.token &&
    u.passwordResetToken === crypto.createHash("sha256").update(good.json.token).digest("hex"));

  const reused = await api("/verify-otp", { email, code: fresh });
  check("the same code cannot be used twice", reused.status === 400, "got " + reused.status);

  const done = await api("/reset-password", { token: good.json.token, password: NEW_PW });
  check("the token sets the new password -> 200", done.status === 200,
    "got " + done.status + " " + JSON.stringify(done.json));

  const oldLogin = await api("/login", { email, password: OLD_PW });
  check("  the old password no longer works", oldLogin.status === 401, "got " + oldLogin.status);
  const newLogin = await api("/login", { email, password: NEW_PW });
  check("  the new one does", newLogin.status === 200, "got " + newLogin.status);

  console.log("\n=== 6. A RESET CLEARS ANYTHING OUTSTANDING ===");

  u = await User.findForOtp(email);
  u.createResetOtp();
  await u.save({ validateBeforeSave: false });

  const u2 = await User.findForOtp(email);
  const tok = u2.createPasswordResetToken();
  await u2.save({ validateBeforeSave: false });

  await api("/reset-password", { token: tok, password: "ThirdPassw0rd7" });
  u = await User.findForOtp(email);
  check("no code survives a completed reset", !u.resetOtp, String(u.resetOtp));
  check("  and no token either", !u.passwordResetToken, String(u.passwordResetToken));

  await User.deleteOne({ email });
  await User.deleteMany({ email: /@example\.com$/ });
  await mongoose.disconnect();

  console.log("\n" + "=".repeat(56));
  console.log("  " + pass + " passed, " + fail + " failed");
  failures.forEach((f) => console.log("    x " + f));
  console.log("=".repeat(56) + "\n");
  process.exitCode = fail ? 1 : 0;
})();
