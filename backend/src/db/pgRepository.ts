import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { pgQuery, withPgTransaction } from './pgClient';
import { calculateCheckoutTotals } from '../utils/pricing';
import { generateAwbNumber, generateOrderNumber, generateRandomToken } from '../utils/crypto';
import type {
  Address,
  CartSummary,
  Category,
  NotificationLog,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
  ProductReview,
  SafeUser,
  UserRecord,
  Warehouse,
} from '../types/domain';

function mapUserRow(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    role: row.role_name === 'admin' ? 'admin' : 'customer',
    fullName: String(row.full_name),
    email: String(row.email),
    phone: row.phone ? String(row.phone) : null,
    passwordHash: String(row.password_hash),
    emailVerified: Boolean(row.email_verified),
    verificationToken: row.verification_token ? String(row.verification_token) : null,
    resetToken: row.reset_token ? String(row.reset_token) : null,
    resetTokenExpiresAt: row.reset_token_expires_at
      ? new Date(String(row.reset_token_expires_at)).toISOString()
      : null,
    whatsappOptIn: Boolean(row.whatsapp_opt_in),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export function toSafeUser(user: UserRecord): SafeUser {
  return {
    id: user.id,
    role: user.role,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    emailVerified: user.emailVerified,
    whatsappOptIn: user.whatsappOptIn,
    createdAt: user.createdAt,
  };
}

const PRODUCT_SELECT_SQL = `
  SELECT
    p.id, p.sku, p.name, p.slug, p.brand, p.category_id,
    c.name AS category_name, c.slug AS category_slug,
    p.short_description, p.description,
    p.price_inr::float AS price_inr, p.mrp_inr::float AS mrp_inr,
    p.discount_percent, p.rating_avg::float AS rating_avg, p.review_count,
    p.is_featured, p.is_bestseller, p.is_trending, p.is_new_arrival, p.is_active,
    p.specs, p.created_at,
    COALESCE(inv.stock_quantity, 0) AS stock_quantity,
    COALESCE(inv.reserved_quantity, 0) AS reserved_quantity,
    GREATEST(0, COALESCE(inv.stock_quantity, 0) - COALESCE(inv.reserved_quantity, 0)) AS available_quantity,
    COALESCE(inv.low_stock_threshold, 5) AS low_stock_threshold,
    COALESCE(w.city, 'Bengaluru') AS warehouse_city,
    COALESCE(w.name, 'Bengaluru Hub') AS warehouse_name,
    COALESCE(
      (
        SELECT json_agg(json_build_object(
          'id', pi.id,
          'imageUrl', pi.image_url,
          'altText', COALESCE(pi.alt_text, p.name),
          'isPrimary', pi.is_primary
        ) ORDER BY pi.is_primary DESC, pi.display_order ASC)
        FROM product_images pi WHERE pi.product_id = p.id
      ),
      '[]'::json
    ) AS images
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN LATERAL (
    SELECT i.* FROM inventory i WHERE i.product_id = p.id ORDER BY i.stock_quantity DESC LIMIT 1
  ) inv ON TRUE
  LEFT JOIN warehouses w ON w.id = inv.warehouse_id
`;

function mapProductRow(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    sku: String(row.sku),
    name: String(row.name),
    slug: String(row.slug),
    brand: String(row.brand),
    categoryId: String(row.category_id),
    categoryName: String(row.category_name),
    categorySlug: String(row.category_slug),
    shortDescription: String(row.short_description),
    description: String(row.description),
    priceInr: Number(row.price_inr),
    mrpInr: Number(row.mrp_inr),
    discountPercent: Number(row.discount_percent),
    ratingAvg: Number(row.rating_avg),
    reviewCount: Number(row.review_count),
    isFeatured: Boolean(row.is_featured),
    isBestseller: Boolean(row.is_bestseller),
    isTrending: Boolean(row.is_trending),
    isNewArrival: Boolean(row.is_new_arrival),
    isActive: Boolean(row.is_active),
    specs: (row.specs as Record<string, string>) || {},
    images: (row.images as Product['images']) || [],
    stockQuantity: Number(row.stock_quantity),
    reservedQuantity: Number(row.reserved_quantity),
    availableQuantity: Number(row.available_quantity),
    lowStockThreshold: Number(row.low_stock_threshold),
    warehouseCity: String(row.warehouse_city),
    warehouseName: String(row.warehouse_name),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export const pgRepo = {
  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const res = await pgQuery(
      `SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE LOWER(u.email) = LOWER($1) LIMIT 1`,
      [email]
    );
    return res.rows[0] ? mapUserRow(res.rows[0]) : null;
  },

  async findUserById(id: string): Promise<UserRecord | null> {
    const res = await pgQuery(
      `SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 LIMIT 1`,
      [id]
    );
    return res.rows[0] ? mapUserRow(res.rows[0]) : null;
  },

  async createUser(input: {
    fullName: string;
    email: string;
    phone?: string;
    passwordHash: string;
    whatsappOptIn?: boolean;
  }): Promise<UserRecord> {
    return withPgTransaction(async (client) => {
      const roleRes = await client.query<{ id: number }>(
        `SELECT id FROM roles WHERE name = 'customer' LIMIT 1`
      );
      const roleId = roleRes.rows[0]?.id ?? 1;
      const verificationToken = generateRandomToken(20);

      const userRes = await client.query(
        `INSERT INTO users (role_id, full_name, email, phone, password_hash, email_verified, verification_token, whatsapp_opt_in)
         VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7)
         RETURNING *`,
        [
          roleId,
          input.fullName,
          input.email.toLowerCase(),
          input.phone || null,
          input.passwordHash,
          verificationToken,
          input.whatsappOptIn ?? true,
        ]
      );
      const row = userRes.rows[0];
      await client.query(`INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [row.id]);
      await client.query(`INSERT INTO wishlists (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [row.id]);
      return mapUserRow({ ...row, role_name: 'customer' });
    });
  },

  async verifyUserEmail(token: string): Promise<boolean> {
    const res = await pgQuery(
      `UPDATE users SET email_verified = TRUE, verification_token = NULL, updated_at = NOW()
       WHERE verification_token = $1 RETURNING id`,
      [token]
    );
    return (res.rowCount ?? 0) > 0;
  },

  async setResetToken(email: string, token: string, expiresAt: Date): Promise<boolean> {
    const res = await pgQuery(
      `UPDATE users SET reset_token = $1, reset_token_expires_at = $2, updated_at = NOW()
       WHERE LOWER(email) = LOWER($3) RETURNING id`,
      [token, expiresAt.toISOString(), email]
    );
    return (res.rowCount ?? 0) > 0;
  },

  async resetPasswordWithToken(token: string, newPasswordHash: string): Promise<boolean> {
    const res = await pgQuery(
      `UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires_at = NULL, updated_at = NOW()
       WHERE reset_token = $2 AND reset_token_expires_at > NOW() RETURNING id`,
      [newPasswordHash, token]
    );
    return (res.rowCount ?? 0) > 0;
  },

  async updateUserProfile(
    userId: string,
    patch: { fullName?: string; phone?: string | null; whatsappOptIn?: boolean }
  ): Promise<UserRecord | null> {
    const res = await pgQuery(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           whatsapp_opt_in = COALESCE($3, whatsapp_opt_in),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [patch.fullName ?? null, patch.phone ?? null, patch.whatsappOptIn ?? null, userId]
    );
    if (!res.rows[0]) return null;
    return this.findUserById(userId);
  },

  async listUserAddresses(userId: string): Promise<Address[]> {
    const res = await pgQuery(
      `SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );
    return res.rows.map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      label: String(r.label),
      fullName: String(r.full_name),
      phone: String(r.phone),
      line1: String(r.line1),
      line2: r.line2 ? String(r.line2) : null,
      city: String(r.city),
      state: String(r.state),
      pinCode: String(r.pin_code),
      isDefault: Boolean(r.is_default),
      createdAt: new Date(String(r.created_at)).toISOString(),
    }));
  },

  async createAddress(userId: string, input: Omit<Address, 'id' | 'userId' | 'createdAt'>): Promise<Address> {
    return withPgTransaction(async (client) => {
      if (input.isDefault) {
        await client.query(`UPDATE addresses SET is_default = FALSE WHERE user_id = $1`, [userId]);
      }
      const res = await client.query(
        `INSERT INTO addresses (user_id, label, full_name, phone, line1, line2, city, state, pin_code, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          userId,
          input.label,
          input.fullName,
          input.phone,
          input.line1,
          input.line2,
          input.city,
          input.state,
          input.pinCode,
          input.isDefault,
        ]
      );
      const r = res.rows[0];
      return {
        id: String(r.id),
        userId: String(r.user_id),
        label: String(r.label),
        fullName: String(r.full_name),
        phone: String(r.phone),
        line1: String(r.line1),
        line2: r.line2 ? String(r.line2) : null,
        city: String(r.city),
        state: String(r.state),
        pinCode: String(r.pin_code),
        isDefault: Boolean(r.is_default),
        createdAt: new Date(String(r.created_at)).toISOString(),
      };
    });
  },

  async setDefaultAddress(userId: string, addressId: string): Promise<void> {
    await withPgTransaction(async (client) => {
      await client.query(`UPDATE addresses SET is_default = FALSE WHERE user_id = $1`, [userId]);
      await client.query(`UPDATE addresses SET is_default = TRUE WHERE id = $1 AND user_id = $2`, [
        addressId,
        userId,
      ]);
    });
  },

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    await pgQuery(`DELETE FROM addresses WHERE id = $1 AND user_id = $2`, [addressId, userId]);
  },

  async listCategories(): Promise<Category[]> {
    const res = await pgQuery(`SELECT * FROM categories ORDER BY display_order ASC, name ASC`);
    return res.rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      slug: String(r.slug),
      description: String(r.description || ''),
      imageUrl: String(r.image_url || ''),
      displayOrder: Number(r.display_order || 0),
    }));
  },

  async createCategory(input: { name: string; slug: string; description: string; imageUrl?: string }): Promise<Category> {
    const res = await pgQuery(
      `INSERT INTO categories (name, slug, description, image_url)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.name, input.slug, input.description, input.imageUrl || '/src/assets/images/prod_anc_headphones_1795304714348.jpg']
    );
    const r = res.rows[0];
    return {
      id: String(r.id),
      name: String(r.name),
      slug: String(r.slug),
      description: String(r.description || ''),
      imageUrl: String(r.image_url || ''),
      displayOrder: Number(r.display_order || 0),
    };
  },

  async listWarehouses(): Promise<Warehouse[]> {
    const res = await pgQuery(`SELECT * FROM warehouses ORDER BY code ASC`);
    return res.rows.map((r) => ({
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      city: String(r.city),
      state: String(r.state),
      pinCode: String(r.pin_code),
    }));
  },

  async listProducts(includeInactive = false): Promise<Product[]> {
    const whereClause = includeInactive ? '' : 'WHERE p.is_active = TRUE';
    const res = await pgQuery(`${PRODUCT_SELECT_SQL} ${whereClause} ORDER BY p.created_at DESC`);
    return res.rows.map(mapProductRow);
  },

  async getProductBySlug(slug: string): Promise<Product | null> {
    const res = await pgQuery(`${PRODUCT_SELECT_SQL} WHERE p.slug = $1 LIMIT 1`, [slug]);
    return res.rows[0] ? mapProductRow(res.rows[0]) : null;
  },

  async getProductById(id: string): Promise<Product | null> {
    const res = await pgQuery(`${PRODUCT_SELECT_SQL} WHERE p.id = $1 LIMIT 1`, [id]);
    return res.rows[0] ? mapProductRow(res.rows[0]) : null;
  },

  async getProductsByIds(ids: string[]): Promise<Product[]> {
    if (ids.length === 0) return [];
    const res = await pgQuery(`${PRODUCT_SELECT_SQL} WHERE p.id = ANY($1::uuid[])`, [ids]);
    const map = new Map(res.rows.map((r) => [String(r.id), mapProductRow(r)]));
    return ids.map((id) => map.get(id)).filter((p): p is Product => Boolean(p));
  },

  async createProduct(input: {
    sku: string;
    name: string;
    slug: string;
    brand: string;
    categoryId: string;
    shortDescription: string;
    description: string;
    priceInr: number;
    mrpInr: number;
    stockQuantity: number;
    lowStockThreshold?: number;
    warehouseId?: string;
    imageUrl: string;
    isFeatured?: boolean;
    isTrending?: boolean;
    isNewArrival?: boolean;
    specs?: Record<string, string>;
  }): Promise<Product> {
    const createdId = await withPgTransaction(async (client) => {
      const discount = Math.max(0, Math.round(((input.mrpInr - input.priceInr) / input.mrpInr) * 100));
      const pRes = await client.query<{ id: string }>(
        `INSERT INTO products (
           sku, name, slug, brand, category_id, short_description, description,
           price_inr, mrp_inr, discount_percent, is_featured, is_trending, is_new_arrival, specs
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
         RETURNING id`,
        [
          input.sku,
          input.name,
          input.slug,
          input.brand,
          input.categoryId,
          input.shortDescription,
          input.description,
          input.priceInr,
          input.mrpInr,
          discount,
          input.isFeatured ?? false,
          input.isTrending ?? false,
          input.isNewArrival ?? true,
          JSON.stringify(input.specs || {}),
        ]
      );
      const productId = pRes.rows[0].id;
      await client.query(
        `INSERT INTO product_images (product_id, image_url, alt_text, is_primary, display_order)
         VALUES ($1, $2, $3, TRUE, 0)`,
        [productId, input.imageUrl, input.name]
      );
      let warehouseId = input.warehouseId;
      if (!warehouseId) {
        const wRes = await client.query<{ id: string }>(`SELECT id FROM warehouses LIMIT 1`);
        warehouseId = wRes.rows[0].id;
      }
      await client.query(
        `INSERT INTO inventory (product_id, warehouse_id, stock_quantity, reserved_quantity, low_stock_threshold)
         VALUES ($1, $2, $3, 0, $4)`,
        [productId, warehouseId, input.stockQuantity, input.lowStockThreshold ?? 5]
      );
      return productId;
    });
    return (await this.getProductById(createdId))!;
  },

  async updateProduct(
    productId: string,
    patch: {
      name?: string;
      brand?: string;
      shortDescription?: string;
      description?: string;
      priceInr?: number;
      mrpInr?: number;
      isActive?: boolean;
      isFeatured?: boolean;
      isTrending?: boolean;
    }
  ): Promise<Product | null> {
    await pgQuery(
      `UPDATE products
       SET name = COALESCE($1, name),
           brand = COALESCE($2, brand),
           short_description = COALESCE($3, short_description),
           description = COALESCE($4, description),
           price_inr = COALESCE($5, price_inr),
           mrp_inr = COALESCE($6, mrp_inr),
           is_active = COALESCE($7, is_active),
           is_featured = COALESCE($8, is_featured),
           is_trending = COALESCE($9, is_trending),
           updated_at = NOW()
       WHERE id = $10`,
      [
        patch.name ?? null,
        patch.brand ?? null,
        patch.shortDescription ?? null,
        patch.description ?? null,
        patch.priceInr ?? null,
        patch.mrpInr ?? null,
        patch.isActive ?? null,
        patch.isFeatured ?? null,
        patch.isTrending ?? null,
        productId,
      ]
    );
    return this.getProductById(productId);
  },

  async updateProductStock(productId: string, stockQuantity: number): Promise<Product | null> {
    await pgQuery(
      `UPDATE inventory SET stock_quantity = $1, updated_at = NOW()
       WHERE id = (SELECT id FROM inventory WHERE product_id = $2 ORDER BY stock_quantity DESC LIMIT 1)`,
      [Math.max(0, stockQuantity), productId]
    );
    return this.getProductById(productId);
  },

  async deleteProduct(productId: string): Promise<void> {
    await pgQuery(`UPDATE products SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, [productId]);
  },

  async listProductReviews(productId: string): Promise<ProductReview[]> {
    const res = await pgQuery(
      `SELECT r.*, u.full_name AS user_name
       FROM reviews r JOIN users u ON u.id = r.user_id
       WHERE r.product_id = $1 ORDER BY r.created_at DESC`,
      [productId]
    );
    return res.rows.map((r) => ({
      id: String(r.id),
      productId: String(r.product_id),
      userId: String(r.user_id),
      userName: String(r.user_name),
      rating: Number(r.rating),
      title: String(r.title),
      comment: String(r.comment),
      isVerifiedPurchase: Boolean(r.is_verified_purchase),
      createdAt: new Date(String(r.created_at)).toISOString(),
    }));
  },

  async addProductReview(input: {
    productId: string;
    userId: string;
    rating: number;
    title: string;
    comment: string;
  }): Promise<ProductReview> {
    const res = await withPgTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO reviews (product_id, user_id, rating, title, comment, is_verified_purchase)
         VALUES ($1,$2,$3,$4,$5, TRUE)
         ON CONFLICT (product_id, user_id) DO UPDATE SET
           rating = EXCLUDED.rating, title = EXCLUDED.title, comment = EXCLUDED.comment
         RETURNING *`,
        [input.productId, input.userId, input.rating, input.title, input.comment]
      );
      await client.query(
        `UPDATE products SET
           rating_avg = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE product_id = $1), rating_avg),
           review_count = (SELECT COUNT(*) FROM reviews WHERE product_id = $1)
         WHERE id = $1`,
        [input.productId]
      );
      const u = await client.query<{ full_name: string }>(`SELECT full_name FROM users WHERE id = $1`, [
        input.userId,
      ]);
      return { row: inserted.rows[0], userName: u.rows[0]?.full_name || 'Customer' };
    });
    return {
      id: String(res.row.id),
      productId: String(res.row.product_id),
      userId: String(res.row.user_id),
      userName: res.userName,
      rating: Number(res.row.rating),
      title: String(res.row.title),
      comment: String(res.row.comment),
      isVerifiedPurchase: Boolean(res.row.is_verified_purchase),
      createdAt: new Date(String(res.row.created_at)).toISOString(),
    };
  },

  async getUserCart(userId: string): Promise<CartSummary> {
    const res = await pgQuery(
      `SELECT
         ci.id, ci.product_id, ci.quantity,
         p.sku, p.name, p.slug, p.brand,
         p.price_inr::float AS price_inr, p.mrp_inr::float AS mrp_inr,
         GREATEST(0, COALESCE(inv.stock_quantity, 0) - COALESCE(inv.reserved_quantity, 0)) AS available_quantity,
         COALESCE((SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC LIMIT 1), '') AS image_url
       FROM carts c
       JOIN cart_items ci ON ci.cart_id = c.id
       JOIN products p ON p.id = ci.product_id
       LEFT JOIN LATERAL (
         SELECT i.* FROM inventory i WHERE i.product_id = p.id ORDER BY i.stock_quantity DESC LIMIT 1
       ) inv ON TRUE
       WHERE c.user_id = $1 AND p.is_active = TRUE
       ORDER BY ci.added_at ASC`,
      [userId]
    );

    const items = res.rows.map((r) => {
      const qty = Number(r.quantity);
      const priceInr = Number(r.price_inr);
      return {
        id: String(r.id),
        productId: String(r.product_id),
        sku: String(r.sku),
        name: String(r.name),
        slug: String(r.slug),
        brand: String(r.brand),
        imageUrl: String(r.image_url),
        priceInr,
        mrpInr: Number(r.mrp_inr),
        quantity: qty,
        availableQuantity: Number(r.available_quantity),
        lineTotalInr: Math.round(priceInr * qty * 100) / 100,
      };
    });

    const totals = calculateCheckoutTotals(
      items.map((i) => ({
        productId: i.productId,
        unitPriceInr: i.priceInr,
        mrpInr: i.mrpInr,
        quantity: i.quantity,
      }))
    );

    return {
      items,
      itemCount: items.reduce((s, i) => s + i.quantity, 0),
      subtotalInr: totals.subtotalInr,
      mrpSavingsInr: totals.mrpSavingsInr,
      deliveryChargeInr: totals.deliveryChargeInr,
      totalInr: totals.totalInr,
      freeDeliveryThresholdInr: totals.freeDeliveryThresholdInr,
    };
  },

  async setCartItem(userId: string, productId: string, quantity: number): Promise<CartSummary> {
    await withPgTransaction(async (client) => {
      let cartRes = await client.query<{ id: string }>(`SELECT id FROM carts WHERE user_id = $1`, [userId]);
      if (!cartRes.rows[0]) {
        cartRes = await client.query<{ id: string }>(
          `INSERT INTO carts (user_id) VALUES ($1) RETURNING id`,
          [userId]
        );
      }
      const cartId = cartRes.rows[0].id;
      if (quantity <= 0) {
        await client.query(`DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2`, [
          cartId,
          productId,
        ]);
        return;
      }
      const prod = await this.getProductById(productId);
      if (!prod || !prod.isActive) {
        throw new Error('Product is unavailable.');
      }
      if (quantity > prod.availableQuantity) {
        throw new Error(`Only ${prod.availableQuantity} unit(s) available for ${prod.name}.`);
      }
      await client.query(
        `INSERT INTO cart_items (cart_id, product_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
        [cartId, productId, quantity]
      );
    });
    return this.getUserCart(userId);
  },

  async addToCart(userId: string, productId: string, deltaQty: number): Promise<CartSummary> {
    const current = await this.getUserCart(userId);
    const existing = current.items.find((i) => i.productId === productId);
    const targetQty = (existing?.quantity || 0) + deltaQty;
    return this.setCartItem(userId, productId, targetQty);
  },

  async clearUserCart(userId: string): Promise<void> {
    await pgQuery(
      `DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = $1)`,
      [userId]
    );
  },

  async getUserWishlist(userId: string): Promise<Product[]> {
    const res = await pgQuery<{ product_id: string }>(
      `SELECT wi.product_id FROM wishlists w JOIN wishlist_items wi ON wi.wishlist_id = w.id WHERE w.user_id = $1 ORDER BY wi.added_at DESC`,
      [userId]
    );
    return this.getProductsByIds(res.rows.map((r) => r.product_id));
  },

  async toggleWishlist(userId: string, productId: string): Promise<{ saved: boolean; items: Product[] }> {
    const saved = await withPgTransaction(async (client) => {
      let wRes = await client.query<{ id: string }>(`SELECT id FROM wishlists WHERE user_id = $1`, [userId]);
      if (!wRes.rows[0]) {
        wRes = await client.query<{ id: string }>(
          `INSERT INTO wishlists (user_id) VALUES ($1) RETURNING id`,
          [userId]
        );
      }
      const wishlistId = wRes.rows[0].id;
      const exists = await client.query(
        `SELECT id FROM wishlist_items WHERE wishlist_id = $1 AND product_id = $2`,
        [wishlistId, productId]
      );
      if (exists.rows[0]) {
        await client.query(`DELETE FROM wishlist_items WHERE id = $1`, [exists.rows[0].id]);
        return false;
      }
      await client.query(`INSERT INTO wishlist_items (wishlist_id, product_id) VALUES ($1, $2)`, [
        wishlistId,
        productId,
      ]);
      return true;
    });
    const items = await this.getUserWishlist(userId);
    return { saved, items };
  },

  /**
   * Atomic order placement with PostgreSQL row-level locking (SELECT ... FOR UPDATE)
   * Prevents overselling under concurrent requests for limited stock.
   */
  async placeOrderAtomic(input: {
    userId: string;
    items: Array<{ productId: string; quantity: number }>;
    paymentMethod: PaymentMethod;
    promoCode?: string | null;
    shippingName: string;
    shippingEmail: string;
    shippingPhone: string;
    shippingAddress: string;
    shippingCity: string;
    shippingState: string;
    shippingPinCode: string;
  }): Promise<{
    order: Order;
    outboxEvent: { id: string; topic: string; eventKey: string; payload: Record<string, unknown> };
  }> {
    if (input.items.length === 0) {
      throw new Error('Cannot place an order with an empty cart.');
    }

    const sortedItems = [...input.items].sort((a, b) => a.productId.localeCompare(b.productId));

    return withPgTransaction(async (client: PoolClient) => {
      const resolvedLines: Array<{
        productId: string;
        sku: string;
        name: string;
        priceInr: number;
        mrpInr: number;
        quantity: number;
        inventoryId: string;
      }> = [];

      for (const line of sortedItems) {
        if (line.quantity <= 0) {
          throw new Error('Item quantity must be at least 1.');
        }

        const lockRes = await client.query<{
          product_id: string;
          sku: string;
          name: string;
          price_inr: string;
          mrp_inr: string;
          is_active: boolean;
          inventory_id: string;
          stock_quantity: number;
          reserved_quantity: number;
        }>(
          `SELECT p.id AS product_id, p.sku, p.name, p.price_inr, p.mrp_inr, p.is_active,
                  i.id AS inventory_id, i.stock_quantity, i.reserved_quantity
           FROM products p
           JOIN inventory i ON i.product_id = p.id
           WHERE p.id = $1
           ORDER BY i.stock_quantity DESC
           LIMIT 1
           FOR UPDATE OF i`,
          [line.productId]
        );

        const row = lockRes.rows[0];
        if (!row || !row.is_active) {
          throw new Error(`Product ${line.productId} is no longer available.`);
        }
        const available = row.stock_quantity - row.reserved_quantity;
        if (available < line.quantity) {
          throw new Error(
            `Insufficient stock for "${row.name}". Available: ${Math.max(0, available)}, Requested: ${line.quantity}.`
          );
        }

        // COD confirms immediately & deducts stock; Razorpay reserves stock until signature/webhook verification
        if (input.paymentMethod === 'cod') {
          await client.query(
            `UPDATE inventory SET stock_quantity = stock_quantity - $1, updated_at = NOW() WHERE id = $2`,
            [line.quantity, row.inventory_id]
          );
        } else {
          await client.query(
            `UPDATE inventory SET reserved_quantity = reserved_quantity + $1, updated_at = NOW() WHERE id = $2`,
            [line.quantity, row.inventory_id]
          );
        }

        resolvedLines.push({
          productId: row.product_id,
          sku: row.sku,
          name: row.name,
          priceInr: Number(row.price_inr),
          mrpInr: Number(row.mrp_inr),
          quantity: line.quantity,
          inventoryId: row.inventory_id,
        });
      }

      const totals = calculateCheckoutTotals(
        resolvedLines.map((l) => ({
          productId: l.productId,
          unitPriceInr: l.priceInr,
          mrpInr: l.mrpInr,
          quantity: l.quantity,
        })),
        input.promoCode
      );

      const orderNumber = generateOrderNumber();
      const trackingToken = `trk_${generateRandomToken(16)}`;
      const initialStatus: OrderStatus = input.paymentMethod === 'cod' ? 'confirmed' : 'pending_payment';
      const initialPaymentStatus = input.paymentMethod === 'cod' ? 'cod_pending' : 'pending';

      const orderRes = await client.query<{ id: string; created_at: string; updated_at: string }>(
        `INSERT INTO orders (
           order_number, user_id, status, payment_status, payment_method,
           subtotal_inr, discount_inr, delivery_charge_inr, total_inr,
           shipping_name, shipping_email, shipping_phone, shipping_address,
           shipping_city, shipping_state, shipping_pin_code, tracking_token
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING id, created_at, updated_at`,
        [
          orderNumber,
          input.userId,
          initialStatus,
          initialPaymentStatus,
          input.paymentMethod,
          totals.subtotalInr,
          totals.promoDiscountInr,
          totals.deliveryChargeInr,
          totals.totalInr,
          input.shippingName,
          input.shippingEmail,
          input.shippingPhone,
          input.shippingAddress,
          input.shippingCity,
          input.shippingState,
          input.shippingPinCode,
          trackingToken,
        ]
      );

      const orderId = orderRes.rows[0].id;

      for (const line of resolvedLines) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, product_sku, unit_price_inr, quantity, line_total_inr)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            orderId,
            line.productId,
            line.name,
            line.sku,
            line.priceInr,
            line.quantity,
            Math.round(line.priceInr * line.quantity * 100) / 100,
          ]
        );
      }

      await client.query(
        `INSERT INTO payments (order_id, provider, amount_inr, currency, status, method)
         VALUES ($1, $2, $3, 'INR', $4, $5)`,
        [
          orderId,
          input.paymentMethod === 'cod' ? 'cod' : 'razorpay',
          totals.totalInr,
          input.paymentMethod === 'cod' ? 'cod_pending' : 'created',
          input.paymentMethod,
        ]
      );

      if (input.paymentMethod === 'cod') {
        const awb = generateAwbNumber();
        const est = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
        const shipRes = await client.query<{ id: string }>(
          `INSERT INTO shipments (order_id, carrier, awb_number, status, estimated_delivery)
           VALUES ($1, 'ShelfSync Express', $2, 'confirmed', $3) RETURNING id`,
          [orderId, awb, est]
        );
        await client.query(
          `INSERT INTO tracking_events (shipment_id, order_id, status, location, description)
           VALUES ($1, $2, 'confirmed', $3, 'Order confirmed (Cash on Delivery). Preparing shipment.')`,
          [shipRes.rows[0].id, orderId, input.shippingCity]
        );
        await client.query(
          `DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = $1)`,
          [input.userId]
        );
      }

      const eventPayload = {
        orderId,
        orderNumber,
        userId: input.userId,
        paymentMethod: input.paymentMethod,
        totalInr: totals.totalInr,
        items: resolvedLines.map((l) => ({
          productId: l.productId,
          sku: l.sku,
          quantity: l.quantity,
        })),
      };

      const outboxRes = await client.query<{ id: string }>(
        `INSERT INTO outbox_events (aggregate_type, aggregate_id, topic, event_key, payload, status)
         VALUES ('order', $1, 'order-placed', $2, $3::jsonb, 'pending') RETURNING id`,
        [orderId, orderNumber, JSON.stringify(eventPayload)]
      );

      const fullOrder = await this.getOrderByIdInternal(client, orderId);
      return {
        order: fullOrder!,
        outboxEvent: {
          id: outboxRes.rows[0].id,
          topic: 'order-placed',
          eventKey: orderNumber,
          payload: eventPayload,
        },
      };
    });
  },

  async attachRazorpayOrderId(orderId: string, razorpayOrderId: string): Promise<void> {
    await pgQuery(
      `UPDATE payments SET provider_order_id = $1, updated_at = NOW() WHERE order_id = $2`,
      [razorpayOrderId, orderId]
    );
  },

  async confirmRazorpayPayment(params: {
    orderId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    method?: string;
    rawPayload?: Record<string, unknown>;
  }): Promise<Order | null> {
    return withPgTransaction(async (client) => {
      const ordRes = await client.query<{ id: string; user_id: string; status: string; shipping_city: string }>(
        `SELECT id, user_id, status, shipping_city FROM orders WHERE id = $1 FOR UPDATE`,
        [params.orderId]
      );
      const ord = ordRes.rows[0];
      if (!ord) return null;
      if (ord.status === 'confirmed' || ord.status === 'packed' || ord.status === 'shipped' || ord.status === 'delivered') {
        return this.getOrderByIdInternal(client, ord.id);
      }

      // Deduct reserved stock permanently
      const itemsRes = await client.query<{ product_id: string; quantity: number }>(
        `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
        [ord.id]
      );

      for (const item of itemsRes.rows) {
        await client.query(
          `UPDATE inventory
           SET stock_quantity = GREATEST(0, stock_quantity - $1),
               reserved_quantity = GREATEST(0, reserved_quantity - $1),
               updated_at = NOW()
           WHERE id = (SELECT id FROM inventory WHERE product_id = $2 ORDER BY reserved_quantity DESC LIMIT 1)`,
          [item.quantity, item.product_id]
        );
      }

      await client.query(
        `UPDATE orders SET status = 'confirmed', payment_status = 'paid', updated_at = NOW() WHERE id = $1`,
        [ord.id]
      );

      await client.query(
        `UPDATE payments
         SET provider_order_id = COALESCE($1, provider_order_id),
             provider_payment_id = $2,
             provider_signature = $3,
             status = 'captured',
             method = COALESCE($4, method),
             raw_payload = COALESCE($5::jsonb, raw_payload),
             updated_at = NOW()
         WHERE order_id = $6`,
        [
          params.razorpayOrderId,
          params.razorpayPaymentId,
          params.razorpaySignature,
          params.method || 'online',
          JSON.stringify(params.rawPayload || {}),
          ord.id,
        ]
      );

      const awb = generateAwbNumber();
      const est = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
      const shipRes = await client.query<{ id: string }>(
        `INSERT INTO shipments (order_id, carrier, awb_number, status, estimated_delivery)
         VALUES ($1, 'ShelfSync Express', $2, 'confirmed', $3)
         ON CONFLICT (order_id) DO UPDATE SET status = 'confirmed'
         RETURNING id`,
        [ord.id, awb, est]
      );

      await client.query(
        `INSERT INTO tracking_events (shipment_id, order_id, status, location, description)
         VALUES ($1, $2, 'confirmed', $3, 'Payment verified via Razorpay. Order confirmed.')`,
        [shipRes.rows[0].id, ord.id, ord.shipping_city]
      );

      await client.query(
        `DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = $1)`,
        [ord.user_id]
      );

      return this.getOrderByIdInternal(client, ord.id);
    });
  },

  async markRazorpayPaymentFailed(orderId: string, reason: string): Promise<Order | null> {
    return withPgTransaction(async (client) => {
      const ordRes = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM orders WHERE id = $1 FOR UPDATE`,
        [orderId]
      );
      const ord = ordRes.rows[0];
      if (!ord || ord.status !== 'pending_payment') {
        return ord ? this.getOrderByIdInternal(client, ord.id) : null;
      }
      const itemsRes = await client.query<{ product_id: string; quantity: number }>(
        `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
        [ord.id]
      );
      for (const item of itemsRes.rows) {
        await client.query(
          `UPDATE inventory
           SET reserved_quantity = GREATEST(0, reserved_quantity - $1), updated_at = NOW()
           WHERE id = (SELECT id FROM inventory WHERE product_id = $2 ORDER BY reserved_quantity DESC LIMIT 1)`,
          [item.quantity, item.product_id]
        );
      }
      await client.query(
        `UPDATE orders SET status = 'cancelled', payment_status = 'failed', updated_at = NOW() WHERE id = $1`,
        [ord.id]
      );
      await client.query(
        `UPDATE payments SET status = 'failed', raw_payload = $1::jsonb, updated_at = NOW() WHERE order_id = $2`,
        [JSON.stringify({ reason }), ord.id]
      );
      return this.getOrderByIdInternal(client, ord.id);
    });
  },

  async findOrderIdByRazorpayOrderId(razorpayOrderId: string): Promise<string | null> {
    const res = await pgQuery<{ order_id: string }>(
      `SELECT order_id FROM payments WHERE provider_order_id = $1 LIMIT 1`,
      [razorpayOrderId]
    );
    return res.rows[0]?.order_id || null;
  },

  async getOrderByIdInternal(clientOrPool: PoolClient | null, orderId: string): Promise<Order | null> {
    const exec = clientOrPool ? clientOrPool.query.bind(clientOrPool) : pgQuery;
    const res = await exec(`SELECT * FROM orders WHERE id = $1 LIMIT 1`, [orderId]);
    if (!res.rows[0]) return null;
    return this.hydrateOrderRow(res.rows[0], clientOrPool);
  },

  async hydrateOrderRow(r: Record<string, unknown>, clientOrPool: PoolClient | null = null): Promise<Order> {
    const exec = clientOrPool ? clientOrPool.query.bind(clientOrPool) : pgQuery;
    const orderId = String(r.id);

    const itemsRes = await exec(
      `SELECT oi.*, p.slug,
              COALESCE((SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC LIMIT 1), '') AS image_url
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1`,
      [orderId]
    );

    const shipRes = await exec(`SELECT * FROM shipments WHERE order_id = $1 LIMIT 1`, [orderId]);
    const trackRes = await exec(
      `SELECT * FROM tracking_events WHERE order_id = $1 ORDER BY event_time ASC`,
      [orderId]
    );
    const payRes = await exec(`SELECT * FROM payments WHERE order_id = $1 LIMIT 1`, [orderId]);

    const s = shipRes.rows[0];
    const p = payRes.rows[0];

    return {
      id: orderId,
      orderNumber: String(r.order_number),
      userId: String(r.user_id),
      status: String(r.status) as OrderStatus,
      paymentStatus: String(r.payment_status) as Order['paymentStatus'],
      paymentMethod: String(r.payment_method) as PaymentMethod,
      subtotalInr: Number(r.subtotal_inr),
      discountInr: Number(r.discount_inr),
      deliveryChargeInr: Number(r.delivery_charge_inr),
      totalInr: Number(r.total_inr),
      shippingName: String(r.shipping_name),
      shippingEmail: String(r.shipping_email),
      shippingPhone: String(r.shipping_phone),
      shippingAddress: String(r.shipping_address),
      shippingCity: String(r.shipping_city),
      shippingState: String(r.shipping_state),
      shippingPinCode: String(r.shipping_pin_code),
      trackingToken: String(r.tracking_token),
      items: itemsRes.rows.map((i) => ({
        id: String(i.id),
        productId: String(i.product_id),
        productName: String(i.product_name),
        productSku: String(i.product_sku),
        slug: i.slug ? String(i.slug) : undefined,
        imageUrl: i.image_url ? String(i.image_url) : undefined,
        unitPriceInr: Number(i.unit_price_inr),
        quantity: Number(i.quantity),
        lineTotalInr: Number(i.line_total_inr),
      })),
      shipment: s
        ? {
            carrier: String(s.carrier),
            awbNumber: String(s.awb_number),
            status: String(s.status),
            estimatedDelivery: s.estimated_delivery ? String(s.estimated_delivery).slice(0, 10) : '',
          }
        : undefined,
      trackingEvents: trackRes.rows.map((t) => ({
        id: String(t.id),
        status: String(t.status),
        location: String(t.location),
        description: String(t.description),
        eventTime: new Date(String(t.event_time)).toISOString(),
      })),
      payment: p
        ? {
            provider: String(p.provider),
            providerOrderId: p.provider_order_id ? String(p.provider_order_id) : null,
            providerPaymentId: p.provider_payment_id ? String(p.provider_payment_id) : null,
            status: String(p.status),
            method: p.method ? String(p.method) : null,
          }
        : undefined,
      createdAt: new Date(String(r.created_at)).toISOString(),
      updatedAt: new Date(String(r.updated_at)).toISOString(),
    };
  },

  async getOrderByNumber(orderNumber: string): Promise<Order | null> {
    const res = await pgQuery(`SELECT * FROM orders WHERE UPPER(order_number) = UPPER($1) LIMIT 1`, [
      orderNumber,
    ]);
    return res.rows[0] ? this.hydrateOrderRow(res.rows[0]) : null;
  },

  async getOrderByTrackingToken(token: string): Promise<Order | null> {
    const res = await pgQuery(`SELECT * FROM orders WHERE tracking_token = $1 LIMIT 1`, [token]);
    return res.rows[0] ? this.hydrateOrderRow(res.rows[0]) : null;
  },

  async listUserOrders(userId: string): Promise<Order[]> {
    const res = await pgQuery(`SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
    return Promise.all(res.rows.map((r) => this.hydrateOrderRow(r)));
  },

  async listAllOrders(): Promise<Order[]> {
    const res = await pgQuery(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 100`);
    return Promise.all(res.rows.map((r) => this.hydrateOrderRow(r)));
  },

  async updateOrderStatusAdmin(
    orderId: string,
    status: OrderStatus,
    location = 'ShelfSync Fulfillment Hub',
    description?: string
  ): Promise<Order | null> {
    return withPgTransaction(async (client) => {
      const res = await client.query(`UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [
        status,
        orderId,
      ]);
      if (!res.rows[0]) return null;
      let shipRes = await client.query<{ id: string }>(`SELECT id FROM shipments WHERE order_id = $1`, [orderId]);
      if (!shipRes.rows[0]) {
        shipRes = await client.query<{ id: string }>(
          `INSERT INTO shipments (order_id, carrier, awb_number, status, estimated_delivery)
           VALUES ($1, 'ShelfSync Express', $2, $3, $4) RETURNING id`,
          [orderId, generateAwbNumber(), status, new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)]
        );
      } else {
        await client.query(`UPDATE shipments SET status = $1, updated_at = NOW() WHERE id = $2`, [
          status,
          shipRes.rows[0].id,
        ]);
      }

      const defaultMsg = `Order status updated to ${status.replace(/_/g, ' ')}.`;
      await client.query(
        `INSERT INTO tracking_events (shipment_id, order_id, status, location, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [shipRes.rows[0].id, orderId, status, location, description || defaultMsg]
      );
      if (status === 'refunded') {
        await client.query(`UPDATE orders SET payment_status = 'refunded' WHERE id = $1`, [orderId]);
        await client.query(`UPDATE payments SET status = 'refunded' WHERE order_id = $1`, [orderId]);
      }
      return this.getOrderByIdInternal(client, orderId);
    });
  },

  async claimEventProcessing(eventId: string, topic: string, consumerGroup: string): Promise<boolean> {
    const res = await pgQuery(
      `INSERT INTO processed_events (event_id, topic, consumer_group)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [eventId, topic, consumerGroup]
    );
    return (res.rowCount ?? 0) > 0;
  },

  async markOutboxPublished(outboxId: string): Promise<void> {
    await pgQuery(`UPDATE outbox_events SET status = 'published', published_at = NOW() WHERE id = $1`, [
      outboxId,
    ]);
  },

  async markOutboxFailed(outboxId: string, errorMessage: string): Promise<void> {
    await pgQuery(
      `UPDATE outbox_events
       SET retry_count = retry_count + 1,
           last_error = $1,
           status = CASE WHEN retry_count + 1 >= 5 THEN 'dead_letter' ELSE 'failed' END
       WHERE id = $2`,
      [errorMessage, outboxId]
    );
  },

  async recordNotificationLog(input: Omit<NotificationLog, 'id' | 'createdAt'>): Promise<NotificationLog | null> {
    const res = await pgQuery(
      `INSERT INTO notification_logs (
         user_id, order_id, channel, recipient_phone, template_name, message_body,
         status, provider_message_id, dedupe_key, error_message, sent_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING *`,
      [
        input.userId,
        input.orderId,
        input.channel,
        input.recipientPhone,
        input.templateName,
        input.messageBody,
        input.status,
        input.providerMessageId,
        input.dedupeKey,
        input.errorMessage,
        input.sentAt,
      ]
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: String(r.id),
      userId: r.user_id ? String(r.user_id) : null,
      orderId: r.order_id ? String(r.order_id) : null,
      channel: String(r.channel),
      recipientPhone: String(r.recipient_phone),
      templateName: String(r.template_name),
      messageBody: String(r.message_body),
      status: String(r.status) as NotificationLog['status'],
      providerMessageId: r.provider_message_id ? String(r.provider_message_id) : null,
      dedupeKey: String(r.dedupe_key),
      errorMessage: r.error_message ? String(r.error_message) : null,
      createdAt: new Date(String(r.created_at)).toISOString(),
      sentAt: r.sent_at ? new Date(String(r.sent_at)).toISOString() : null,
    };
  },

  async listNotificationLogs(): Promise<NotificationLog[]> {
    const res = await pgQuery(`SELECT * FROM notification_logs ORDER BY created_at DESC LIMIT 100`);
    return res.rows.map((r) => ({
      id: String(r.id),
      userId: r.user_id ? String(r.user_id) : null,
      orderId: r.order_id ? String(r.order_id) : null,
      channel: String(r.channel),
      recipientPhone: String(r.recipient_phone),
      templateName: String(r.template_name),
      messageBody: String(r.message_body),
      status: String(r.status) as NotificationLog['status'],
      providerMessageId: r.provider_message_id ? String(r.provider_message_id) : null,
      dedupeKey: String(r.dedupe_key),
      errorMessage: r.error_message ? String(r.error_message) : null,
      createdAt: new Date(String(r.created_at)).toISOString(),
      sentAt: r.sent_at ? new Date(String(r.sent_at)).toISOString() : null,
    }));
  },

  async getAdminStats() {
    const revRes = await pgQuery<{ total: string; orders_count: string; pending_count: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','refunded') THEN total_inr ELSE 0 END), 0)::text AS total,
         COUNT(*)::text AS orders_count,
         COUNT(*) FILTER (WHERE status IN ('pending_payment','confirmed','packed'))::text AS pending_count
       FROM orders`
    );
    const custRes = await pgQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'customer'`
    );
    const prodRes = await pgQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM products WHERE is_active = TRUE`
    );
    return {
      totalRevenueInr: Number(revRes.rows[0]?.total || 0),
      totalOrders: Number(revRes.rows[0]?.orders_count || 0),
      pendingOrders: Number(revRes.rows[0]?.pending_count || 0),
      totalCustomers: Number(custRes.rows[0]?.count || 0),
      totalProducts: Number(prodRes.rows[0]?.count || 0),
    };
  },
};
