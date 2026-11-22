export type UserRole = 'customer' | 'admin';

export interface User {
  id: string;
  role: UserRole;
  fullName: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  whatsappOptIn: boolean;
  createdAt: string;
}

export interface Address {
  id: string;
  userId: string;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pinCode: string;
  isDefault: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  displayOrder: number;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  pinCode: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  slug: string;
  brand: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  shortDescription: string;
  description: string;
  priceInr: number;
  mrpInr: number;
  discountPercent: number;
  ratingAvg: number;
  reviewCount: number;
  isFeatured: boolean;
  isBestseller: boolean;
  isTrending: boolean;
  isNewArrival: boolean;
  isActive: boolean;
  specs: Record<string, string>;
  images: Array<{
    id: string;
    imageUrl: string;
    altText: string;
    isPrimary: boolean;
  }>;
  stockQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  lowStockThreshold: number;
  warehouseCity: string;
  warehouseName: string;
  createdAt: string;
}

export interface ProductReview {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  title: string;
  comment: string;
  isVerifiedPurchase: boolean;
  createdAt: string;
}

export interface CartItem {
  id: string;
  productId: string;
  sku: string;
  name: string;
  slug: string;
  brand: string;
  imageUrl: string;
  priceInr: number;
  mrpInr: number;
  quantity: number;
  availableQuantity: number;
  lineTotalInr: number;
}

export interface CartSummary {
  items: CartItem[];
  itemCount: number;
  subtotalInr: number;
  mrpSavingsInr: number;
  deliveryChargeInr: number;
  totalInr: number;
  freeDeliveryThresholdInr: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: string;
  paymentStatus: string;
  paymentMethod: 'razorpay' | 'cod';
  subtotalInr: number;
  discountInr: number;
  deliveryChargeInr: number;
  totalInr: number;
  shippingName: string;
  shippingEmail: string;
  shippingPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  shippingPinCode: string;
  trackingToken: string;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    productSku: string;
    imageUrl?: string;
    slug?: string;
    unitPriceInr: number;
    quantity: number;
    lineTotalInr: number;
  }>;
  shipment?: {
    carrier: string;
    awbNumber: string;
    status: string;
    estimatedDelivery: string;
  };
  trackingEvents?: Array<{
    id: string;
    status: string;
    location: string;
    description: string;
    eventTime: string;
  }>;
  payment?: {
    provider: string;
    providerOrderId: string | null;
    providerPaymentId: string | null;
    status: string;
    method: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface NotificationLog {
  id: string;
  userId: string | null;
  orderId: string | null;
  channel: string;
  recipientPhone: string;
  templateName: string;
  messageBody: string;
  status: 'pending' | 'sent' | 'failed' | 'test_mode';
  providerMessageId: string | null;
  dedupeKey: string;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface SearchResponse {
  products: Product[];
  total: number;
  engine: 'opensearch' | 'postgresql' | 'memory-fallback';
  parsedIntent?: {
    cleanedQuery: string;
    minPrice?: number;
    maxPrice?: number;
  };
  facets: {
    categories: Array<{ name: string; slug: string; count: number }>;
    brands: Array<{ name: string; count: number }>;
    cities: Array<{ name: string; count: number }>;
  };
}
