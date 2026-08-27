/* =============================================================
   NovaCart — User model
   -------------------------------------------------------------
   Stored in the "users" collection.

   Security notes:
     • `password` holds a bcrypt hash, never the plain text, and
       carries select:false so it is excluded from every query
       unless explicitly asked for with .select("+password").
     • `role` is NEVER accepted from a request body. The register
       controller decides it, so nobody can grant themselves admin
       by posting {"role":"admin"}.
     • toJSON strips the hash and __v, so a User can be sent to
       the client directly without leaking anything.
   ============================================================= */

const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const BCRYPT_ROUNDS = 12;

// One-time reset code. These three numbers ARE the security of this flow:
// six digits is a million possibilities, so a generous cap or a long life
// would put a working code within reach of a patient script.
const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

// How long before another code can be issued. Not only anti-spam: every new
// code resets the guess counter above, so without a floor here a script could
// alternate "request code / burn 5 guesses" as fast as the mail server allows.
const OTP_RESEND_SECONDS = 60;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [60, "Name must be 60 characters or fewer"]
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [254, "Email is too long"],
      match: [EMAIL_PATTERN, "Please provide a valid email address"]
    },

    // Optional, because a Google account has no password here at all —
    // required only when this account signs in with one. Storing an empty
    // string or a dummy hash instead would leave something to brute-force.
    password: {
      type: String,
      required: [
        function passwordRequired() { return this.authProvider === "local"; },
        "Password is required"
      ],
      minlength: [8, "Password must be at least 8 characters"],
      select: false
    },

    /* ---------- Federated sign-in ---------- */

    // Which method created the account. Note that this is NOT the check
    // for "can they use a password" — a Google user who later sets one
    // through the reset flow keeps authProvider "google". Anything
    // deciding whether a password login is possible must look at the
    // presence of `password`, not at this field.
    authProvider: {
      type: String,
      enum: { values: ["local", "google"], message: "Unknown sign-in provider" },
      default: "local"
    },

    // Google's `sub` claim: stable, unique, and never reassigned — unlike
    // an email address, which someone can change. Left undefined (not null)
    // for password accounts so the partial index below ignores them.
    googleId: { type: String, default: undefined },

    googleLinkedAt: { type: Date, default: null },

    // Google profile photo. Stored as a URL rather than the image itself:
    // people change their picture, and a cached copy would go stale. Only
    // ever a googleusercontent.com address — see safeAvatar() in
    // googleAuthController, which refuses anything else before it is saved.
    avatar: { type: String, default: "" },

    role: {
      type: String,
      enum: {
        values: ["customer", "admin"],
        message: "Role must be either customer or admin"
      },
      default: "customer"
    },

    lastLoginAt: { type: Date, default: null },

    // Set whenever the password changes. Kept for the audit trail and as
    // the fallback check for tokens issued before passwordVersion existed.
    passwordChangedAt: { type: Date, default: null },

    // Bumped on every password change. This -- not the timestamp -- is what
    // actually invalidates old sessions.
    //
    // A JWT's `iat` is whole seconds, so comparing it against a timestamp
    // cannot tell apart a token issued at 10.2s from a password changed at
    // 10.8s: both floor to 10. Any session created in the same second as
    // the change therefore survived it. An integer that only ever counts
    // up has no such resolution to lose.
    passwordVersion: { type: Number, default: 0 },

    // Only the SHA-256 hash of the reset token is stored. If the database
    // leaked, the hashes still could not be used to reset anyone.
    //
    // This token is no longer emailed. It is what a *verified* one-time code
    // is exchanged for, so the password-setting step stays exactly as it was.
    passwordResetToken: { type: String, default: null, select: false },
    passwordResetExpires: { type: Date, default: null, select: false },

    /* ---------- One-time reset code ---------- */
    //
    // A 6-digit code is a very different proposition from a 32-byte token:
    // there are only a million of them, so the code alone is not the control.
    // What makes this safe is the combination of a short life, a hard cap on
    // guesses, and the code being destroyed once that cap is hit. Change any
    // one of those and this becomes brute-forceable.
    resetOtp: { type: String, default: null, select: false },        // sha256, never the digits
    resetOtpExpires: { type: Date, default: null, select: false },
    resetOtpAttempts: { type: Number, default: 0, select: false }
  },
  {
    timestamps: true,          // createdAt = when they joined
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      }
    }
  }
);

/* ---------- Indexes ---------- */

// Partial rather than sparse: sparse skips *missing* fields but still
// indexes explicit nulls, so one stray null would block every other.
userSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: "string" } } }
);

/* ---------- Hooks ---------- */

// Hash on create, and on any later password change.
userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) { return next(); }

  // Clearing the password (linking a Google identity onto an unverified
  // local account) marks the path modified with nothing to hash. Let the
  // caller stamp passwordChangedAt/passwordVersion itself in that case.
  if (!this.password) { return next(); }
  try {
    this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);

    // Stamp the change so older tokens stop working — but not on the very
    // first save, or the brand-new signup token would be invalid instantly.
    if (!this.isNew) {
      this.passwordChangedAt = new Date();
      this.passwordVersion = (this.passwordVersion || 0) + 1;
    }
    next();
  } catch (error) {
    next(error);
  }
});

/* ---------- Instance methods ---------- */

/**
 * Constant-time comparison via bcrypt.
 * @returns {Promise<boolean>}
 */
userSchema.methods.verifyPassword = function verifyPassword(candidate) {
  if (!this.password) {
    throw new Error("verifyPassword called on a document loaded without +password");
  }
  return bcrypt.compare(candidate, this.password);
};

/** The shape the frontend is allowed to see. */
userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    joinedAt: this.createdAt,
    authProvider: this.authProvider,
    avatar: this.avatar || "",
    // Lets the UI hide "Change password" on an account that has none.
    // Only ever true/false — the hash itself is never serialised.
    hasPassword: !!this.password
  };
};

/**
 * Was this token issued before the password last changed?
 * @param {number} issuedAtSeconds  the JWT's `iat` claim
 */
userSchema.methods.passwordChangedAfter = function passwordChangedAfter(issuedAtSeconds) {
  if (!this.passwordChangedAt) { return false; }
  return Math.floor(this.passwordChangedAt.getTime() / 1000) > issuedAtSeconds;
};

/**
 * Should a token bearing this password version still be accepted?
 *
 * @param {number|undefined} tokenVersion the JWT's `pwv` claim
 * @param {number} issuedAtSeconds        the JWT's `iat`, for the fallback
 */
userSchema.methods.sessionIsStale = function sessionIsStale(tokenVersion, issuedAtSeconds) {
  // Tokens minted before this field existed carry no `pwv`. Fall back to
  // the timestamp rather than signing everyone out on deploy.
  if (typeof tokenVersion !== "number") {
    return this.passwordChangedAfter(issuedAtSeconds);
  }
  return tokenVersion !== (this.passwordVersion || 0);
};

/**
 * Issue a single-use password reset token.
 * Returns the RAW token (emailed to the user); only its hash is stored,
 * so possession of the database does not allow resetting an account.
 * @returns {string} raw token
 */
userSchema.methods.createPasswordResetToken = function createPasswordResetToken() {
  const raw = crypto.randomBytes(32).toString("hex");

  this.passwordResetToken = crypto.createHash("sha256").update(raw).digest("hex");
  this.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);   // 30 minutes

  return raw;
};

/**
 * Issue a 6-digit reset code.
 *
 * Returns the RAW digits, which go out by email and are never stored — only
 * their hash is, exactly as with the reset token. Any code already
 * outstanding is replaced, and the guess counter resets with it.
 *
 * @returns {string} six digits
 */
userSchema.methods.createResetOtp = function createResetOtp() {
  // randomInt, not Math.random: this is a credential, and a predictable one
  // would let anyone reset any account. The range is exact, so every code is
  // equally likely — no modulo bias.
  const code = String(crypto.randomInt(0, 1000000)).padStart(OTP_LENGTH, "0");

  this.resetOtp = crypto.createHash("sha256").update(code).digest("hex");
  this.resetOtpExpires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  this.resetOtpAttempts = 0;

  return code;
};

/**
 * Is enough time past to issue another code?
 *
 * The issue time is derived from the expiry rather than stored separately —
 * they are set together in createResetOtp, so one implies the other.
 *
 * @returns {boolean}
 */
userSchema.methods.canIssueResetOtp = function canIssueResetOtp() {
  if (!this.resetOtpExpires) { return true; }
  const issuedAt = this.resetOtpExpires.getTime() - OTP_TTL_MINUTES * 60 * 1000;
  return Date.now() - issuedAt >= OTP_RESEND_SECONDS * 1000;
};

/** Forget any outstanding code — used once it is spent, or burnt out. */
userSchema.methods.clearResetOtp = function clearResetOtp() {
  this.resetOtp = null;
  this.resetOtpExpires = null;
  this.resetOtpAttempts = 0;
};

/**
 * Check a submitted code.
 *
 * The caller must save the document afterwards either way: a wrong guess
 * has to be *recorded*, or the cap means nothing and the code can be walked
 * through a million tries.
 *
 * @param {string} candidate
 * @returns {{ok: boolean, reason: string}} reason is for logs, never the user
 */
userSchema.methods.verifyResetOtp = function verifyResetOtp(candidate) {
  if (!this.resetOtp || !this.resetOtpExpires) {
    return { ok: false, reason: "NO_OTP" };
  }

  if (this.resetOtpExpires.getTime() < Date.now()) {
    this.clearResetOtp();
    return { ok: false, reason: "EXPIRED" };
  }

  if ((this.resetOtpAttempts || 0) >= OTP_MAX_ATTEMPTS) {
    // Burn it rather than merely refusing: leaving a live code behind an
    // exhausted counter invites someone to wait for a reset and try again.
    this.clearResetOtp();
    return { ok: false, reason: "TOO_MANY_ATTEMPTS" };
  }

  const digits = String(candidate || "").trim();
  const hashed = crypto.createHash("sha256").update(digits).digest("hex");

  // Both sides are fixed-length hex of the same length, so this is a safe
  // constant-time comparison — no early exit to time.
  const matches = digits.length === OTP_LENGTH &&
    crypto.timingSafeEqual(Buffer.from(hashed, "hex"), Buffer.from(this.resetOtp, "hex"));

  if (!matches) {
    this.resetOtpAttempts = (this.resetOtpAttempts || 0) + 1;
    if (this.resetOtpAttempts >= OTP_MAX_ATTEMPTS) { this.clearResetOtp(); }
    return { ok: false, reason: "MISMATCH" };
  }

  this.clearResetOtp();                    // single use
  return { ok: true, reason: "OK" };
};

/* ---------- Statics ---------- */

/** Lookup with the one-time code fields, which are select:false by default. */
userSchema.statics.findForOtp = function findForOtp(email) {
  return this.findOne({ email: String(email || "").trim().toLowerCase() })
    .select("+resetOtp +resetOtpExpires +resetOtpAttempts +passwordResetToken +passwordResetExpires");
};

/** Case-insensitive lookup, with the hash included for verification. */
userSchema.statics.findForAuth = function findForAuth(email) {
  return this.findOne({ email: String(email || "").trim().toLowerCase() }).select("+password");
};

/** Look up by Google's stable subject id. */
userSchema.statics.findByGoogleId = function findByGoogleId(sub) {
  const id = String(sub || "").trim();
  return id ? this.findOne({ googleId: id }) : null;
};

/**
 * Find the account holding an unexpired reset token.
 * The raw token is hashed before lookup, matching how it was stored.
 */
userSchema.statics.findByResetToken = function findByResetToken(rawToken) {
  const hashed = crypto.createHash("sha256").update(String(rawToken || "")).digest("hex");
  return this.findOne({
    passwordResetToken: hashed,
    passwordResetExpires: { $gt: new Date() }
  }).select("+password +passwordResetToken +passwordResetExpires");
};

userSchema.statics.OTP_LENGTH = OTP_LENGTH;
userSchema.statics.OTP_TTL_MINUTES = OTP_TTL_MINUTES;
userSchema.statics.OTP_MAX_ATTEMPTS = OTP_MAX_ATTEMPTS;
userSchema.statics.OTP_RESEND_SECONDS = OTP_RESEND_SECONDS;

module.exports = mongoose.model("User", userSchema);
