# NovaCart

A full stack e-commerce store built for the **CodeAlpha Full Stack Development internship**.

Customers browse a 56-product catalog, add to a cart, check out, track their orders and
request returns. Administrators manage products, orders, returns and users from a
dedicated dashboard. Everything is backed by MongoDB and a REST API.

**Stack** — Vanilla HTML5 / CSS3 / JavaScript on the front end (no frameworks, no build
step) · Node.js + Express 5 · MongoDB + Mongoose · JWT auth in httpOnly cookies · Nodemailer

---

## Features

### Storefront
- **Product listing** — 56 products across 13 categories, with search, category filters and sorting
- **Product details** — full description, feature list, stock state, quantity selector, related products
- **Cart** — quantity editing, live totals, free-shipping progress bar, stock-aware limits
- **Checkout** — validated customer form, order summary, server-priced totals
- **Order success** — order number and recap, fetched from the API
- **Order history** — track deliveries, view past orders, start a return within 30 days
- **Accounts** — register, sign in, password reset by email, change password

### Admin dashboard
- **Overview** — revenue, orders, customers, stock alerts, open returns, recent activity
- **Products** — create, edit, archive, restock; search and filter
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
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | ✅ | The single admin account, created by the seed script |
| `SMTP_*` | | Mail delivery. Leave `SMTP_HOST` empty to log emails to the console instead |
| `CONTACT_TO` | | Where contact-form messages are sent (defaults to `ADMIN_EMAIL`) |

Generate a strong JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

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

---

## Project structure

```
NovaCart/
├── public/                    everything served to the browser
│   ├── *.html                 14 pages
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
| POST | `/api/auth/forgot-password` | public | Email a reset link |
| POST | `/api/auth/reset-password` | public | Set a new password with the token |
| PATCH | `/api/auth/password` | signed in | Change password |

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

### Admin
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/admin/stats` | Dashboard figures |
| GET | `/api/admin/users` | List accounts |
| PATCH | `/api/admin/users/:id` | Change a role |
| DELETE | `/api/admin/users/:id` | Remove an account |
| POST | `/api/admin/products` | Create a product |
| PATCH | `/api/admin/products/:id` | Update a product |
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
- **Password resets** store only a SHA-256 hash of a single-use token that expires in 30
  minutes, and changing a password invalidates every existing session.
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
```

They run against a live server, so start it first with `npm run dev`. The suites create
and clean up their own `@example.com` fixtures.

> Rate limiting is real, so running the suites repeatedly in quick succession can trip the
> limiter. Restart the server to reset the counters.

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

MIT
