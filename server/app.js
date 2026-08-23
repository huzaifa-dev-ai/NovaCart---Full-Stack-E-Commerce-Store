/* =============================================================
   NovaCart — Express application
   -------------------------------------------------------------
   The app is built here and started in server.js. Keeping them
   apart means the app can be imported (by tests, or a serverless
   handler) without a port being opened as a side effect.
   ============================================================= */

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

const { connectionState } = require("./config/db");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Rate limiters key on req.ip. Behind a proxy (Render, Railway, nginx)
// that would otherwise be the proxy's own address for every visitor.
app.set("trust proxy", 1);

// Don't advertise the framework.
app.disable("x-powered-by");

/* ---------- Security headers ---------- */

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Google Fonts serves the stylesheet from googleapis and the font
        // files from gstatic.
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        // 'unsafe-inline' is needed for the inline onerror image fallbacks in
        // the markup. Removing those attributes would let this be tightened.
        scriptSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    },
    // Would block the cross-origin Google Fonts requests.
    crossOriginEmbedderPolicy: false
  })
);

/* ---------- Core middleware ---------- */

app.use(
  cors({
    origin: true,          // reflect the requesting origin
    credentials: true      // required for the auth cookie to travel
  })
);
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(cookieParser());

// One-line request log — enough to see what the frontend is calling.
app.use((req, _res, next) => {
  if (req.path.startsWith("/api")) {
    console.log(`${req.method} ${req.originalUrl}`);
  }
  next();
});

/* ---------- API ---------- */

/**
 * GET /api/health
 * Liveness probe — also reports whether MongoDB is actually connected,
 * which makes "is the database up?" answerable from the browser.
 */
app.get("/api/health", (_req, res) => {
  const database = connectionState();
  res.status(database === "connected" ? 200 : 503).json({
    status: database === "connected" ? "ok" : "degraded",
    service: "novacart-api",
    database,
    uptime: Number(process.uptime().toFixed(1)),
    timestamp: new Date().toISOString()
  });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/contact", require("./routes/contact"));
app.use("/api/products", require("./routes/products"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/returns", require("./routes/returns"));
app.use("/api/admin", require("./routes/admin"));


/* ---------- Static frontend ---------- */
// ONLY public/ is web-served. Pointing this at the project root would also
// expose server/*.js, package.json and node_modules — an allowlist by
// directory is safer than trying to deny paths one at a time.
const FRONTEND_DIR = path.join(__dirname, "..", "public");

app.use(
  express.static(FRONTEND_DIR, {
    extensions: ["html"],          // /products  ->  products.html
    index: "index.html",
    dotfiles: "deny"               // never serve .env and friends
  })
);

/* ---------- Fallbacks ---------- */

// Unknown API route -> JSON 404 (never the HTML page).
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, error: "Not found", path: req.originalUrl });
});

// Anything else that isn't a static file is genuinely missing. Serving the
// homepage with a 200 would make typos look like they worked.
app.use((req, res, next) => {
  if (req.method !== "GET") { return next(); }
  res.status(404).sendFile(path.join(FRONTEND_DIR, "404.html"));
});

/* ---------- Errors (must be last) ---------- */

app.use(errorHandler);

module.exports = app;
