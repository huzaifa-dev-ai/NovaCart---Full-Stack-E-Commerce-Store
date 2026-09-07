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

const fs = require("fs");
const http = require("http");
const https = require("https");

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

  // ---- HTTPS in development ----------------------------------------
  // Browsers refuse card autofill on an insecure origin, and cookies marked
  // Secure are dropped, so payment work is easier to test over TLS. Set
  // SSL_KEY_PATH / SSL_CERT_PATH (or drop certs into ./certs) to enable it.
  // Production terminates TLS at the host or proxy, so this stays off there.
  function tlsOptions() {
    const keyPath = process.env.SSL_KEY_PATH || "certs/localhost-key.pem";
    const certPath = process.env.SSL_CERT_PATH || "certs/localhost-cert.pem";
    if (process.env.USE_HTTPS !== "true") { return null; }
    try {
      return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
    } catch (error) {
      console.warn(`\u26a0\ufe0f   USE_HTTPS=true but the certificate could not be read (${error.code}).`);
      console.warn("     Falling back to HTTP. Generate one with:");
      console.warn("       npm run cert\n");
      return null;
    }
  }

  const tls = tlsOptions();
  const scheme = tls ? "https" : "http";
  const server = tls ? https.createServer(tls, app) : http.createServer(app);

  server.listen(PORT, () => {
    console.log("");
    console.log("🚀  NovaCart server running");
    console.log(`    Site   →  ${scheme}://localhost:${PORT}`);
    console.log(`    API    →  ${scheme}://localhost:${PORT}/api/health`);
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

  // Shutting down is a one-way door. Without this flag the function could
  // re-enter itself without bound: it handed server.close() an ASYNC callback
  // whose promise nobody awaited, so a rejecting disconnectDB() surfaced as an
  // unhandledRejection - and the unhandledRejection handler called shutdown(),
  // which closed again, which rejected again. Measured at 200,000 re-entries
  // in five seconds, with the escape timer unable to help: an unref'd timer
  // never keeps the loop alive and never gets a turn while this spins.
  let shuttingDown = false;

  function shutdown(signal, code) {
    if (shuttingDown) { return; }
    shuttingDown = true;
    // A blank line first, so the notice is not glued to the last log entry.
    console.log("");
    console.log(signal + " received - shutting down...");

    // Armed BEFORE anything that can fail, and deliberately NOT unref'd: it is
    // the only guarantee the process ever leaves, so it has to hold the event
    // loop open long enough to fire.
    const escape = setTimeout(function () {
      console.error("Shutdown timed out - exiting anyway.");
      process.exit(code === undefined ? 1 : code);
    }, 10000);

    server.close(function () {
      // The callback stays synchronous. Its own failure is handled here
      // rather than escaping as a rejection nobody is waiting for.
      disconnectDB()
        .catch(function (error) {
          console.error("Database did not close cleanly:", error.message);
        })
        .then(function () {
          clearTimeout(escape);
          process.exit(code === undefined ? 0 : code);
        });
    });
  }

  ["SIGINT", "SIGTERM"].forEach((signal) => {
    process.on(signal, () => shutdown(signal));
  });

  // A crash exits non-zero, so a supervisor can tell it from a clean stop.
  process.on("unhandledRejection", function (reason) {
    console.error("Unhandled promise rejection:", reason);
    shutdown("unhandledRejection", 1);
  });

  process.on("uncaughtException", function (error) {
    console.error("Uncaught exception:", error);
    shutdown("uncaughtException", 1);
  });
}

start();
