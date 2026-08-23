/* =============================================================
   NovaCart — MongoDB connection (Mongoose)
   -------------------------------------------------------------
   One place that owns the database connection. server.js waits
   for connectDB() to resolve before it starts listening, so the
   API is never reachable while the database is still down.
   ============================================================= */

const mongoose = require("mongoose");

/** Human-readable name for mongoose's numeric readyState. */
const STATES = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting"
};

function connectionState() {
  return STATES[mongoose.connection.readyState] || "unknown";
}

/**
 * Turn driver errors into something actionable instead of a stack trace.
 * These two account for nearly every failure during local development.
 */
function explain(error, uri) {
  const message = String(error && error.message);

  if (message.includes("ECONNREFUSED")) {
    return [
      "Could not reach MongoDB — nothing is listening at that address.",
      "",
      "  • Running MongoDB locally? Make sure the server is started:",
      "      net start MongoDB            (Windows service)",
      '      "C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\mongod.exe" --dbpath <folder>',
      "",
      "  • Using MongoDB Atlas? Put your connection string in .env as MONGODB_URI."
    ].join("\n");
  }

  if (message.includes("Authentication failed") || message.includes("bad auth")) {
    return "MongoDB rejected the credentials in MONGODB_URI — check the username and password.";
  }

  if (message.includes("ENOTFOUND") || message.includes("querySrv")) {
    return [
      "The MongoDB host in MONGODB_URI could not be resolved.",
      "Check the cluster address, and that this machine is online.",
      `URI host: ${uri.replace(/\/\/[^@]*@/, "//<credentials>@")}`
    ].join("\n");
  }

  return message;
}

/**
 * Connect to MongoDB. Resolves once the connection is usable.
 * @returns {Promise<typeof mongoose>}
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.example to .env and fill it in."
    );
  }

  // Fail in seconds rather than the 30s default — a wrong URI should
  // tell you immediately, not look like a hang.
  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000
    });
  } catch (error) {
    error.friendly = explain(error, uri);
    throw error;
  }

  // Log the database name, never the credentials.
  const { host, port, name } = mongoose.connection;
  console.log(`✅  MongoDB connected — database "${name}" on ${host}:${port}`);

  mongoose.connection.on("error", (err) => {
    console.error("⚠️   MongoDB error:", err.message);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("⚠️   MongoDB disconnected — Mongoose will retry automatically.");
  });

  mongoose.connection.on("reconnected", () => {
    console.log("✅  MongoDB reconnected.");
  });

  return mongoose;
}

/** Close the connection cleanly on shutdown. */
async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    console.log("👋  MongoDB connection closed.");
  }
}

module.exports = { connectDB, disconnectDB, connectionState };
