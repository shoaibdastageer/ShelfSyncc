import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type {
  Address,
  Category,
  NotificationLog,
  Order,
  Product,
  ProductReview,
  UserRecord,
  Warehouse,
} from '../types/domain';
import { SEED_CATEGORIES, SEED_PRODUCTS, SEED_WAREHOUSES } from '../../../database/seed/catalogData';

export interface MemoryState {
  users: UserRecord[];
  addresses: Address[];
  categories: Category[];
  warehouses: Warehouse[];
  products: Product[];
  carts: Map<string, Map<string, number>>; // userId -> (productId -> qty)
  wishlists: Map<string, Set<string>>; // userId -> Set<productId>
  orders: Order[];
  reviews: ProductReview[];
  notificationLogs: NotificationLog[];
  processedEvents: Set<string>;
  outboxEvents: Array<{
    id: string;
    topic: string;
    eventKey: string;
    payload: Record<string, unknown>;
    status: string;
    createdAt: string;
  }>;
}

let state: MemoryState | null = null;

export function getMemoryState(): MemoryState {
  if (state) return state;

  const now = new Date().toISOString();
  const customerId = '11111111-1111-4111-8111-111111111111';
  const adminId = '22222222-2222-4222-8222-222222222222';

  const customerHash = bcrypt.hashSync('Customer@123', 8);
  const adminHash = bcrypt.hashSync('Admin@1234', 8);

  const users: UserRecord[] = [
    {
      id: customerId,
      role: 'customer',
      fullName: 'Aarav Sharma',
      email: 'aarav@shelfsync.in',
      phone: '+919876543210',
      passwordHash: customerHash,
      emailVerified: true,
      verificationToken: null,
      resetToken: null,
      resetTokenExpiresAt: null,
      whatsappOptIn: true,
      createdAt: now,
    },
    {
      id: adminId,
      role: 'admin',
      fullName: 'Priya Nair (Admin)',
      email: 'admin@shelfsync.in',
      phone: '+919811112222',
      passwordHash: adminHash,
      emailVerified: true,
      verificationToken: null,
      resetToken: null,
      resetTokenExpiresAt: null,
      whatsappOptIn: true,
      createdAt: now,
    },
  ];

  const addresses: Address[] = [
    {
      id: crypto.randomUUID(),
      userId: customerId,
      label: 'Home',
      fullName: 'Aarav Sharma',
      phone: '+919876543210',
      line1: '42 Indiranagar 100 Feet Road',
      line2: 'Near CMH Park',
      city: 'Bengaluru',
      state: 'Karnataka',
      pinCode: '560038',
      isDefault: true,
      createdAt: now,
    },
  ];

  const categories: Category[] = SEED_CATEGORIES.map((c, idx) => ({
    id: `cat-${idx + 1}`,
    name: c.name,
    slug: c.slug,
    description: c.description,
    imageUrl: c.imageUrl,
    displayOrder: c.displayOrder,
  }));

  const catBySlug = new Map(categories.map((c) => [c.slug, c]));

  const warehouses: Warehouse[] = SEED_WAREHOUSES.map((w, idx) => ({
    id: `wh-${idx + 1}`,
    code: w.code,
    name: w.name,
    city: w.city,
    state: w.state,
    pinCode: w.pinCode,
  }));

  const whByCode = new Map(warehouses.map((w) => [w.code, w]));

  const products: Product[] = SEED_PRODUCTS.map((p, idx) => {
    const cat = catBySlug.get(p.categorySlug)!;
    const wh = whByCode.get(p.warehouseCode)!;
    const discountPercent = Math.max(0, Math.round(((p.mrpInr - p.priceInr) / p.mrpInr) * 100));
    const createdAt = new Date(Date.now() - (SEED_PRODUCTS.length - idx) * 86400000).toISOString();
    return {
      id: `prod-${idx + 1}`,
      sku: p.sku,
      name: p.name,
      slug: p.slug,
      brand: p.brand,
      categoryId: cat.id,
      categoryName: cat.name,
      categorySlug: cat.slug,
      shortDescription: p.shortDescription,
      description: p.description,
      priceInr: p.priceInr,
      mrpInr: p.mrpInr,
      discountPercent,
      ratingAvg: p.ratingAvg,
      reviewCount: p.reviewCount,
      isFeatured: p.isFeatured,
      isBestseller: p.isBestseller,
      isTrending: p.isTrending,
      isNewArrival: p.isNewArrival,
      isActive: true,
      specs: p.specs,
      images: [
        {
          id: `img-${idx + 1}`,
          imageUrl: p.imageUrl,
          altText: p.name,
          isPrimary: true,
        },
      ],
      stockQuantity: p.stockQuantity,
      reservedQuantity: 0,
      availableQuantity: p.stockQuantity,
      lowStockThreshold: p.lowStockThreshold,
      warehouseCity: wh.city,
      warehouseName: wh.name,
      createdAt,
    };
  });

  const reviews: ProductReview[] = [
    {
      id: 'rev-1',
      productId: 'prod-1',
      userId: customerId,
      userName: 'Aarav Sharma',
      rating: 5,
      title: 'Great noise cancellation on Bengaluru Metro',
      comment: 'Battery easily lasts a full week of commuting and lectures. Comfortable over glasses.',
      isVerifiedPurchase: true,
      createdAt: now,
    },
    {
      id: 'rev-2',
      productId: 'prod-4',
      userId: customerId,
      userName: 'Rohan Kulkarni',
      rating: 5,
      title: 'Handles Docker & VS Code smoothly',
      comment: '16GB RAM out of the box makes this ideal for CSE projects and labs.',
      isVerifiedPurchase: true,
      createdAt: now,
    },
  ];

  // Seed one historical order for customer order history demonstration
  const sampleOrder: Order = {
    id: 'ord-seed-1',
    orderNumber: 'SS1025',
    userId: customerId,
    status: 'delivered',
    paymentStatus: 'paid',
    paymentMethod: 'razorpay',
    subtotalInr: 1499,
    discountInr: 0,
    deliveryChargeInr: 0,
    totalInr: 1499,
    shippingName: 'Aarav Sharma',
    shippingEmail: 'aarav@shelfsync.in',
    shippingPhone: '+919876543210',
    shippingAddress: '42 Indiranagar 100 Feet Road, Near CMH Park',
    shippingCity: 'Bengaluru',
    shippingState: 'Karnataka',
    shippingPinCode: '560038',
    trackingToken: 'trk_ss1025_seed_demo',
    items: [
      {
        id: 'oi-seed-1',
        productId: 'prod-1',
        productName: 'boAt Nirvana Zenith ANC Wireless Headphones',
        productSku: 'SS-EL-101',
        imageUrl: products[0].images[0].imageUrl,
        slug: products[0].slug,
        unitPriceInr: 1499,
        quantity: 1,
        lineTotalInr: 1499,
      },
    ],
    shipment: {
      carrier: 'ShelfSync Express',
      awbNumber: 'SSX90124578',
      status: 'delivered',
      estimatedDelivery: now.slice(0, 10),
    },
    trackingEvents: [
      {
        id: 'te-1',
        status: 'confirmed',
        location: 'Bengaluru Whitefield Hub',
        description: 'Order confirmed & payment verified via Razorpay.',
        eventTime: new Date(Date.now() - 3 * 86400000).toISOString(),
      },
      {
        id: 'te-2',
        status: 'shipped',
        location: 'Bengaluru Sortation Center',
        description: 'Dispatched via ShelfSync Express (AWB: SSX90124578).',
        eventTime: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
      {
        id: 'te-3',
        status: 'delivered',
        location: 'Indiranagar, Bengaluru',
        description: 'Delivered to customer at doorstep.',
        eventTime: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
    ],
    payment: {
      provider: 'razorpay',
      providerOrderId: 'order_seed_1025',
      providerPaymentId: 'pay_seed_1025',
      status: 'captured',
      method: 'upi',
    },
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  };

  state = {
    users,
    addresses,
    categories,
    warehouses,
    products,
    carts: new Map(),
    wishlists: new Map([[customerId, new Set(['prod-4', 'prod-11'])]]),
    orders: [sampleOrder],
    reviews,
    notificationLogs: [],
    processedEvents: new Set(),
    outboxEvents: [],
  };

  return state;
}

export function resetMemoryStateForTests() {
  state = null;
}
