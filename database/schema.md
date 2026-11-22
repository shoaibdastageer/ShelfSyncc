# ShelfSync Database Schema Documentation

ShelfSync uses **Aiven PostgreSQL** with 21 normalized tables defined in `database/migrations/001_initial_schema.sql`.

## Core Tables

| Table | Purpose | Key Constraints |
| --- | --- | --- |
| `roles` | Defines `customer` and `admin` roles | `name UNIQUE` |
| `users` | Customer & admin accounts, bcrypt hashes, email verification, reset tokens, WhatsApp opt-in | `email UNIQUE`, FK `role_id` |
| `addresses` | Saved customer shipping addresses with 6-digit PIN codes | FK `user_id ON DELETE CASCADE` |
| `categories` | Six storefront categories (Electronics, Fashion, Home & Kitchen, Grocery, Beauty, Sports) | `slug UNIQUE` |
| `products` | Authoritative product catalogue, INR pricing, ratings, flags, JSONB specs | `sku UNIQUE`, `slug UNIQUE`, `price_inr >= 0`, `mrp_inr >= price_inr` |
| `product_images` | Product gallery images | FK `product_id ON DELETE CASCADE` |
| `warehouses` | Indian fulfillment hubs (BLR-01, MUM-01, DEL-01, HYD-01) | `code UNIQUE` |
| `inventory` | Warehouse stock & reservation counts | `CHECK (stock_quantity >= 0)`, `CHECK (reserved_quantity >= 0)`, `UNIQUE(product_id, warehouse_id)` |
| `carts` / `cart_items` | Persistent logged-in customer cart | `CHECK (quantity > 0)`, `UNIQUE(cart_id, product_id)` |
| `wishlists` / `wishlist_items` | Customer saved wishlist | `UNIQUE(wishlist_id, product_id)` |
| `orders` | Order totals, shipping snapshot, status, payment status, `tracking_token` | `order_number UNIQUE`, `tracking_token UNIQUE` |
| `order_items` | Line-item price snapshot at purchase time | FK `order_id`, `product_id` |
| `payments` | Razorpay order/payment IDs, signatures, raw webhook payload | `provider_order_id UNIQUE`, `provider_payment_id UNIQUE` |
| `reviews` | Customer product ratings & verified purchase reviews | `UNIQUE(product_id, user_id)` |
| `processed_events` | Idempotency ledger preventing duplicate Kafka or Razorpay webhook processing | `event_id PRIMARY KEY` |
| `outbox_events` | Transactional outbox table guaranteeing reliable Kafka publishing | `status IN ('pending','published','failed','dead_letter')` |
| `notification_logs` | WhatsApp Cloud API delivery audit log with duplicate prevention | `dedupe_key UNIQUE` |
| `shipments` | Carrier & AWB tracking assignments | `order_id UNIQUE`, `awb_number UNIQUE` |
| `tracking_events` | Chronological order tracking milestones | FK `shipment_id`, `order_id` |

## Concurrency & Overselling Protection

Order checkout runs inside `withPgTransaction` using `SELECT ... FROM inventory WHERE product_id = $1 FOR UPDATE OF i`. Simultaneous orders for the final remaining unit serialize at the row lock: the first commits and decrements stock to `0`, while the second detects `available < quantity` and rolls back with HTTP `409 Conflict`.
