import crypto from 'node:crypto';
import { isPostgresConfigured } from './pgClient';
import { pgRepo, toSafeUser } from './pgRepository';
import { getMemoryState } from './memoryStore';
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
  UserRecord,
  Warehouse,
} from '../types/domain';

export { toSafeUser };

export const repo = {
  mode(): 'postgresql' | 'memory-preview' {
    return isPostgresConfigured() ? 'postgresql' : 'memory-preview';
  },

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    if (isPostgresConfigured()) return pgRepo.findUserByEmail(email);
    const s = getMemoryState();
    return s.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
  },

  async findUserById(id: string): Promise<UserRecord | null> {
    if (isPostgresConfigured()) return pgRepo.findUserById(id);
    const s = getMemoryState();
    return s.users.find((u) => u.id === id) || null;
  },

  async createUser(input: {
    fullName: string;
    email: string;
    phone?: string;
    passwordHash: string;
    whatsappOptIn?: boolean;
  }): Promise<UserRecord> {
    if (isPostgresConfigured()) return pgRepo.createUser(input);
    const s = getMemoryState();
    const user: UserRecord = {
      id: crypto.randomUUID(),
      role: 'customer',
      fullName: input.fullName,
      email: input.email.toLowerCase(),
      phone: input.phone || null,
      passwordHash: input.passwordHash,
      emailVerified: false,
      verificationToken: generateRandomToken(20),
      resetToken: null,
      resetTokenExpiresAt: null,
      whatsappOptIn: input.whatsappOptIn ?? true,
      createdAt: new Date().toISOString(),
    };
    s.users.push(user);
    return user;
  },

  async verifyUserEmail(token: string): Promise<boolean> {
    if (isPostgresConfigured()) return pgRepo.verifyUserEmail(token);
    const s = getMemoryState();
    const u = s.users.find((user) => user.verificationToken === token);
    if (!u) return false;
    u.emailVerified = true;
    u.verificationToken = null;
    return true;
  },

  async setResetToken(email: string, token: string, expiresAt: Date): Promise<boolean> {
    if (isPostgresConfigured()) return pgRepo.setResetToken(email, token, expiresAt);
    const s = getMemoryState();
    const u = s.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
    if (!u) return false;
    u.resetToken = token;
    u.resetTokenExpiresAt = expiresAt.toISOString();
    return true;
  },

  async resetPasswordWithToken(token: string, newPasswordHash: string): Promise<boolean> {
    if (isPostgresConfigured()) return pgRepo.resetPasswordWithToken(token, newPasswordHash);
    const s = getMemoryState();
    const u = s.users.find(
      (user) =>
        user.resetToken === token &&
        user.resetTokenExpiresAt &&
        new Date(user.resetTokenExpiresAt).getTime() > Date.now()
    );
    if (!u) return false;
    u.passwordHash = newPasswordHash;
    u.resetToken = null;
    u.resetTokenExpiresAt = null;
    return true;
  },

  async updateUserProfile(
    userId: string,
    patch: { fullName?: string; phone?: string | null; whatsappOptIn?: boolean }
  ): Promise<UserRecord | null> {
    if (isPostgresConfigured()) return pgRepo.updateUserProfile(userId, patch);
    const s = getMemoryState();
    const u = s.users.find((user) => user.id === userId);
    if (!u) return null;
    if (patch.fullName !== undefined) u.fullName = patch.fullName;
    if (patch.phone !== undefined) u.phone = patch.phone;
    if (patch.whatsappOptIn !== undefined) u.whatsappOptIn = patch.whatsappOptIn;
    return u;
  },

  async listUserAddresses(userId: string): Promise<Address[]> {
    if (isPostgresConfigured()) return pgRepo.listUserAddresses(userId);
    const s = getMemoryState();
    return s.addresses
      .filter((a) => a.userId === userId)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  },

  async createAddress(userId: string, input: Omit<Address, 'id' | 'userId' | 'createdAt'>): Promise<Address> {
    if (isPostgresConfigured()) return pgRepo.createAddress(userId, input);
    const s = getMemoryState();
    if (input.isDefault) {
      for (const a of s.addresses) {
        if (a.userId === userId) a.isDefault = false;
      }
    }
    const created: Address = {
      id: crypto.randomUUID(),
      userId,
      ...input,
      createdAt: new Date().toISOString(),
    };
    s.addresses.push(created);
    return created;
  },

  async setDefaultAddress(userId: string, addressId: string): Promise<void> {
    if (isPostgresConfigured()) return pgRepo.setDefaultAddress(userId, addressId);
    const s = getMemoryState();
    for (const a of s.addresses) {
      if (a.userId === userId) a.isDefault = a.id === addressId;
    }
  },

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    if (isPostgresConfigured()) return pgRepo.deleteAddress(userId, addressId);
    const s = getMemoryState();
    s.addresses = s.addresses.filter((a) => !(a.userId === userId && a.id === addressId));
  },

  async listCategories(): Promise<Category[]> {
    if (isPostgresConfigured()) return pgRepo.listCategories();
    return [...getMemoryState().categories].sort((a, b) => a.displayOrder - b.displayOrder);
  },

  async createCategory(input: { name: string; slug: string; description: string; imageUrl?: string }): Promise<Category> {
    if (isPostgresConfigured()) return pgRepo.createCategory(input);
    const s = getMemoryState();
    const cat: Category = {
      id: crypto.randomUUID(),
      name: input.name,
      slug: input.slug,
      description: input.description,
      imageUrl: input.imageUrl || '/src/assets/images/prod_anc_headphones_1795304714348.jpg',
      displayOrder: s.categories.length + 1,
    };
    s.categories.push(cat);
    return cat;
  },

  async listWarehouses(): Promise<Warehouse[]> {
    if (isPostgresConfigured()) return pgRepo.listWarehouses();
    return getMemoryState().warehouses;
  },

  async listProducts(includeInactive = false): Promise<Product[]> {
    if (isPostgresConfigured()) return pgRepo.listProducts(includeInactive);
    const all = getMemoryState().products;
    return includeInactive ? [...all] : all.filter((p) => p.isActive);
  },

  async getProductBySlug(slug: string): Promise<Product | null> {
    if (isPostgresConfigured()) return pgRepo.getProductBySlug(slug);
    return getMemoryState().products.find((p) => p.slug === slug) || null;
  },

  async getProductById(id: string): Promise<Product | null> {
    if (isPostgresConfigured()) return pgRepo.getProductById(id);
    return getMemoryState().products.find((p) => p.id === id) || null;
  },

  async getProductsByIds(ids: string[]): Promise<Product[]> {
    if (isPostgresConfigured()) return pgRepo.getProductsByIds(ids);
    const map = new Map(getMemoryState().products.map((p) => [p.id, p]));
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
    if (isPostgresConfigured()) return pgRepo.createProduct(input);
    const s = getMemoryState();
    const cat = s.categories.find((c) => c.id === input.categoryId) || s.categories[0];
    const wh = s.warehouses.find((w) => w.id === input.warehouseId) || s.warehouses[0];
    const discountPercent = Math.max(0, Math.round(((input.mrpInr - input.priceInr) / input.mrpInr) * 100));
    const product: Product = {
      id: crypto.randomUUID(),
      sku: input.sku,
      name: input.name,
      slug: input.slug,
      brand: input.brand,
      categoryId: cat.id,
      categoryName: cat.name,
      categorySlug: cat.slug,
      shortDescription: input.shortDescription,
      description: input.description,
      priceInr: input.priceInr,
      mrpInr: input.mrpInr,
      discountPercent,
      ratingAvg: 4.5,
      reviewCount: 0,
      isFeatured: input.isFeatured ?? false,
      isBestseller: false,
      isTrending: input.isTrending ?? false,
      isNewArrival: input.isNewArrival ?? true,
      isActive: true,
      specs: input.specs || {},
      images: [
        {
          id: crypto.randomUUID(),
          imageUrl: input.imageUrl,
          altText: input.name,
          isPrimary: true,
        },
      ],
      stockQuantity: input.stockQuantity,
      reservedQuantity: 0,
      availableQuantity: input.stockQuantity,
      lowStockThreshold: input.lowStockThreshold ?? 5,
      warehouseCity: wh.city,
      warehouseName: wh.name,
      createdAt: new Date().toISOString(),
    };
    s.products.unshift(product);
    return product;
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
    if (isPostgresConfigured()) return pgRepo.updateProduct(productId, patch);
    const p = getMemoryState().products.find((prod) => prod.id === productId);
    if (!p) return null;
    Object.assign(p, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.brand !== undefined ? { brand: patch.brand } : {}),
      ...(patch.shortDescription !== undefined ? { shortDescription: patch.shortDescription } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.priceInr !== undefined ? { priceInr: patch.priceInr } : {}),
      ...(patch.mrpInr !== undefined ? { mrpInr: patch.mrpInr } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.isFeatured !== undefined ? { isFeatured: patch.isFeatured } : {}),
      ...(patch.isTrending !== undefined ? { isTrending: patch.isTrending } : {}),
    });
    p.discountPercent = Math.max(0, Math.round(((p.mrpInr - p.priceInr) / p.mrpInr) * 100));
    return p;
  },

  async updateProductStock(productId: string, stockQuantity: number): Promise<Product | null> {
    if (isPostgresConfigured()) return pgRepo.updateProductStock(productId, stockQuantity);
    const p = getMemoryState().products.find((prod) => prod.id === productId);
    if (!p) return null;
    p.stockQuantity = Math.max(0, stockQuantity);
    p.availableQuantity = Math.max(0, p.stockQuantity - p.reservedQuantity);
    return p;
  },

  async deleteProduct(productId: string): Promise<void> {
    if (isPostgresConfigured()) return pgRepo.deleteProduct(productId);
    const p = getMemoryState().products.find((prod) => prod.id === productId);
    if (p) p.isActive = false;
  },

  async listProductReviews(productId: string): Promise<ProductReview[]> {
    if (isPostgresConfigured()) return pgRepo.listProductReviews(productId);
    return getMemoryState().reviews.filter((r) => r.productId === productId);
  },

  async addProductReview(input: {
    productId: string;
    userId: string;
    rating: number;
    title: string;
    comment: string;
  }): Promise<ProductReview> {
    if (isPostgresConfigured()) return pgRepo.addProductReview(input);
    const s = getMemoryState();
    const u = s.users.find((usr) => usr.id === input.userId);
    const rev: ProductReview = {
      id: crypto.randomUUID(),
      productId: input.productId,
      userId: input.userId,
      userName: u?.fullName || 'Customer',
      rating: input.rating,
      title: input.title,
      comment: input.comment,
      isVerifiedPurchase: true,
      createdAt: new Date().toISOString(),
    };
    s.reviews.unshift(rev);
    return rev;
  },

  async getUserCart(userId: string): Promise<CartSummary> {
    if (isPostgresConfigured()) return pgRepo.getUserCart(userId);
    const s = getMemoryState();
    const cartMap = s.carts.get(userId) || new Map<string, number>();
    const items = Array.from(cartMap.entries())
      .map(([productId, quantity]) => {
        const p = s.products.find((prod) => prod.id === productId && prod.isActive);
        if (!p) return null;
        return {
          id: `${userId}-${productId}`,
          productId: p.id,
          sku: p.sku,
          name: p.name,
          slug: p.slug,
          brand: p.brand,
          imageUrl: p.images[0]?.imageUrl || '',
          priceInr: p.priceInr,
          mrpInr: p.mrpInr,
          quantity,
          availableQuantity: p.availableQuantity,
          lineTotalInr: Math.round(p.priceInr * quantity * 100) / 100,
        };
      })
      .filter((i): i is NonNullable<typeof i> => Boolean(i));

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
      itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
      subtotalInr: totals.subtotalInr,
      mrpSavingsInr: totals.mrpSavingsInr,
      deliveryChargeInr: totals.deliveryChargeInr,
      totalInr: totals.totalInr,
      freeDeliveryThresholdInr: totals.freeDeliveryThresholdInr,
    };
  },

  async setCartItem(userId: string, productId: string, quantity: number): Promise<CartSummary> {
    if (isPostgresConfigured()) return pgRepo.setCartItem(userId, productId, quantity);
    const s = getMemoryState();
    if (!s.carts.has(userId)) s.carts.set(userId, new Map());
    const cartMap = s.carts.get(userId)!;
    if (quantity <= 0) {
      cartMap.delete(productId);
      return this.getUserCart(userId);
    }
    const p = s.products.find((prod) => prod.id === productId && prod.isActive);
    if (!p) throw new Error('Product is unavailable.');
    if (quantity > p.availableQuantity) {
      throw new Error(`Only ${p.availableQuantity} unit(s) available for ${p.name}.`);
    }
    cartMap.set(productId, quantity);
    return this.getUserCart(userId);
  },

  async addToCart(userId: string, productId: string, deltaQty: number): Promise<CartSummary> {
    if (isPostgresConfigured()) return pgRepo.addToCart(userId, productId, deltaQty);
    const current = await this.getUserCart(userId);
    const existing = current.items.find((i) => i.productId === productId);
    return this.setCartItem(userId, productId, (existing?.quantity || 0) + deltaQty);
  },

  async clearUserCart(userId: string): Promise<void> {
    if (isPostgresConfigured()) return pgRepo.clearUserCart(userId);
    getMemoryState().carts.delete(userId);
  },

  async getUserWishlist(userId: string): Promise<Product[]> {
    if (isPostgresConfigured()) return pgRepo.getUserWishlist(userId);
    const set = getMemoryState().wishlists.get(userId) || new Set<string>();
    return this.getProductsByIds(Array.from(set));
  },

  async toggleWishlist(userId: string, productId: string): Promise<{ saved: boolean; items: Product[] }> {
    if (isPostgresConfigured()) return pgRepo.toggleWishlist(userId, productId);
    const s = getMemoryState();
    if (!s.wishlists.has(userId)) s.wishlists.set(userId, new Set());
    const set = s.wishlists.get(userId)!;
    let saved = false;
    if (set.has(productId)) {
      set.delete(productId);
      saved = false;
    } else {
      set.add(productId);
      saved = true;
    }
    return { saved, items: await this.getUserWishlist(userId) };
  },

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
  }) {
    if (isPostgresConfigured()) return pgRepo.placeOrderAtomic(input);
    const s = getMemoryState();
    if (input.items.length === 0) throw new Error('Cannot place an order with an empty cart.');

    // Synchronous atomic check-and-reserve before any await
    const resolved: Array<{ prod: Product; qty: number }> = [];
    for (const item of input.items) {
      if (item.quantity <= 0) throw new Error('Item quantity must be at least 1.');
      const prod = s.products.find((p) => p.id === item.productId && p.isActive);
      if (!prod) throw new Error(`Product ${item.productId} is no longer available.`);
      if (prod.availableQuantity < item.quantity) {
        throw new Error(
          `Insufficient stock for "${prod.name}". Available: ${prod.availableQuantity}, Requested: ${item.quantity}.`
        );
      }
      resolved.push({ prod, qty: item.quantity });
    }

    for (const { prod, qty } of resolved) {
      if (input.paymentMethod === 'cod') {
        prod.stockQuantity -= qty;
      } else {
        prod.reservedQuantity += qty;
      }
      prod.availableQuantity = Math.max(0, prod.stockQuantity - prod.reservedQuantity);
    }

    const totals = calculateCheckoutTotals(
      resolved.map(({ prod, qty }) => ({
        productId: prod.id,
        unitPriceInr: prod.priceInr,
        mrpInr: prod.mrpInr,
        quantity: qty,
      })),
      input.promoCode
    );

    const now = new Date().toISOString();
    const orderId = crypto.randomUUID();
    const orderNumber = generateOrderNumber();
    const trackingToken = `trk_${generateRandomToken(16)}`;
    const isCod = input.paymentMethod === 'cod';

    const order: Order = {
      id: orderId,
      orderNumber,
      userId: input.userId,
      status: isCod ? 'confirmed' : 'pending_payment',
      paymentStatus: isCod ? 'cod_pending' : 'pending',
      paymentMethod: input.paymentMethod,
      subtotalInr: totals.subtotalInr,
      discountInr: totals.promoDiscountInr,
      deliveryChargeInr: totals.deliveryChargeInr,
      totalInr: totals.totalInr,
      shippingName: input.shippingName,
      shippingEmail: input.shippingEmail,
      shippingPhone: input.shippingPhone,
      shippingAddress: input.shippingAddress,
      shippingCity: input.shippingCity,
      shippingState: input.shippingState,
      shippingPinCode: input.shippingPinCode,
      trackingToken,
      items: resolved.map(({ prod, qty }) => ({
        id: crypto.randomUUID(),
        productId: prod.id,
        productName: prod.name,
        productSku: prod.sku,
        imageUrl: prod.images[0]?.imageUrl,
        slug: prod.slug,
        unitPriceInr: prod.priceInr,
        quantity: qty,
        lineTotalInr: Math.round(prod.priceInr * qty * 100) / 100,
      })),
      shipment: isCod
        ? {
            carrier: 'ShelfSync Express',
            awbNumber: generateAwbNumber(),
            status: 'confirmed',
            estimatedDelivery: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
          }
        : undefined,
      trackingEvents: isCod
        ? [
            {
              id: crypto.randomUUID(),
              status: 'confirmed',
              location: input.shippingCity,
              description: 'Order confirmed (Cash on Delivery). Preparing shipment.',
              eventTime: now,
            },
          ]
        : [],
      payment: {
        provider: isCod ? 'cod' : 'razorpay',
        providerOrderId: null,
        providerPaymentId: null,
        status: isCod ? 'cod_pending' : 'created',
        method: input.paymentMethod,
      },
      createdAt: now,
      updatedAt: now,
    };

    s.orders.unshift(order);
    if (isCod) {
      s.carts.delete(input.userId);
    }

    const outboxEvent = {
      id: crypto.randomUUID(),
      topic: 'order-placed',
      eventKey: orderNumber,
      payload: {
        orderId,
        orderNumber,
        userId: input.userId,
        paymentMethod: input.paymentMethod,
        totalInr: totals.totalInr,
        items: resolved.map(({ prod, qty }) => ({
          productId: prod.id,
          sku: prod.sku,
          quantity: qty,
        })),
      },
    };
    s.outboxEvents.push({ ...outboxEvent, status: 'pending', createdAt: now });

    return { order, outboxEvent };
  },

  async attachRazorpayOrderId(orderId: string, razorpayOrderId: string): Promise<void> {
    if (isPostgresConfigured()) return pgRepo.attachRazorpayOrderId(orderId, razorpayOrderId);
    const ord = getMemoryState().orders.find((o) => o.id === orderId);
    if (ord && ord.payment) {
      ord.payment.providerOrderId = razorpayOrderId;
    }
  },

  async confirmRazorpayPayment(params: {
    orderId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    method?: string;
    rawPayload?: Record<string, unknown>;
  }): Promise<Order | null> {
    if (isPostgresConfigured()) return pgRepo.confirmRazorpayPayment(params);
    const s = getMemoryState();
    const ord = s.orders.find((o) => o.id === params.orderId);
    if (!ord) return null;
    if (ord.status !== 'pending_payment') return ord;

    for (const item of ord.items) {
      const prod = s.products.find((p) => p.id === item.productId);
      if (prod) {
        prod.stockQuantity = Math.max(0, prod.stockQuantity - item.quantity);
        prod.reservedQuantity = Math.max(0, prod.reservedQuantity - item.quantity);
        prod.availableQuantity = Math.max(0, prod.stockQuantity - prod.reservedQuantity);
      }
    }

    ord.status = 'confirmed';
    ord.paymentStatus = 'paid';
    ord.updatedAt = new Date().toISOString();
    ord.payment = {
      provider: 'razorpay',
      providerOrderId: params.razorpayOrderId,
      providerPaymentId: params.razorpayPaymentId,
      status: 'captured',
      method: params.method || 'online',
    };
    ord.shipment = {
      carrier: 'ShelfSync Express',
      awbNumber: generateAwbNumber(),
      status: 'confirmed',
      estimatedDelivery: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
    };
    ord.trackingEvents = [
      {
        id: crypto.randomUUID(),
        status: 'confirmed',
        location: ord.shippingCity,
        description: 'Payment verified via Razorpay. Order confirmed.',
        eventTime: ord.updatedAt,
      },
    ];
    s.carts.delete(ord.userId);
    return ord;
  },

  async markRazorpayPaymentFailed(orderId: string, _reason: string): Promise<Order | null> {
    if (isPostgresConfigured()) return pgRepo.markRazorpayPaymentFailed(orderId, _reason);
    const s = getMemoryState();
    const ord = s.orders.find((o) => o.id === orderId);
    if (!ord || ord.status !== 'pending_payment') return ord || null;
    for (const item of ord.items) {
      const prod = s.products.find((p) => p.id === item.productId);
      if (prod) {
        prod.reservedQuantity = Math.max(0, prod.reservedQuantity - item.quantity);
        prod.availableQuantity = Math.max(0, prod.stockQuantity - prod.reservedQuantity);
      }
    }
    ord.status = 'cancelled';
    ord.paymentStatus = 'failed';
    if (ord.payment) ord.payment.status = 'failed';
    ord.updatedAt = new Date().toISOString();
    return ord;
  },

  async findOrderIdByRazorpayOrderId(razorpayOrderId: string): Promise<string | null> {
    if (isPostgresConfigured()) return pgRepo.findOrderIdByRazorpayOrderId(razorpayOrderId);
    const ord = getMemoryState().orders.find((o) => o.payment?.providerOrderId === razorpayOrderId);
    return ord?.id || null;
  },

  async getOrderById(orderId: string): Promise<Order | null> {
    if (isPostgresConfigured()) return pgRepo.getOrderByIdInternal(null, orderId);
    return getMemoryState().orders.find((o) => o.id === orderId) || null;
  },

  async getOrderByNumber(orderNumber: string): Promise<Order | null> {
    if (isPostgresConfigured()) return pgRepo.getOrderByNumber(orderNumber);
    return (
      getMemoryState().orders.find((o) => o.orderNumber.toUpperCase() === orderNumber.toUpperCase()) ||
      null
    );
  },

  async getOrderByTrackingToken(token: string): Promise<Order | null> {
    if (isPostgresConfigured()) return pgRepo.getOrderByTrackingToken(token);
    return getMemoryState().orders.find((o) => o.trackingToken === token) || null;
  },

  async listUserOrders(userId: string): Promise<Order[]> {
    if (isPostgresConfigured()) return pgRepo.listUserOrders(userId);
    return getMemoryState().orders.filter((o) => o.userId === userId);
  },

  async listAllOrders(): Promise<Order[]> {
    if (isPostgresConfigured()) return pgRepo.listAllOrders();
    return [...getMemoryState().orders];
  },

  async updateOrderStatusAdmin(
    orderId: string,
    status: OrderStatus,
    location = 'ShelfSync Fulfillment Hub',
    description?: string
  ): Promise<Order | null> {
    if (isPostgresConfigured()) return pgRepo.updateOrderStatusAdmin(orderId, status, location, description);
    const ord = getMemoryState().orders.find((o) => o.id === orderId);
    if (!ord) return null;
    ord.status = status;
    ord.updatedAt = new Date().toISOString();
    if (!ord.shipment) {
      ord.shipment = {
        carrier: 'ShelfSync Express',
        awbNumber: generateAwbNumber(),
        status,
        estimatedDelivery: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      };
    } else {
      ord.shipment.status = status;
    }
    ord.trackingEvents = ord.trackingEvents || [];
    ord.trackingEvents.push({
      id: crypto.randomUUID(),
      status,
      location,
      description: description || `Order status updated to ${status.replace(/_/g, ' ')}.`,
      eventTime: ord.updatedAt,
    });
    if (status === 'refunded') {
      ord.paymentStatus = 'refunded';
      if (ord.payment) ord.payment.status = 'refunded';
    }
    return ord;
  },

  async claimEventProcessing(eventId: string, topic: string, consumerGroup: string): Promise<boolean> {
    if (isPostgresConfigured()) return pgRepo.claimEventProcessing(eventId, topic, consumerGroup);
    const s = getMemoryState();
    if (s.processedEvents.has(eventId)) return false;
    s.processedEvents.add(eventId);
    return true;
  },

  async markOutboxPublished(outboxId: string): Promise<void> {
    if (isPostgresConfigured()) return pgRepo.markOutboxPublished(outboxId);
    const ev = getMemoryState().outboxEvents.find((e) => e.id === outboxId);
    if (ev) ev.status = 'published';
  },

  async markOutboxFailed(outboxId: string, errorMessage: string): Promise<void> {
    if (isPostgresConfigured()) return pgRepo.markOutboxFailed(outboxId, errorMessage);
    const ev = getMemoryState().outboxEvents.find((e) => e.id === outboxId);
    if (ev) ev.status = `failed: ${errorMessage}`;
  },

  async recordNotificationLog(input: Omit<NotificationLog, 'id' | 'createdAt'>): Promise<NotificationLog | null> {
    if (isPostgresConfigured()) return pgRepo.recordNotificationLog(input);
    const s = getMemoryState();
    if (s.notificationLogs.some((l) => l.dedupeKey === input.dedupeKey)) {
      return null;
    }
    const created: NotificationLog = {
      id: crypto.randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
    };
    s.notificationLogs.unshift(created);
    return created;
  },

  async listNotificationLogs(): Promise<NotificationLog[]> {
    if (isPostgresConfigured()) return pgRepo.listNotificationLogs();
    return [...getMemoryState().notificationLogs];
  },

  async getAdminStats() {
    if (isPostgresConfigured()) return pgRepo.getAdminStats();
    const s = getMemoryState();
    const activeOrders = s.orders.filter((o) => o.status !== 'cancelled' && o.status !== 'refunded');
    return {
      totalRevenueInr: activeOrders.reduce((sum, o) => sum + o.totalInr, 0),
      totalOrders: s.orders.length,
      pendingOrders: s.orders.filter((o) => ['pending_payment', 'confirmed', 'packed'].includes(o.status)).length,
      totalCustomers: s.users.filter((u) => u.role === 'customer').length,
      totalProducts: s.products.filter((p) => p.isActive).length,
    };
  },
};
