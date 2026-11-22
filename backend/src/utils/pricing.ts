export interface CartLineInput {
  productId: string;
  unitPriceInr: number;
  mrpInr: number;
  quantity: number;
}

export interface PromoResult {
  code: string | null;
  discountInr: number;
  description: string | null;
}

export interface CheckoutTotals {
  subtotalInr: number;
  mrpSavingsInr: number;
  promoDiscountInr: number;
  deliveryChargeInr: number;
  totalInr: number;
  freeDeliveryThresholdInr: number;
  appliedPromoCode: string | null;
}

export const FREE_DELIVERY_THRESHOLD_INR = 999;
export const STANDARD_DELIVERY_FEE_INR = 79;

const PROMO_CODES: Record<string, { type: 'percent' | 'flat'; value: number; minOrder: number; maxDiscount?: number }> = {
  SHELF10: { type: 'percent', value: 10, minOrder: 500, maxDiscount: 500 },
  WELCOME200: { type: 'flat', value: 200, minOrder: 1499 },
  FESTIVE15: { type: 'percent', value: 15, minOrder: 2000, maxDiscount: 1200 },
};

export function roundInr(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function evaluatePromoCode(subtotalInr: number, promoCode?: string | null): PromoResult {
  const normalized = (promoCode || '').trim().toUpperCase();
  if (!normalized) {
    return { code: null, discountInr: 0, description: null };
  }
  const rule = PROMO_CODES[normalized];
  if (!rule || subtotalInr < rule.minOrder) {
    return { code: null, discountInr: 0, description: null };
  }
  let discount = rule.type === 'percent' ? (subtotalInr * rule.value) / 100 : rule.value;
  if (rule.maxDiscount !== undefined) {
    discount = Math.min(discount, rule.maxDiscount);
  }
  discount = Math.min(discount, subtotalInr);
  return {
    code: normalized,
    discountInr: roundInr(discount),
    description:
      rule.type === 'percent'
        ? `${rule.value}% off (up to ₹${rule.maxDiscount ?? 'unlimited'})`
        : `Flat ₹${rule.value} off`,
  };
}

export function calculateCheckoutTotals(
  items: CartLineInput[],
  promoCode?: string | null
): CheckoutTotals {
  let subtotal = 0;
  let mrpTotal = 0;

  for (const item of items) {
    if (item.quantity <= 0) continue;
    subtotal += item.unitPriceInr * item.quantity;
    mrpTotal += Math.max(item.mrpInr, item.unitPriceInr) * item.quantity;
  }

  subtotal = roundInr(subtotal);
  mrpTotal = roundInr(mrpTotal);
  const mrpSavingsInr = roundInr(Math.max(0, mrpTotal - subtotal));

  const promo = evaluatePromoCode(subtotal, promoCode);
  const netAfterPromo = roundInr(Math.max(0, subtotal - promo.discountInr));
  const deliveryChargeInr =
    netAfterPromo === 0 || netAfterPromo >= FREE_DELIVERY_THRESHOLD_INR
      ? 0
      : STANDARD_DELIVERY_FEE_INR;

  const totalInr = roundInr(netAfterPromo + deliveryChargeInr);

  return {
    subtotalInr: subtotal,
    mrpSavingsInr,
    promoDiscountInr: promo.discountInr,
    deliveryChargeInr,
    totalInr,
    freeDeliveryThresholdInr: FREE_DELIVERY_THRESHOLD_INR,
    appliedPromoCode: promo.code,
  };
}

export interface ParsedSearchIntent {
  cleanedQuery: string;
  maxPrice?: number;
  minPrice?: number;
  detectedCategorySlug?: string;
}

/**
 * Extracts natural-language budget & category hints from queries such as:
 * "bluetoth hedphones under 1500" or "running shoes below 3000"
 */
export function parseNaturalSearchQuery(rawQuery: string): ParsedSearchIntent {
  const input = (rawQuery || '').trim();
  if (!input) {
    return { cleanedQuery: '' };
  }

  let cleaned = input;
  let maxPrice: number | undefined;
  let minPrice: number | undefined;

  const underMatch = cleaned.match(/(?:under|below|less\s+than|max|upto|up\s+to)\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*)/i);
  if (underMatch) {
    const parsed = Number(underMatch[1].replace(/,/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) {
      maxPrice = parsed;
    }
    cleaned = cleaned.replace(underMatch[0], ' ');
  }

  const aboveMatch = cleaned.match(/(?:above|over|more\s+than|min)\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*)/i);
  if (aboveMatch) {
    const parsed = Number(aboveMatch[1].replace(/,/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) {
      minPrice = parsed;
    }
    cleaned = cleaned.replace(aboveMatch[0], ' ');
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return {
    cleanedQuery: cleaned || input,
    maxPrice,
    minPrice,
  };
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}
