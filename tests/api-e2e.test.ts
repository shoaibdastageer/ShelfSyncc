import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { createApiApp } from '../backend/src/app';
import { resetMemoryStateForTests } from '../backend/src/db/memoryStore';
import { env } from '../backend/src/config/env';

let server: http.Server;
let baseUrl = '';

async function request(
  path: string,
  options: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}
) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, text };
}

test.before(async () => {
  resetMemoryStateForTests();
  const app = createApiApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('Auth, RBAC, and profile isolation work end-to-end', async () => {
  // Register customer
  const reg = await request('/api/auth/register', {
    method: 'POST',
    body: {
      fullName: 'Meera Iyer',
      email: 'meera@example.in',
      phone: '+919822334455',
      password: 'Password@123',
    },
  });
  assert.equal(reg.status, 201);
  const customerToken = String(reg.json.token);

  // Verify email
  const verify = await request('/api/auth/verify-email', {
    method: 'POST',
    body: { token: reg.json.verificationToken },
  });
  assert.equal(verify.status, 200);

  // Customer cannot access Admin routes
  const forbidden = await request('/api/admin/overview', { token: customerToken });
  assert.equal(forbidden.status, 403);

  // Customer cannot access another customer's order #SS1025
  const otherOrder = await request('/api/orders/SS1025', { token: customerToken });
  assert.equal(otherOrder.status, 403);

  // Admin can access /api/admin/overview
  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@shelfsync.in', password: 'Admin@1234' },
  });
  assert.equal(adminLogin.status, 200);
  const adminOverview = await request('/api/admin/overview', {
    token: String(adminLogin.json.token),
  });
  assert.equal(adminOverview.status, 200);
});

test('Cart validates stock and prevents exceeding available quantity', async () => {
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'aarav@shelfsync.in', password: 'Customer@123' },
  });
  const token = String(login.json.token);

  // Find stock=1 product SS-BP-503
  const listRes = await request('/api/products');
  const products = listRes.json.products as Array<{ id: string; sku: string }>;
  const limited = products.find((p) => p.sku === 'SS-BP-503')!;
  assert.ok(limited);

  const tooMany = await request('/api/cart/items', {
    method: 'POST',
    token,
    body: { productId: limited.id, quantity: 3 },
  });
  assert.equal(tooMany.status, 409);

  const validAdd = await request('/api/cart/items', {
    method: 'POST',
    token,
    body: { productId: limited.id, quantity: 1 },
  });
  assert.equal(validAdd.status, 200);
});

test('Concurrent orders on stock=1 product allow only ONE winner and reject the second', async () => {
  const cust1 = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'aarav@shelfsync.in', password: 'Customer@123' },
  });
  const cust2 = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'meera@example.in', password: 'Password@123' },
  });

  const listRes = await request('/api/products');
  const products = listRes.json.products as Array<{ id: string; sku: string; availableQuantity: number }>;
  const limited = products.find((p) => p.sku === 'SS-BP-503')!;
  assert.equal(limited.availableQuantity, 1);

  const checkoutPayload = {
    paymentMethod: 'cod',
    shippingName: 'Concurrent Shopper',
    shippingEmail: 'shopper@shelfsync.in',
    shippingPhone: '+919876543210',
    shippingAddress: '12 MG Road',
    shippingCity: 'Bengaluru',
    shippingState: 'Karnataka',
    shippingPinCode: '560001',
    items: [{ productId: limited.id, quantity: 1 }],
  };

  const [res1, res2] = await Promise.all([
    request('/api/checkout/orders', { method: 'POST', token: String(cust1.json.token), body: checkoutPayload }),
    request('/api/checkout/orders', { method: 'POST', token: String(cust2.json.token), body: checkoutPayload }),
  ]);

  const statuses = [res1.status, res2.status].sort((a, b) => a - b);
  assert.deepEqual(statuses, [201, 409], `Expected one 201 and one 409, got ${statuses.join(', ')}`);

  // Verify stock is now 0
  const after = await request(`/api/products/${'forest-essentials-sandalwood-grooming-set'}`);
  assert.equal((after.json.product as { availableQuantity: number }).availableQuantity, 0);
});

test('Razorpay webhook verification and duplicate webhook idempotency', async () => {
  env.razorpayWebhookSecret = 'test_webhook_secret_xyz';
  const payload = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_test_999',
          order_id: 'order_nonexistent_test',
          method: 'upi',
        },
      },
    },
  };
  const raw = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', env.razorpayWebhookSecret).update(raw).digest('hex');

  const first = await request('/api/webhooks/razorpay', {
    method: 'POST',
    body: payload,
    headers: { 'x-razorpay-signature': sig },
  });
  assert.equal(first.status, 200);
  assert.equal(first.json.duplicate, undefined);

  const duplicate = await request('/api/webhooks/razorpay', {
    method: 'POST',
    body: payload,
    headers: { 'x-razorpay-signature': sig },
  });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.json.duplicate, true);
});

test('WhatsApp webhook verification, inbound AI Assistant discovery, and policy boundaries', async () => {
  const challengeRes = await fetch(
    `${baseUrl}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${env.whatsappVerifyToken}&hub.challenge=12345`
  );
  assert.equal(challengeRes.status, 200);
  assert.equal(await challengeRes.text(), '12345');

  const assistantRes = await request('/api/assistant/discover', {
    method: 'POST',
    body: { message: 'Suggest wireless earphones under ₹1,000' },
  });
  assert.equal(assistantRes.status, 200);
  const recs = assistantRes.json.recommendations as Array<{ priceInr: number }>;
  assert.ok(recs.length >= 1);
  assert.ok(recs.every((r) => r.priceInr <= 1000));

  // Strict rule: WhatsApp assistant must refuse checkout/payment requests
  const checkoutRefusal = await request('/api/assistant/discover', {
    method: 'POST',
    body: { message: 'Please place order and pay now via UPI' },
  });
  assert.equal(checkoutRefusal.status, 200);
  assert.equal((checkoutRefusal.json.recommendations as unknown[]).length, 0);
  assert.match(String(checkoutRefusal.json.replyText), /website/i);
});
