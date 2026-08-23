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

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false
    },

    role: {
      type: String,
      enum: {
        values: ["customer", "admin"],
        message: "Role must be either customer or admin"
      },
      default: "customer"
    },

    lastLoginAt: { type: Date, default: null },

    // Set whenever the password changes. protect() rejects any token
    // issued before this moment, so a reset or change signs out every
    // device that was already holding a session.
    passwordChangedAt: { type: Date, default: null },

    // Only the SHA-256 hash of the reset token is stored. If the database
    // leaked, the hashes still could not be used to reset anyone.
    passwordResetToken: { type: String, default: null, select: false },
    passwordResetExpires: { type: Date, default: null, select: false }
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

/* ---------- Hooks ---------- */

// Hash on create, and on any later password change.
userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) { return next(); }
  try {
    this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);

    // Stamp the change so older tokens stop working — but not on the very
    // first save, or the brand-new signup token would be invalid instantly.
    if (!this.isNew) {
      // One second back, because the JWT's `iat` is whole seconds and can
      // otherwise land a hair before this timestamp.
      this.passwordChangedAt = new Date(Date.now() - 1000);
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
    joinedAt: this.createdAt
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

/* ---------- Statics ---------- */

/** Case-insensitive lookup, with the hash included for verification. */
userSchema.statics.findForAuth = function findForAuth(email) {
  return this.findOne({ email: String(email || "").trim().toLowerCase() }).select("+password");
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

module.exports = mongoose.model("User", userSchema);
