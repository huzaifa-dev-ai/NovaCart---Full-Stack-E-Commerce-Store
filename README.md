# NovaCart

A full stack e-commerce store built for the **CodeAlpha Full Stack Development internship**.

Customers browse a 56-product catalog, pick a colour, add to a cart, pay by card or on
delivery, track their orders and request returns. Administrators manage products, colours,
orders, returns and users from a dedicated dashboard. Everything is backed by MongoDB and
a REST API.

**Stack** — Vanilla HTML5 / CSS3 / JavaScript on the front end (no frameworks, no build
step) · Node.js + Express 5 · MongoDB + Mongoose · JWT auth in httpOnly cookies · Stripe ·
Nodemailer

---

## A look at it

| | |
|---|---|
| ![The storefront](docs/screenshots/storefront.png) | ![The catalog](docs/screenshots/catalog.png) |
| **Storefront** — the landing page | **Catalog** — 56 products, 13 category filters, colour swatches on every card |
| ![A product](docs/screenshots/product.png) | ![The admin dashboard](docs/screenshots/admin.png) |
| **Product** — colour picker, live stock, related items | **Admin** — revenue, stock alerts and fulfilment at a glance |

Every shot is a real page, captured from a clean `npm run seed`.

---

## Features

### Storefront
- **Product listing** — 56 products across 13 categories, with search, category filters and sorting
- **Product details** — full description, feature list, stock state, quantity selector, related products
- **Colour variants** — every product carries selectable colours, each with its own swatch,
  photo and independent stock count. The choice follows the item into the cart, onto the
  order, and back out through a return, which restocks that colour rather than the product
- **Cart** — quantity editing, live totals, free-shipping progress bar, stock-aware limits
- **Checkout** — validated customer form, order summary, server-priced totals
- **Payments** — Cash on Delivery, or card via Stripe Elements. The card form is mounted by
  Stripe, so card numbers never reach this server. An order is marked paid only after the
  server re-fetches the PaymentIntent from Stripe and sees it succeeded — the browser is
  never believed. With no Stripe keys configured the card option falls back to a simulated
  approval, so the whole flow stays demoable without an account
- **Order success** — order number and recap, fetched from the API
- **Order history** — track deliveries, view past orders, start a return within 30 days
- **Accounts** — register, sign in, password reset by email, change password
- **Sign in with Google** — optional OAuth 2.0 + PKCE, run entirely server-side, with the
  Google profile photo in the header. Sign-in admits only existing accounts and
  registration only new ones, decided on the server

### Admin dashboard
- **Overview** — revenue, orders, customers, stock alerts, open returns, recent activity
- **Products** — create, edit, archive, restock; search and filter
- **Colours** — add or remove a colour, set its name and swatch, choose which one shows
  first, and hold a separate stock count per colour. Product photos can be uploaded
  straight from the device rather than typed in as a path
- **Orders** — advance orders through fulfilment with a validated status flow and audit trail
- **Returns** — approve, reject or refund, with automatic restocking
- **Users** — view accounts with order counts and spend, change roles, remove accounts

---

## Getting started

### Prerequisites
- **Node.js 18+**
- **MongoDB** — a local install, or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster

### 1. Install

```bash
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Then open `.env` and fill it in:

| Variable | Required | What it does |
|---|---|---|
| `PORT` | | Port to listen on (default `5000`) |
| `NODE_ENV` | | `development` locally, `production` when deployed |
| `APP_URL` | in production | Public origin, e.g. `https://novacart.example`. Used to build password-reset links |
| `MONGODB_URI` | ✅ | Connection string |
| `JWT_SECRET` | ✅ | 32+ random characters — generate one with the command below |
| `JWT_EXPIRES_IN` | | Session length with "keep me signed in" (default `30d`) |
| `JWT_SESSION_EXPIRES_IN` | | Session length *without* it (default `1d`) |
| `JWT_COOKIE_DAYS` | | How long the cookie itself lives (default `30`) |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | ✅ | The single admin account, created by the seed script |
| `SMTP_*` | | Mail delivery. Leave `SMTP_HOST` empty to log emails to the console instead |
| `MAIL_ETHEREAL` | | `true` uses a throwaway [Ethereal](https://ethereal.email) inbox — a real SMTP round trip with no credentials, preview URLs logged |
| `CONTACT_TO` | | Where contact-form messages are sent (defaults to `ADMIN_EMAIL`) |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` | | Card payments. Leave empty and the card option falls back to a simulated approval |
| `STRIPE_WEBHOOK_SECRET` | | Verifies Stripe webhook signatures |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | | Google Sign-In. Leave both blank to hide the button — see [2b](#2b-google-sign-in-optional) |
| `USE_HTTPS` | | `true` serves the site over TLS locally — see [Local HTTPS](#local-https-optional) |
| `SSL_KEY_PATH` / `SSL_CERT_PATH` | | Where `npm run cert` writes the certificate (default `certs/`) |
| `TRUST_PROXY` | | Proxy hops to trust, usually `1`. Set this **only** behind a real proxy: trusting one that isn't there lets any caller forge their IP and walk past every rate limit |

Generate a strong JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 2b. Google Sign-In (optional)

The site works fully without this — the button simply isn't shown.

1. Open the [Google Cloud console credentials page](https://console.cloud.google.com/apis/credentials)
   and create a project if you don't have one.
2. Configure the **OAuth consent screen** (External, "Testing" is fine) and add your own
   Google address under **Test users**.
3. Create an **OAuth client ID** of type **Web application**.
4. Under **Authorized redirect URIs** add this exact string:

   ```
   http://localhost:5000/api/auth/google/callback
   ```

   It must match `APP_URL` character for character, including the scheme and port, or
   Google answers `redirect_uri_mismatch`. That is the `http://` form because
   `.env.example` ships `APP_URL=http://localhost:5000` and `USE_HTTPS=false`. If you turn
   on [local HTTPS](#local-https-optional), register the `https://` variant to match — or
   add both and switch `APP_URL` freely.
5. Put the two values in `.env`:

   ```ini
   GOOGLE_CLIENT_ID=…apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=…
   ```

6. Restart the server. The **Continue with Google** button appears on the sign-in and
   registration pages.

#### The two buttons are different doors

They are not interchangeable, and the server decides — not the page:

| Page | Button | Admits | Refuses |
|---|---|---|---|
| `login.html` | **Continue with Google** | accounts that already exist | a Google account with no NovaCart account &rarr; sent to **register.html** |
| `register.html` | **Sign up with Google** | Google accounts that are new here | someone who already has an account &rarr; sent to **login.html** |

"Already exists" means matched by Google's `sub` **or** by email address, so someone who
signed up with a password is an existing user even though they have never touched Google.

Two things make this hold up:

- **A refused attempt writes nothing.** Both lookups run before any document is created or
  saved, so a refusal leaves no half-made account and no touched timestamps.
- **The intent is sealed in the state cookie**, not read from the callback's query string.
  Appending `&intent=register` on the way back from Google does not flip the gate. Each
  page also carries its gate in the link's own `href`, so a middle-click or *open in new
  tab* runs the same door a normal click would, and a request that states **no** intent is
  refused outright rather than guessed — neither side is a safe default, since one links an
  existing account and the other creates one.

A refusal keeps `?next=`, so someone bounced from one door to the other still lands where
they were originally headed once they get in.

#### Linking

Signing in with an address that already has a NovaCart account links the two, so there is
one account either way. Note the linking rule in [Security](#security): if you were not
already signed in, the existing password is switched off and the account becomes
Google-only (recoverable with **Forgot password**). To keep both, sign in with your
password first, then click **Continue with Google**.

The Google profile photo is shown in the header next to your name. It is loaded straight
from `googleusercontent.com` — allowed explicitly in the Content-Security-Policy, requested
with `referrerpolicy="no-referrer"` so Google is not told which page you are on, and it
falls back to a lettered circle if the image ever fails to load.

---

### 3. Seed the database

```bash
npm run seed          # admin account + all 56 products
```

Or individually:

```bash
npm run seed:admin            # create/sync the admin account from .env
npm run seed:products         # load the catalog
npm run seed:products -- --fresh   # wipe the collection first
```

Both are idempotent — re-running reports what changed and leaves the rest alone.

### 4. Run

```bash
npm run dev     # auto-restarts on save (nodemon)
npm start       # plain node
```

Open **http://localhost:5000** — Express serves the site and the API from one origin.

### Local HTTPS (optional)

Browsers disable card autofill on insecure origins, so serving the site over TLS locally
makes the payment pages behave the way they will in production.

```bash
npm run cert    # writes certs/localhost-key.pem and certs/localhost-cert.pem
```

Then set `USE_HTTPS=true` and `APP_URL=https://localhost:5000` in `.env` and restart. The
certificate is self-signed, so the browser will ask you to accept it once. `certs/` is
gitignored — private keys are never committed. Leave `USE_HTTPS=false` and everything runs
over plain HTTP, which is the default.

---

## Brand assets

The mark lives in `public/assets/icons/`, generated from `Favicon.png` in the
project root. The source has a **black** surround rather than transparency, so
the build measures the rounded tile and cuts the corners properly — left as-is
it shows black wedges on a browser tab or an iOS home screen.

| File | Used for |
|---|---|
| `public/favicon.ico` | 16/32/48, at the web root for the path browsers probe first |
| `favicon-16.png` / `favicon-32.png` | modern `<link rel="icon">` |
| `apple-touch-icon.png` | iOS home screen — flattened on the navy, since iOS ignores alpha |
| `icon-192.png` / `icon-512.png` | `site.webmanifest`, Android / install prompt |
| `logo-mark.png` | the in-page brand mark, at 2x its 38px slot |

The same artwork is the brand mark everywhere it appears: the header, the
footer, and the badge at the top of every auth card. The cards are told apart
by their headings rather than by different icons.

---

## Project structure

```
NovaCart/
├── public/                    everything served to the browser
│   ├── *.html                 16 pages
│   ├── css/style.css          one stylesheet, design tokens at the top
│   ├── js/                    one module per page + shared helpers
│   └── assets/images/         hero art and product photography
├── server/
│   ├── server.js              entry point: config checks → DB → listen
│   ├── app.js                 Express app: middleware, routes, static, errors
│   ├── config/db.js           Mongoose connection + friendly diagnostics
│   ├── models/                User, Product, Order, Return
│   ├── controllers/           auth, product, order, return, admin
│   ├── routes/                one router per resource
│   ├── middleware/            auth guards, validation, error handler
│   ├── utils/                 JWT, mailer, email templates, env helpers
│   └── scripts/               seed scripts + the original catalog data
├── tests/                     API test suites
├── .env                       your configuration (never committed)
└── .env.example               template
```

Only `public/` is web-served. Server code, `package.json` and `node_modules` are not
reachable over HTTP.

---

## API

### Auth
| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | public | Create an account |
| POST | `/api/auth/login` | public | Start a session |
| POST | `/api/auth/logout` | public | End a session |
| GET | `/api/auth/me` | signed in | Current user |
| POST | `/api/auth/forgot-password` | public | Email a 6-digit reset code |
| POST | `/api/auth/verify-otp` | public | Exchange the emailed code for a reset token |
| POST | `/api/auth/reset-password` | public | Set a new password with the token |
| PATCH | `/api/auth/password` | signed in | Change password |
| GET | `/api/auth/google` | public | Start Google Sign-In (redirect) |
| GET | `/api/auth/google/callback` | public | Google returns the user here |
| GET | `/api/auth/google/status` | public | Is Google Sign-In configured? |

### Products
| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/products` | public | List, with `category`, `badge`, `search`, `featured`, `inStock`, `sort`, `page`, `limit` |
| GET | `/api/products/categories` | public | Category names with counts |
| GET | `/api/products/:id` | public | One product plus related items |

### Orders & returns
| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/orders` | public | Place an order |
| GET | `/api/orders/mine` | signed in | The customer's orders |
| GET | `/api/orders/:number` | owner / admin | One order |
| GET | `/api/orders` | **admin** | All orders |
| PATCH | `/api/orders/:id` | **admin** | Advance the status |
| POST | `/api/returns` | signed in | Request a return |
| GET | `/api/returns/mine` | signed in | The customer's returns |
| GET | `/api/returns` | **admin** | All returns |
| PATCH | `/api/returns/:id` | **admin** | Approve / reject / refund |

### Payments
| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/payments/config` | public | Which methods are on, plus the Stripe publishable key |
| POST | `/api/payments/create-intent` | signed in | Open a Stripe PaymentIntent for an order |
| POST | `/api/payments/verify` | signed in | Re-fetch the intent from Stripe and mark the order paid |
| POST | `/api/payments/simulate` | signed in | Approve without Stripe, for when no keys are set |
| POST | `/api/payments/webhook` | Stripe | Signed webhook, on the raw body |

### Admin
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/admin/stats` | Dashboard figures |
| GET | `/api/admin/users` | List accounts |
| PATCH | `/api/admin/users/:id` | Change a role |
| DELETE | `/api/admin/users/:id` | Remove an account |
| POST | `/api/admin/products` | Create a product |
| POST | `/api/admin/products/image` | Upload a product photo from the device |
| PATCH | `/api/admin/products/:id` | Update a product, its colours and per-colour stock |
| DELETE | `/api/admin/products/:id` | Archive (or `?hard=true` to delete) |

Also: `GET /api/health` reports uptime and database connectivity, and
`POST /api/contact` delivers contact-form messages.

---

## Security

- **Passwords** are bcrypt hashed at cost 12 and never returned by any endpoint.
- **Sessions** are JWTs in `httpOnly`, `SameSite=Lax` cookies, so an XSS bug cannot steal
  them the way it could read `localStorage`. Cookies become `Secure` automatically in production.
- **Roles are never accepted from a request body.** The server decides who is an admin;
  posting `{"role":"admin"}` at signup produces a customer.
- **Prices are always recomputed server-side.** The browser sends product ids and
  quantities only, so a tampered request cannot change what an order costs.
- **Stock is guarded** with conditional updates, so two shoppers cannot both buy the last unit.
- **Login is deliberately vague** — "email or password is incorrect" either way, with a
  dummy hash on missing accounts so timing does not reveal which emails are registered.
- **Password resets go by one-time code, not a link.** Nothing in the email is clickable,
  so a forwarded or intercepted message cannot be acted on by opening it. A 6-digit code is
  only a million possibilities, so the code alone is not the control: it lives 10 minutes,
  survives **5** wrong guesses and is then destroyed, is stored as a SHA-256 hash, and is
  compared in constant time. A correct code is exchanged for the same single-use random
  token the reset endpoint always took, which travels in `sessionStorage` rather than the
  URL. Changing a password invalidates every existing session.
- **One code a minute.** A fresh code resets the guess counter, so without a floor a script
  could alternate "request code / burn 5 guesses" as fast as the mail server allowed. The
  UI counts the wait down; the server enforces it by *silently ignoring* an early request
  rather than refusing it, because "wait 40 seconds" would confirm the address is
  registered. Revocation is
  keyed on a `passwordVersion` counter rather than a timestamp, because a JWT's `iat`
  is whole seconds and a session created in the same second would otherwise survive.
- **Google Sign-In never trusts the browser.** The code-for-token exchange is a direct
  server-to-server call, the ID token's signature is verified against Google's public
  keys, and `state`, `nonce` and PKCE all have to match a sealed httpOnly cookie. The
  client secret never reaches the page, and `?next=` is checked against an allowlist so
  the callback cannot be turned into an open redirect.
- **Only Google-verified email addresses** can create or link an account, and linking a
  Google identity to an existing account emails the owner. A Google sign-in can never
  grant the admin role by itself.
- **Linking disables an unproven password.** NovaCart does not verify email ownership at
  registration, so a password on an account is not proof that whoever set it owns the
  address — otherwise someone could register `victim@example.com`, wait for the real
  owner to arrive through Google, and keep a working password on the joined account
  (*pre-account hijacking*). Linking therefore clears the password and invalidates every
  existing session, **unless the person is already signed in to that account**, which is
  proof they hold it. So "sign in, then add Google" keeps both methods; "arrive cold
  through Google" does not. The durable fix is email verification at registration.
- **The proxy is not trusted by default.** Rate limiters key on `req.ip`, which comes
  from `X-Forwarded-For` once Express trusts a proxy. Trusting one that isn't there lets
  any caller forge their own IP and walk past every limit — measured at 0 of 25 requests
  blocked. Set `TRUST_PROXY` only when genuinely deployed behind one.
- **Auth routes log the path only.** The Google callback arrives as
  `?code=…&state=…`; writing those query strings to a log file would leave working
  credentials sitting in it.
- **Reset links are built from `APP_URL`, never the request's `Host` header** — otherwise a
  forged header could send a genuine-looking email pointing at an attacker's domain.
- **Rate limiting** on sign-in, registration, password resets and the contact form.
- **Security headers** via Helmet, including a Content-Security-Policy.
- **`NODE_ENV` is treated as an allowlist**: only an explicit `development` unlocks debug
  behaviour, so a missing value fails safe rather than open.
- The server **refuses to start in production** without `APP_URL` and a strong `JWT_SECRET`.

---

## Tests

API test suites covering auth, password recovery, mail, security and the admin surface:

```bash
npm test              # everything (server must be running)
npm run test:auth
npm run test:admin
npm run test:security
npm run test:google   # Google Sign-In (starts its own server on 5099)
npm run test:otp      # password reset by one-time code
```

They run against a live server, so start it first with `npm run dev`. The suites create
and clean up their own `@example.com` fixtures. `npm test` covers **286 checks**; run it
against a freshly seeded database, since a few admin assertions expect catalog stock
levels rather than whatever your development data has been drained to.

> **Run `npm run test:otp` on its own.** Password resets are limited to five an hour per
> IP, and the recovery, mail and security suites have already spent that window by the
> time the chain reaches the OTP suite — so it reports being rate-limited rather than
> failing on merit. Restart the server to reset the counters, then run it alone for its
> full 40 checks. The same applies to re-running any suite in quick succession: rate
> limiting is real here, and it is doing its job.

---

## Deploying

1. Create a **MongoDB Atlas** cluster, add a database user, allow access from your host,
   and copy the connection string into `MONGODB_URI`.
2. Set `NODE_ENV=production` and `APP_URL=https://your-domain`.
3. Generate a **fresh** `JWT_SECRET` — never reuse the development one.
4. Set the `SMTP_*` variables for real email. With Gmail, use an
   [App Password](https://myaccount.google.com/apppasswords), not your account password.
5. Deploy to any Node host (Render, Railway, Fly.io, a VPS). Start command: `npm start`.
6. Run `npm run seed` once against the production database.

`.env` is gitignored and must never be committed.

---

## Notes

- The cart lives in the browser until checkout, which is normal for a store of this size.
- Product photography comes from [Unsplash](https://unsplash.com) under its free licence.
- Built step by step: frontend first, then the API, then auth, then the admin dashboard —
  with each layer tested before the next was started.

## Licence

MIT — see [LICENSE](LICENSE).
