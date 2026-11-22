import crypto from 'node:crypto';

export function generateRandomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function generateOrderNumber(): string {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `SS${num}`;
}

export function generateAwbNumber(): string {
  const num = Math.floor(10000000 + Math.random() * 90000000);
  return `SSX${num}`;
}

/**
 * Verifies Razorpay Checkout signature:
 * HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, RAZORPAY_KEY_SECRET)
 */
export function verifyRazorpayPaymentSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  keySecret: string;
}): boolean {
  if (!params.keySecret || !params.razorpayOrderId || !params.razorpayPaymentId || !params.razorpaySignature) {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', params.keySecret)
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(params.razorpaySignature, 'utf8');
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Verifies Razorpay Webhook signature from X-Razorpay-Signature header
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string | Buffer,
  signature: string | undefined,
  webhookSecret: string
): boolean {
  if (!signature || !webhookSecret) {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Verifies Meta WhatsApp Cloud API webhook signature from X-Hub-Signature-256 header
 */
export function verifyWhatsAppWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader || !appSecret) {
    return false;
  }
  const provided = signatureHeader.replace(/^sha256=/i, '').trim();
  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(provided, 'utf8');
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
