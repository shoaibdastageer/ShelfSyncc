import Razorpay from 'razorpay';
import { env } from '../config/env';
import { verifyRazorpayPaymentSignature, verifyRazorpayWebhookSignature } from '../utils/crypto';

let razorpayInstance: Razorpay | null = null;

export function isRazorpayConfigured(): boolean {
  return Boolean(env.razorpayKeyId && env.razorpayKeySecret);
}

export function isRazorpaySandboxKey(): boolean {
  return env.razorpayKeyId.startsWith('rzp_test_');
}

function getRazorpayClient(): Razorpay | null {
  if (!isRazorpayConfigured()) return null;
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: env.razorpayKeyId,
      key_secret: env.razorpayKeySecret,
    });
  }
  return razorpayInstance;
}

export const razorpayService = {
  getConfigSummary() {
    return {
      configured: isRazorpayConfigured(),
      mode: !isRazorpayConfigured()
        ? 'unconfigured'
        : isRazorpaySandboxKey()
          ? 'sandbox'
          : 'live',
      keyId: isRazorpayConfigured() ? env.razorpayKeyId : null,
    };
  },

  async createGatewayOrder(params: {
    amountInr: number;
    receiptOrderNumber: string;
    notes?: Record<string, string>;
  }): Promise<{
    providerOrderId: string;
    amountPaise: number;
    currency: string;
    keyId: string;
    mode: 'sandbox' | 'live';
  }> {
    const client = getRazorpayClient();
    if (!client) {
      throw new Error(
        'Razorpay credentials (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) are not configured on the server.'
      );
    }

    const amountPaise = Math.round(params.amountInr * 100);
    const created = await client.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: params.receiptOrderNumber,
      notes: params.notes || {},
    });

    return {
      providerOrderId: created.id,
      amountPaise: Number(created.amount),
      currency: created.currency,
      keyId: env.razorpayKeyId,
      mode: isRazorpaySandboxKey() ? 'sandbox' : 'live',
    };
  },

  verifyCheckoutSignature(params: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): boolean {
    return verifyRazorpayPaymentSignature({
      ...params,
      keySecret: env.razorpayKeySecret,
    });
  },

  verifyWebhookSignature(rawBody: string | Buffer, signatureHeader: string | undefined): boolean {
    return verifyRazorpayWebhookSignature(rawBody, signatureHeader, env.razorpayWebhookSecret);
  },
};
