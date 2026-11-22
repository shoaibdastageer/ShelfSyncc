# ShelfSync REST API Reference

Base URL: `/api`

## Health
- `GET /api/health` — Returns live connectivity status for Aiven PostgreSQL, Aiven Kafka, Aiven OpenSearch, Razorpay, Gemini, and Meta WhatsApp Cloud API.

## Authentication & Account
- `POST /api/auth/register` — Register customer (`fullName`, `email`, `password`, optional `phone`, `whatsappOptIn`).
- `POST /api/auth/login` — Authenticate and receive HTTP-only cookie + Bearer JWT.
- `POST /api/auth/logout` — Clear session cookie.
- `GET /api/auth/me` — Fetch current authenticated user.
- `POST /api/auth/verify-email` — Verify email with `{ token }`.
- `POST /api/auth/forgot-password` — Generate password reset token.
- `POST /api/auth/reset-password` — Complete password reset with `{ token, password }`.
- `GET /api/account/profile` & `PATCH /api/account/profile` — View/update customer profile & WhatsApp opt-in.
- `GET/POST /api/account/addresses`, `POST /api/account/addresses/:id/default`, `DELETE /api/account/addresses/:id`.

## Catalogue & OpenSearch Discovery
- `GET /api/categories` — List all categories.
- `GET /api/products` — List active products (`?section=featured|bestsellers|trending|new|deals&category=...`).
- `GET /api/products/:slug` — Product detail, reviews, and related items.
- `POST /api/products/:id/reviews` — Submit product review (authenticated).
- `GET /api/search` — Intelligent search (`q`, `category`, `brand`, `city`, `minPrice`, `maxPrice`, `minRating`, `inStockOnly`, `sort`, `page`, `limit`). Queries Aiven OpenSearch `shelfsync_products` when configured and hydrates price/stock from PostgreSQL.
- `GET /api/search/autocomplete?q=...` — Fast prefix & fuzzy suggestions.
- `POST /api/assistant/discover` — ShelfSync AI Assistant endpoint (`{ message }`) powered by Gemini + OpenSearch + PostgreSQL (strictly product discovery only).

## Cart, Wishlist, Checkout & Orders
- `GET /api/cart`, `POST /api/cart/items`, `PATCH /api/cart/items/:productId`, `DELETE /api/cart/items/:productId`.
- `GET /api/wishlist`, `POST /api/wishlist/toggle`.
- `POST /api/checkout/calculate` — Server-side subtotal, promo code, and delivery fee quote.
- `POST /api/checkout/orders` — Atomic order creation + Razorpay order creation or COD confirmation.
- `GET /api/payments/config` — Public Razorpay mode (`sandbox`, `live`, or `unconfigured`) and `keyId`.
- `POST /api/payments/razorpay/verify` — Server-side HMAC-SHA256 payment verification.
- `POST /api/payments/razorpay/failed` — Releases reserved stock on payment failure/cancellation.
- `GET /api/orders`, `GET /api/orders/:orderNumber`, `GET /api/track/:trackingToken`.

## Webhooks
- `POST /api/webhooks/razorpay` — Verifies `X-Razorpay-Signature`, handles `payment.captured`, `payment.failed`, `refund.processed` idempotently.
- `GET /api/webhooks/whatsapp` — Meta verification challenge (`hub.mode`, `hub.verify_token`, `hub.challenge`).
- `POST /api/webhooks/whatsapp` — Verifies `X-Hub-Signature-256` (when `WHATSAPP_APP_SECRET` is set) and replies using ShelfSync AI Assistant.

## Admin (Requires Admin Role)
- `GET /api/admin/overview`
- `GET/POST/PATCH/DELETE /api/admin/products`
- `PATCH /api/admin/inventory/:productId`
- `POST /api/admin/categories`
- `GET /api/admin/orders`, `PATCH /api/admin/orders/:orderId/status`
- `GET /api/admin/notifications`
- `POST /api/admin/opensearch/reindex`
