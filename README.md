# ShelfSync — Full-Stack Indian E-Commerce Platform

ShelfSync is a modern, full-stack Indian e-commerce platform built with **React + TypeScript + Vite + Tailwind CSS + shadcn/ui** on the frontend, **Node.js + Express + TypeScript** on the backend, and integrated with **Aiven PostgreSQL**, **Aiven Apache Kafka**, **Aiven OpenSearch**, **Razorpay**, **Google Gemini API**, and **Meta WhatsApp Business Cloud API**.

---

## 1. Architecture Diagram

```text
+-------------------------------------------------------------------------+
|                           React + Vite Frontend                         |
|  Home · Search · Category · Product · Cart · Checkout · Orders · Admin  |
+------------------------------------+------------------------------------+
                                     | REST API (/api/*) + Session Cookies
                                     v
+-------------------------------------------------------------------------+
|                       Node.js + Express Backend                         |
|  Auth/RBAC · Cart & Checkout · Razorpay SDK · Gemini AI · Admin API     |
+-------+-------------------------+-------------------------+-------------+
        |                         |                         |
        v                         v                         v
+---------------+       +-------------------+     +-----------------------+
| Aiven         |       | Aiven             |     | Aiven                 |
| PostgreSQL    |       | Apache Kafka      |     | OpenSearch            |
| (21 Tables,   |       | (order-placed,    |     | (shelfsync_products,  |
|  FOR UPDATE   | ----> |  inventory-updated| --> |  fuzzy + autocomplete)|
|  Outbox)      |       |  payment-updated, |     +-----------------------+
+---------------+       |  order-status,    |
                        |  notifications)   |
                        +---------+---------+
                                  |
                                  v
            +-------------------------------------------+
            | Meta WhatsApp Business Cloud API + Gemini |
            | AI Assistant (Discovery) & Order Updates  |
            +-------------------------------------------+
```

---

## 2. Project Structure

```text
shelfsync/
├── server.ts                  # Unified Express + Vite dev/prod entry point (port 3000)
├── backend/src/
│   ├── app.ts                 # Express API app factory, rate limiting, /api/health
│   ├── config/env.ts          # Typed environment configuration
│   ├── db/
│   │   ├── pgClient.ts        # Aiven PostgreSQL TLS pool, migrations, seed runner
│   │   ├── pgRepository.ts    # Atomic SQL transactions (SELECT ... FOR UPDATE)
│   │   ├── memoryStore.ts     # Preview fallback when DATABASE_URL is not yet set
│   │   └── repository.ts      # Repository facade
│   ├── kafka/kafkaService.ts  # KafkaJS producer, consumer group, retries & DLQ
│   ├── opensearch/            # Official OpenSearch client & index mappings
│   ├── services/              # Search, Razorpay, WhatsApp, Gemini AI, Orchestrator
│   ├── routes/                # Auth, Catalog, Commerce, Webhooks, Admin REST APIs
│   └── utils/                 # Pricing, promo codes, fuzzy search, HMAC verification
├── database/
│   ├── migrations/001_initial_schema.sql  # 21 PostgreSQL tables
│   ├── seed/catalogData.ts                # 6 categories, 4 warehouses, 24 products
│   └── schema.md                          # Database entity documentation
├── src/
│   ├── components/            # Navbar, Footer, ProductCard, shadcn/ui primitives
│   ├── context/               # AuthContext, ShopContext (Cart + Wishlist)
│   ├── pages/                 # All 15+ storefront, checkout, tracking & admin views
│   └── lib/                   # API client & INR formatting helpers
├── scripts/
│   ├── migrate.ts             # Apply PostgreSQL migrations
│   ├── seed.ts                # Seed categories, warehouses, 24 products & demo users
│   ├── opensearch-setup.ts    # Create shelfsync_products index & bulk index
│   └── demo-concurrency.ts    # Concurrent stock=1 checkout demonstration
├── tests/                     # Node.js test suite (tsx --test)
├── docs/API.md                # Full REST API documentation
└── .env.example               # Template for all required credentials
```

---

## 3. Demo Accounts (Seeded)

| Role     | Email                 | Password       |
| -------- | --------------------- | -------------- |
| Customer | `aarav@shelfsync.in`  | `Customer@123` |
| Admin    | `admin@shelfsync.in`  | `Admin@1234`   |

---

## 4. Environment Variables Setup

Copy `.env.example` to `.env` and populate your real credentials:

```bash
cp .env.example .env
```

### A. Aiven PostgreSQL Setup
1. Log in to [Aiven Console](https://console.aiven.io/) and create a **PostgreSQL** service.
2. Copy the **Service URI** (`postgres://avnadmin:...@...aivencloud.com:.../defaultdb?sslmode=require`) into `DATABASE_URL`.
3. Download the CA Certificate (`ca.pem`) if enforcing strict CA verification (`PG_CA_CERT` + `PG_SSL_REJECT_UNAUTHORIZED=true`).
4. **Automatic Startup Bootstrap**: When `DATABASE_URL` is configured, starting ShelfSync (`npm run dev` or `npm start`) automatically verifies the connection, applies `001_initial_schema.sql` if tables do not exist yet, and seeds the 24 products + demo accounts if empty. You can also run them manually at any time:
   ```bash
   npm run migrate
   npm run seed
   ```

> **Running with only `DATABASE_URL` (no paid add-ons required):** Kafka, OpenSearch, Razorpay, and Meta WhatsApp credentials are all optional. When omitted, ShelfSync persists everything in your real PostgreSQL database, runs fuzzy typo & budget search directly against PostgreSQL, processes outbox events in-process, uses Cash on Delivery (COD) for checkout, and logs WhatsApp notifications cleanly in `notification_logs` (`test_mode`).

### B. Aiven Apache Kafka Setup
1. Create an **Apache Kafka** service in Aiven Console.
2. Enable **SASL** authentication (or copy your `KAFKA_BROKERS`, `KAFKA_USERNAME`, `KAFKA_PASSWORD`, and `KAFKA_CA_CERT`).
3. Create (or allow auto-creation of) the topics:
   - `order-placed`
   - `inventory-updated`
   - `payment-updated`
   - `order-status-updated`
   - `notification-requested`
   - `shelfsync-dlq`

### C. Aiven OpenSearch Setup
1. Create an **OpenSearch** service in Aiven Console.
2. Set `OPENSEARCH_URL`, `OPENSEARCH_USERNAME`, and `OPENSEARCH_PASSWORD` in `.env`.
3. Create the `shelfsync_products` index and bulk index all PostgreSQL products:
   ```bash
   npm run opensearch:setup
   ```

### D. Razorpay Payment Gateway Setup (Sandbox)
1. Create a Razorpay account and switch to **Test Mode**.
2. Generate Test API keys under **Settings → API Keys** and set `RAZORPAY_KEY_ID` (`rzp_test_...`) and `RAZORPAY_KEY_SECRET`.
3. Configure a Webhook pointing to `https://<your-domain>/api/webhooks/razorpay` for `payment.captured`, `payment.failed`, and `refund.processed`, and set `RAZORPAY_WEBHOOK_SECRET`.

### E. Gemini API & Meta WhatsApp Cloud API Setup
1. Set `GEMINI_API_KEY` from Google AI Studio / Secrets panel.
2. In Meta for Developers, create a WhatsApp Business app and configure:
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_BUSINESS_ACCOUNT_ID`
   - `WHATSAPP_VERIFY_TOKEN` (must match the verify token entered in Meta Webhook settings)
   - `WHATSAPP_APP_SECRET` (for `X-Hub-Signature-256` verification)
3. Set your Meta Webhook Callback URL to `https://<your-domain>/api/webhooks/whatsapp`.
   - Note: If WhatsApp credentials are absent, ShelfSync logs notifications cleanly with `status = "test_mode"` in `notification_logs` and never claims live message delivery.

---

## 5. Running & Testing Commands

```bash
# Install dependencies
npm install

# Start development server (Express API + Vite on http://localhost:3000)
npm run dev

# Type-check TypeScript
npm run lint

# Build production frontend bundle
npm run build

# Start production server
npm start

# Run automated unit & API integration tests (includes stock=1 concurrency test)
npm test

# Run standalone stock=1 concurrent purchase demonstration
npm run demo:concurrency
```

---

## 6. Deployment Guide

1. Provision Aiven PostgreSQL, Aiven Kafka, and Aiven OpenSearch in the same cloud region for low latency.
2. Deploy the Node.js full-stack app to Cloud Run, Render, Railway, or Fly.io with all environment variables configured in the platform Secrets Manager.
3. Run `npm run build` during build and `npm start` as the start command (listening on `PORT` / `3000`).
4. Run `npm run migrate && npm run seed && npm run opensearch:setup` once against the production Aiven services.
5. Verify live connectivity via `GET /api/health`.

---

## 7. Troubleshooting

- **Search shows `memory-fallback` or `postgresql`**: Ensure `OPENSEARCH_URL` is set and run `npm run opensearch:setup`.
- **Razorpay button says Keys Not Set**: Add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to `.env` and restart the server. Cash on Delivery works out of the box without Razorpay keys.
- **PostgreSQL SSL error**: Paste the single-line escaped Aiven CA certificate into `PG_CA_CERT` or leave `PG_SSL_REJECT_UNAUTHORIZED=false` during initial dev testing.
- **WhatsApp messages logged as `test_mode`**: Supply `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` in `.env` to send live Cloud API requests.
