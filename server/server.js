/* =============================================================
   NovaCart — server entry point
   -------------------------------------------------------------
   Loads configuration, connects to MongoDB, and only then starts
   listening. Handles shutdown so the database connection is
   closed cleanly on Ctrl+C or a process manager stop.

   Run:  npm start      (production)
         npm run dev    (auto-restart via nodemon)
   ============================================================= */

require("dotenv").config();

const app = require("./app");
const { connectDB, disconnectDB } = require("./config/db");
const { verifyMailer } = require("./utils/mailer");
const { productionChecks } = require("./utils/env");

const PORT = Number(process.env.PORT) || 5000;

async function start() {
  // Settings whose absence is silently insecure rather than obviously
  // broken — refuse to start rather than run a subtly unsafe deployment.
  const problems = productionChecks();
  if (problems.length) {
    console.error("\n❌  Refusing to start in production mode:\n");
    problems.forEach((problem) => console.error(`    • ${problem}`));
    console.error("\n    Set them in .env, or use NODE_ENV=development locally.\n");
    process.exit(1);
  }

  try {
    await connectDB();
  } catch (error) {
    console.error("\n❌  Could not start NovaCart — database connection failed.\n");
    console.error(error.friendly || error.message);
    console.error("");
    process.exit(1);
  }

  // Fire-and-forget: a slow or unreachable mail host must not delay the
  // server from accepting requests.
  verifyMailer().catch((error) => {
    console.error("⚠️   Mail: verification failed —", error.message);
  });

  const server = app.listen(PORT, () => {
    console.log("");
    console.log("🚀  NovaCart server running");
    console.log(`    Site   →  http://localhost:${PORT}`);
    console.log(`    API    →  http://localhost:${PORT}/api/health`);
    console.log(`    Env    →  ${process.env.NODE_ENV || "development"}`);
    console.log("");
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`\n❌  Port ${PORT} is already in use.`);
      console.error("    Stop whatever is using it, or set PORT in .env to something else.\n");
      process.exit(1);
    }
    throw error;
  });

  /* ---------- Graceful shutdown ---------- */

  async function shutdown(signal) {
    console.log(`\n${signal} received — shutting down…`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    // Don't hang forever if a connection refuses to close.
    setTimeout(() => process.exit(1), 10000).unref();
  }

  ["SIGINT", "SIGTERM"].forEach((signal) => {
    process.on(signal, () => shutdown(signal));
  });

  process.on("unhandledRejection", (reason) => {
    console.error("💥  Unhandled promise rejection:", reason);
    shutdown("unhandledRejection");
  });
}

start();
