import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000',

  jwtSecret: process.env.JWT_SECRET || 'shelfsync-dev-jwt-secret-change-in-production',
  sessionSecret: process.env.SESSION_SECRET || 'shelfsync-dev-session-secret-change-in-production',

  // Aiven PostgreSQL
  databaseUrl: (process.env.DATABASE_URL || '').trim(),
  pgCaCert: (process.env.PG_CA_CERT || '').replace(/\\n/g, '\n').trim(),
  pgSslRejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED === 'true',

  // Aiven Apache Kafka
  kafkaBrokers: (process.env.KAFKA_BROKERS || '')
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean),
  kafkaUsername: (process.env.KAFKA_USERNAME || '').trim(),
  kafkaPassword: (process.env.KAFKA_PASSWORD || '').trim(),
  kafkaCaCert: (process.env.KAFKA_CA_CERT || '').replace(/\\n/g, '\n').trim(),
  kafkaClientId: process.env.KAFKA_CLIENT_ID || 'shelfsync-backend',
  kafkaGroupId: process.env.KAFKA_GROUP_ID || 'shelfsync-workers',

  // Aiven OpenSearch
  opensearchUrl: (process.env.OPENSEARCH_URL || '').trim(),
  opensearchUsername: (process.env.OPENSEARCH_USERNAME || '').trim(),
  opensearchPassword: (process.env.OPENSEARCH_PASSWORD || '').trim(),
  opensearchIndex: process.env.OPENSEARCH_INDEX || 'shelfsync_products',

  // Razorpay
  razorpayKeyId: (process.env.RAZORPAY_KEY_ID || '').trim(),
  razorpayKeySecret: (process.env.RAZORPAY_KEY_SECRET || '').trim(),
  razorpayWebhookSecret: (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim(),

  // Gemini API
  geminiApiKey: (process.env.GEMINI_API_KEY || '').trim(),

  // Meta WhatsApp Business Cloud API
  whatsappAccessToken: (process.env.WHATSAPP_ACCESS_TOKEN || '').trim(),
  whatsappPhoneNumberId: (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim(),
  whatsappBusinessAccountId: (process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '').trim(),
  whatsappVerifyToken: (process.env.WHATSAPP_VERIFY_TOKEN || 'shelfsync_whatsapp_verify_token').trim(),
  whatsappAppSecret: (process.env.WHATSAPP_APP_SECRET || '').trim(),
  whatsappTemplateOrderConfirmed:
    process.env.WHATSAPP_TEMPLATE_ORDER_CONFIRMED || 'shelfsync_order_confirmed',
  whatsappTemplateOrderStatus:
    process.env.WHATSAPP_TEMPLATE_ORDER_STATUS || 'shelfsync_order_status',
};

export function getConfiguredCapabilities() {
  return {
    postgres: Boolean(env.databaseUrl),
    kafka: env.kafkaBrokers.length > 0,
    opensearch: Boolean(env.opensearchUrl),
    razorpay: Boolean(env.razorpayKeyId && env.razorpayKeySecret),
    gemini: Boolean(env.geminiApiKey),
    whatsapp: Boolean(env.whatsappAccessToken && env.whatsappPhoneNumberId),
  };
}
