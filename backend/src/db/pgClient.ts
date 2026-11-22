import fs from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { SEED_CATEGORIES, SEED_PRODUCTS, SEED_WAREHOUSES } from '../../../database/seed/catalogData';

let pool: Pool | null = null;
let lastPgError: string | null = null;

export function isPostgresConfigured(): boolean {
  return Boolean(env.databaseUrl);
}

export function getLastPgError(): string | null {
  return lastPgError;
}

export function getPgPool(): Pool | null {
  if (!env.databaseUrl) {
    return null;
  }
  if (!pool) {
    const isLocalHost =
      /localhost|127\.0\.0\.1/i.test(env.databaseUrl) && !/sslmode=require/i.test(env.databaseUrl);
    const sslConfig = env.pgCaCert
      ? {
          ca: env.pgCaCert,
          rejectUnauthorized: true,
        }
      : isLocalHost
        ? false
        : {
            rejectUnauthorized: env.pgSslRejectUnauthorized,
          };

    let connectionString = env.databaseUrl;
    try {
      const parsed = new URL(env.databaseUrl);
      parsed.searchParams.delete('sslmode');
      connectionString = parsed.toString();
    } catch {
      // Keep original connectionString if URL parsing fails
    }

    pool = new Pool({
      connectionString,
      ssl: sslConfig,
      options: '-c search_path=shelfsync',
      max: 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      lastPgError = err.message;
      console.error('[Aiven PostgreSQL] Pool error:', err.message);
    });
  }
  return pool;
}

export async function pgQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  const activePool = getPgPool();
  if (!activePool) {
    throw new Error('DATABASE_URL is not configured for Aiven PostgreSQL.');
  }
  return activePool.query<T>(text, params);
}

export async function withPgTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const activePool = getPgPool();
  if (!activePool) {
    throw new Error('DATABASE_URL is not configured for Aiven PostgreSQL.');
  }
  const client = await activePool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function pingPostgres(): Promise<{
  status: 'connected' | 'unconfigured' | 'error';
  message: string;
}> {
  if (!env.databaseUrl) {
    return {
      status: 'unconfigured',
      message: 'DATABASE_URL not set. Using in-memory preview fallback until Aiven PostgreSQL is configured.',
    };
  }
  try {
    const activePool = getPgPool()!;
    await activePool.query('SELECT 1');
    lastPgError = null;
    return {
      status: 'connected',
      message: 'Connected to PostgreSQL.',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown PostgreSQL error';
    lastPgError = msg;
    return {
      status: 'error',
      message: msg,
    };
  }
}

export async function runPgMigrations(): Promise<void> {
  const activePool = getPgPool();
  if (!activePool) {
    throw new Error('Cannot run migrations: DATABASE_URL is missing.');
  }
  await activePool.query('CREATE SCHEMA IF NOT EXISTS shelfsync');
  const migrationPath = path.resolve(process.cwd(), 'database/migrations/001_initial_schema.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  await activePool.query(sql);
}

export async function seedPgDatabase(): Promise<{ seededProducts: number }> {
  const activePool = getPgPool();
  if (!activePool) {
    throw new Error('Cannot seed database: DATABASE_URL is missing.');
  }

  return withPgTransaction(async (client) => {
    // Seed default customer & admin users
    const customerRole = await client.query<{ id: number }>(
      `SELECT id FROM roles WHERE name = 'customer' LIMIT 1`
    );
    const adminRole = await client.query<{ id: number }>(
      `SELECT id FROM roles WHERE name = 'admin' LIMIT 1`
    );

    const customerRoleId = customerRole.rows[0]?.id ?? 1;
    const adminRoleId = adminRole.rows[0]?.id ?? 2;

    const demoCustomerPass = await bcrypt.hash('Customer@123', 10);
    const demoAdminPass = await bcrypt.hash('Admin@1234', 10);

    const custRes = await client.query<{ id: string }>(
      `INSERT INTO users (role_id, full_name, email, phone, password_hash, email_verified, whatsapp_opt_in)
       VALUES ($1, 'Aarav Sharma', 'aarav@shelfsync.in', '+919876543210', $2, TRUE, TRUE)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [customerRoleId, demoCustomerPass]
    );
    const customerId = custRes.rows[0].id;

    await client.query(
      `INSERT INTO users (role_id, full_name, email, phone, password_hash, email_verified, whatsapp_opt_in)
       VALUES ($1, 'Priya Nair (Admin)', 'admin@shelfsync.in', '+919811112222', $2, TRUE, TRUE)
       ON CONFLICT (email) DO UPDATE SET role_id = EXCLUDED.role_id`,
      [adminRoleId, demoAdminPass]
    );

    await client.query(
      `INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [customerId]
    );
    await client.query(
      `INSERT INTO wishlists (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [customerId]
    );

    // Seed default address if none exists
    const addrCount = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM addresses WHERE user_id = $1`,
      [customerId]
    );
    if (Number(addrCount.rows[0]?.count || 0) === 0) {
      await client.query(
        `INSERT INTO addresses (user_id, label, full_name, phone, line1, line2, city, state, pin_code, is_default)
         VALUES ($1, 'Home', 'Aarav Sharma', '+919876543210', '42 Indiranagar 100 Feet Road', 'Near CMH Park', 'Bengaluru', 'Karnataka', '560038', TRUE)`,
        [customerId]
      );
    }

    // Seed Categories
    const categoryIdBySlug = new Map<string, string>();
    for (const cat of SEED_CATEGORIES) {
      const res = await client.query<{ id: string }>(
        `INSERT INTO categories (name, slug, description, image_url, display_order)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           image_url = EXCLUDED.image_url,
           display_order = EXCLUDED.display_order
         RETURNING id`,
        [cat.name, cat.slug, cat.description, cat.imageUrl, cat.displayOrder]
      );
      categoryIdBySlug.set(cat.slug, res.rows[0].id);
    }

    // Seed Warehouses
    const warehouseIdByCode = new Map<string, string>();
    for (const wh of SEED_WAREHOUSES) {
      const res = await client.query<{ id: string }>(
        `INSERT INTO warehouses (code, name, city, state, pin_code)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           city = EXCLUDED.city,
           state = EXCLUDED.state,
           pin_code = EXCLUDED.pin_code
         RETURNING id`,
        [wh.code, wh.name, wh.city, wh.state, wh.pinCode]
      );
      warehouseIdByCode.set(wh.code, res.rows[0].id);
    }

    // Seed Products, Images, Inventory
    for (const prod of SEED_PRODUCTS) {
      const categoryId = categoryIdBySlug.get(prod.categorySlug);
      const warehouseId = warehouseIdByCode.get(prod.warehouseCode);
      if (!categoryId || !warehouseId) continue;

      const discountPercent = Math.max(
        0,
        Math.round(((prod.mrpInr - prod.priceInr) / prod.mrpInr) * 100)
      );

      const prodRes = await client.query<{ id: string }>(
        `INSERT INTO products (
           sku, name, slug, brand, category_id, short_description, description,
           price_inr, mrp_inr, discount_percent, rating_avg, review_count,
           is_featured, is_bestseller, is_trending, is_new_arrival, is_active, specs
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,TRUE,$17::jsonb)
         ON CONFLICT (sku) DO UPDATE SET
           name = EXCLUDED.name,
           short_description = EXCLUDED.short_description,
           description = EXCLUDED.description,
           price_inr = EXCLUDED.price_inr,
           mrp_inr = EXCLUDED.mrp_inr,
           discount_percent = EXCLUDED.discount_percent,
           specs = EXCLUDED.specs
         RETURNING id`,
        [
          prod.sku,
          prod.name,
          prod.slug,
          prod.brand,
          categoryId,
          prod.shortDescription,
          prod.description,
          prod.priceInr,
          prod.mrpInr,
          discountPercent,
          prod.ratingAvg,
          prod.reviewCount,
          prod.isFeatured,
          prod.isBestseller,
          prod.isTrending,
          prod.isNewArrival,
          JSON.stringify(prod.specs),
        ]
      );

      const productId = prodRes.rows[0].id;

      const imgCheck = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM product_images WHERE product_id = $1`,
        [productId]
      );
      if (Number(imgCheck.rows[0]?.count || 0) === 0) {
        await client.query(
          `INSERT INTO product_images (product_id, image_url, alt_text, is_primary, display_order)
           VALUES ($1, $2, $3, TRUE, 0)`,
          [productId, prod.imageUrl, prod.name]
        );
      }

      await client.query(
        `INSERT INTO inventory (product_id, warehouse_id, stock_quantity, reserved_quantity, low_stock_threshold)
         VALUES ($1, $2, $3, 0, $4)
         ON CONFLICT (product_id, warehouse_id) DO NOTHING`,
        [productId, warehouseId, prod.stockQuantity, prod.lowStockThreshold]
      );
    }

    // Seed initial product reviews if none exist
    const revCount = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM reviews`);
    if (Number(revCount.rows[0]?.count || 0) === 0) {
      const p1 = await client.query<{ id: string }>(`SELECT id FROM products WHERE sku = 'SS-EL-101' LIMIT 1`);
      const p4 = await client.query<{ id: string }>(`SELECT id FROM products WHERE sku = 'SS-EL-104' LIMIT 1`);
      if (p1.rows[0]) {
        await client.query(
          `INSERT INTO reviews (product_id, user_id, rating, title, comment, is_verified_purchase)
           VALUES ($1, $2, 5, 'Great noise cancellation on Bengaluru Metro', 'Battery easily lasts a full week of commuting and lectures. Comfortable over glasses.', TRUE)
           ON CONFLICT (product_id, user_id) DO NOTHING`,
          [p1.rows[0].id, customerId]
        );
      }
      if (p4.rows[0]) {
        await client.query(
          `INSERT INTO reviews (product_id, user_id, rating, title, comment, is_verified_purchase)
           VALUES ($1, $2, 5, 'Handles Docker & VS Code smoothly', '16GB RAM out of the box makes this ideal for CSE projects and labs.', TRUE)
           ON CONFLICT (product_id, user_id) DO NOTHING`,
          [p4.rows[0].id, customerId]
        );
      }
    }

    // Seed one historical demo order if orders table is empty
    const ordCount = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM orders`);
    if (Number(ordCount.rows[0]?.count || 0) === 0) {
      const p1 = await client.query<{ id: string; name: string; sku: string; price_inr: string }>(
        `SELECT id, name, sku, price_inr::text FROM products WHERE sku = 'SS-EL-101' LIMIT 1`
      );
      if (p1.rows[0]) {
        const prod = p1.rows[0];
        const ordRes = await client.query<{ id: string }>(
          `INSERT INTO orders (
             order_number, user_id, status, payment_status, payment_method,
             subtotal_inr, discount_inr, delivery_charge_inr, total_inr,
             shipping_name, shipping_email, shipping_phone, shipping_address,
             shipping_city, shipping_state, shipping_pin_code, tracking_token
           ) VALUES (
             'SS1025', $1, 'delivered', 'paid', 'razorpay',
             1499, 0, 0, 1499,
             'Aarav Sharma', 'aarav@shelfsync.in', '+919876543210', '42 Indiranagar 100 Feet Road, Near CMH Park',
             'Bengaluru', 'Karnataka', '560038', 'trk_ss1025_seed_demo'
           ) RETURNING id`,
          [customerId]
        );
        const orderId = ordRes.rows[0].id;
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, product_sku, unit_price_inr, quantity, line_total_inr)
           VALUES ($1, $2, $3, $4, 1499, 1, 1499)`,
          [orderId, prod.id, prod.name, prod.sku]
        );
        await client.query(
          `INSERT INTO payments (order_id, provider, provider_order_id, provider_payment_id, amount_inr, currency, status, method)
           VALUES ($1, 'razorpay', 'order_seed_1025', 'pay_seed_1025', 1499, 'INR', 'captured', 'upi')`,
          [orderId]
        );
        const shipRes = await client.query<{ id: string }>(
          `INSERT INTO shipments (order_id, carrier, awb_number, status, estimated_delivery)
           VALUES ($1, 'ShelfSync Express', 'SSX90124578', 'delivered', CURRENT_DATE) RETURNING id`,
          [orderId]
        );
        await client.query(
          `INSERT INTO tracking_events (shipment_id, order_id, status, location, description)
           VALUES
             ($1, $2, 'confirmed', 'Bengaluru Whitefield Hub', 'Order confirmed & payment verified.'),
             ($1, $2, 'shipped', 'Bengaluru Sortation Center', 'Dispatched via ShelfSync Express (AWB: SSX90124578).'),
             ($1, $2, 'delivered', 'Indiranagar, Bengaluru', 'Delivered to customer at doorstep.')`,
          [shipRes.rows[0].id, orderId]
        );
      }
    }

    return { seededProducts: SEED_PRODUCTS.length };
  });
}

let pgBootstrapped = false;

export async function ensurePgReady(): Promise<void> {
  if (!isPostgresConfigured() || pgBootstrapped) return;
  const activePool = getPgPool();
  if (!activePool) return;

  await activePool.query('SELECT 1');
  await activePool.query('CREATE SCHEMA IF NOT EXISTS shelfsync');
  const tableCheck = await activePool.query<{ tbl: string | null }>(
    `SELECT to_regclass('shelfsync.products')::text AS tbl`
  );
  if (!tableCheck.rows[0]?.tbl) {
    console.log('[ShelfSync] PostgreSQL schema not found — applying initial migrations...');
    await runPgMigrations();
  }
  const prodCount = await activePool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM products`
  );
  if ((prodCount.rows[0]?.count ?? 0) === 0) {
    console.log('[ShelfSync] PostgreSQL catalogue empty — seeding initial products & demo accounts...');
    await seedPgDatabase();
  }
  pgBootstrapped = true;
}
