/* =============================================================
   NovaCart — Express application
   -------------------------------------------------------------
   The app is built here and started in server.js. Keeping them
   apart means the app can be imported (by tests, or a serverless
   handler) without a port being opened as a side effect.
   ============================================================= */

const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

const { connectionState } = require("./config/db");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Rate limiters key on req.ip. Behind a proxy (Render, Railway, nginx) that
// would otherwise be the proxy's own address for every visitor, so the hop
// count has to be declared.
//
// But trusting a proxy that ISN'T there is far worse than not trusting one:
// req.ip then comes from the X-Forwarded-For header, which the caller writes.
// Rotating it defeats every limiter in this app — login brute-force,
// registration, password reset, the contact form. Measured before this was
// made conditional: 10 of 14 plain attempts blocked, 0 of 25 blocked when
// spoofing the header.
//
// So it stays OFF unless the deployment explicitly declares a proxy.
if (process.env.TRUST_PROXY) {
  const hops = process.env.TRUST_PROXY;
  app.set("trust proxy", /^\d+$/.test(hops) ? Number(hops) : hops);
}

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
        // Google profile photos are served from googleusercontent.com. Scoped
        // to that host rather than opening img-src to the web.
        // "blob:" lets the admin picker draw a chosen file into a canvas
        // before upload. A blob URL can only be minted by this page's own
        // script and is same-origin, so it widens nothing an attacker reaches.
        imgSrc: ["'self'", "data:", "blob:", "https://*.googleusercontent.com"],
        // 'unsafe-inline' is needed for the inline onerror image fallbacks in
        // the markup. Removing those attributes would let this be tightened.
        scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
        connectSrc: ["'self'", "https://api.stripe.com"],
        frameSrc: ["'self'", "https://js.stripe.com"],
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
// A product photo arrives as base64 inside a JSON body, so this one admin
// route needs more room than the 100kb the rest of the API gets. It is
// mounted BEFORE the global parser on purpose: body-parser marks the body as
// read, so the 100kb parser below skips it. Mounted after, the global limit
// would reject the upload before the route ever saw it.
app.use("/api/admin/products/image", express.json({ limit: "6mb" }));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(cookieParser());

// One-line request log — enough to see what the frontend is calling.
//
// Auth routes log the PATH ONLY. Their query strings carry live credentials:
// the Google callback arrives as ?code=<one-time auth code>&state=<CSRF
// token>, and writing those to a log file puts working secrets somewhere
// they will outlive their own expiry.
app.use((req, _res, next) => {
  if (req.path.startsWith("/api")) {
    const sensitive = req.path.startsWith("/api/auth");
    console.log(`${req.method} ${sensitive ? req.path : req.originalUrl}`);
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
app.use("/api/payments", require("./routes/payments"));
app.use("/api/returns", require("./routes/returns"));
app.use("/api/admin", require("./routes/admin"));


/* ---------- Static frontend ---------- */
// ONLY public/ is web-served. Pointing this at the project root would also
// expose server/*.js, package.json and node_modules — an allowlist by
// directory is safer than trying to deny paths one at a time.
const FRONTEND_DIR = path.join(__dirname, "..", "public");

/*  Card thumbnails, with the full-size image as a standing fallback.

    Product cards ship a srcset naming a 550px copy under framed/thumb/ and
    the full-size original. That copy is generated in bulk, so any picture an
    admin points a colour at afterwards has no thumbnail - and because the
    browser prefers the small candidate for a card-sized slot, it asks for a
    file that is not there and the card renders broken. The product page,
    which uses the full-size path directly, looks fine, which makes it a
    confusing thing to be told about.

    Rather than ask whoever edits a product to remember to generate a
    thumbnail, the missing one resolves to the full-size image here. The card
    then costs more bytes than it should until a thumbnail is generated, but
    it is never broken. Correctness first, weight second.                    */
const THUMB_PREFIX = "/assets/images/products/framed/thumb/";

app.use(THUMB_PREFIX, (req, res, next) => {
  // req.path is already URL-decoded by Express.
  const name = path.basename(req.path);
  // basename() strips any traversal, and this refuses anything that still
  // looks like one rather than trusting that.
  if (!name || name.includes("..") || name !== req.path.replace(/^\//, "")) {
    return next();
  }

  const thumb = path.join(FRONTEND_DIR, "assets/images/products/framed/thumb", name);
  fs.access(thumb, fs.constants.R_OK, (missing) => {
    if (!missing) { return next(); }        // the real thumbnail exists
    const full = path.join(FRONTEND_DIR, "assets/images/products/framed", name);
    fs.access(full, fs.constants.R_OK, (alsoMissing) => {
      if (alsoMissing) { return next(); }   // neither exists: a genuine 404
      res.sendFile(full);
    });
  });
});
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
