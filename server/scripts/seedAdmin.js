/* =============================================================
   NovaCart — seed the admin account
   -------------------------------------------------------------
   Creates (or repairs) the single admin account from the values
   in .env:  ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD

   Safe to run repeatedly — it syncs the account to match .env:
     • account missing    -> created
     • role not admin     -> promoted
     • name changed       -> updated
     • password changed   -> re-hashed and updated
     • already in sync    -> left alone

   The password is never written to the database in plain text —
   the User model's pre-save hook bcrypt-hashes it.

   Run:  npm run seed:admin
   ============================================================= */

require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const { connectDB, disconnectDB } = require("../config/db");
const User = require("../models/User");

async function seedAdmin() {
  const name = (process.env.ADMIN_NAME || "NovaCart Admin").trim();
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";

  if (!email || !password) {
    console.error("\n❌  ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env\n");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("\n❌  ADMIN_PASSWORD must be at least 8 characters\n");
    process.exit(1);
  }

  await connectDB();

  // +password so the stored hash can be compared against .env
  const existing = await User.findOne({ email }).select("+password");

  if (!existing) {
    const admin = await User.create({ name, email, password, role: "admin" });
    console.log(`\n✅  Admin account created`);
    console.log(`    name  : ${admin.name}`);
    console.log(`    email : ${admin.email}`);
    console.log(`    role  : ${admin.role}\n`);
  } else {
    const changes = [];

    if (existing.role !== "admin") {
      existing.role = "admin";
      changes.push("role → admin");
    }
    if (existing.name !== name) {
      existing.name = name;
      changes.push("name updated");
    }

    // Assigning the plain password lets the model's pre-save hook re-hash it.
    const passwordUnchanged = await existing.verifyPassword(password);
    if (!passwordUnchanged) {
      existing.password = password;
      changes.push("password re-hashed");
    }

    if (changes.length) {
      await existing.save();
      console.log(`\n✅  Admin account synced with .env — ${changes.join(", ")}`);
      console.log(`    email : ${existing.email}`);
      console.log(`    role  : ${existing.role}\n`);
    } else {
      console.log(`\nℹ️   Admin already matches .env: ${existing.email} — nothing to change.\n`);
    }
  }

  // Confirm the collection state so the run is self-verifying.
  const admins = await User.countDocuments({ role: "admin" });
  const customers = await User.countDocuments({ role: "customer" });
  console.log(`    users collection → ${admins} admin, ${customers} customer\n`);

  await disconnectDB();
  await mongoose.disconnect().catch(() => {});
}

seedAdmin().catch(async (error) => {
  console.error("\n❌  Seeding failed:", error.friendly || error.message, "\n");
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
