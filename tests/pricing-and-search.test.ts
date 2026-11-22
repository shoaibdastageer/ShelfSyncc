import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  calculateCheckoutTotals,
  evaluatePromoCode,
  parseNaturalSearchQuery,
} from '../backend/src/utils/pricing';
import { filterAndRankProducts } from '../backend/src/utils/fuzzySearch';
import { getMemoryState, resetMemoryStateForTests } from '../backend/src/db/memoryStore';
import {
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
  verifyWhatsAppWebhookSignature,
} from '../backend/src/utils/crypto';

test('checkout calculation applies free delivery at ₹999 and ₹79 below ₹999', () => {
  const below = calculateCheckoutTotals([
    { productId: 'p1', unitPriceInr: 699, mrpInr: 899, quantity: 1 },
  ]);
  assert.equal(below.subtotalInr, 699);
  assert.equal(below.mrpSavingsInr, 200);
  assert.equal(below.deliveryChargeInr, 79);
  assert.equal(below.totalInr, 778);

  const above = calculateCheckoutTotals([
    { productId: 'p1', unitPriceInr: 1499, mrpInr: 3499, quantity: 1 },
  ]);
  assert.equal(above.deliveryChargeInr, 0);
  assert.equal(above.totalInr, 1499);
});

test('promo code SHELF10 calculates capped 10% discount', () => {
  const res = evaluatePromoCode(2000, 'shelf10');
  assert.equal(res.code, 'SHELF10');
  assert.equal(res.discountInr, 200);

  const capped = evaluatePromoCode(10000, 'SHELF10');
  assert.equal(capped.discountInr, 500);
});

test('natural search query parser extracts budget from typo query', () => {
  const parsed = parseNaturalSearchQuery('bluetoth hedphones under 1500');
  assert.equal(parsed.maxPrice, 1500);
  assert.equal(parsed.cleanedQuery, 'bluetoth hedphones');
});

test('fuzzy search resolves "bluetoth hedphones under 1500" to matching audio items under ₹1,500', () => {
  resetMemoryStateForTests();
  const products = getMemoryState().products;
  const result = filterAndRankProducts(products, { q: 'bluetoth hedphones under 1500' });
  assert.ok(result.products.length >= 1, 'Expected at least 1 fuzzy match');
  for (const p of result.products) {
    assert.ok(p.priceInr <= 1500, `Expected price <= 1500, got ${p.priceInr}`);
  }
});

test('Razorpay and WhatsApp HMAC-SHA256 signature verification', () => {
  const secret = 'rzp_test_secret_123';
  const sig = crypto
    .createHmac('sha256', secret)
    .update('order_abc|pay_xyz')
    .digest('hex');

  assert.equal(
    verifyRazorpayPaymentSignature({
      razorpayOrderId: 'order_abc',
      razorpayPaymentId: 'pay_xyz',
      razorpaySignature: sig,
      keySecret: secret,
    }),
    true
  );

  assert.equal(
    verifyRazorpayPaymentSignature({
      razorpayOrderId: 'order_abc',
      razorpayPaymentId: 'pay_xyz',
      razorpaySignature: 'tampered',
      keySecret: secret,
    }),
    false
  );

  const payload = JSON.stringify({ event: 'payment.captured' });
  const whSig = crypto.createHmac('sha256', 'wh_secret').update(payload).digest('hex');
  assert.equal(verifyRazorpayWebhookSignature(payload, whSig, 'wh_secret'), true);

  const waSig = `sha256=${crypto.createHmac('sha256', 'wa_secret').update(payload).digest('hex')}`;
  assert.equal(verifyWhatsAppWebhookSignature(payload, waSig, 'wa_secret'), true);
});
