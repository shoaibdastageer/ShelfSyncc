import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env, getConfiguredCapabilities } from './config/env';
import { pingPostgres } from './db/pgClient';
import { getKafkaStatus } from './kafka/kafkaService';
import { pingOpenSearch } from './opensearch/opensearchService';
import { optionalAuth } from './middleware/auth';
import authRoutes from './routes/authRoutes';
import catalogRoutes from './routes/catalogRoutes';
import commerceRoutes from './routes/commerceRoutes';
import webhookRoutes from './routes/webhookRoutes';
import adminRoutes from './routes/adminRoutes';

export function createApiApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as Request).rawBody = buf;
      },
    })
  );

  app.use(cookieParser());
  app.use(optionalAuth);

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api', apiLimiter);

  // Honest live health check across all integrations
  app.get('/api/health', async (_req, res) => {
    const [postgres, kafka, opensearch] = await Promise.all([
      pingPostgres(),
      getKafkaStatus(),
      pingOpenSearch(),
    ]);
    const caps = getConfiguredCapabilities();

    res.json({
      service: 'ShelfSync API',
      ok: true,
      timestamp: new Date().toISOString(),
      databaseMode: postgres.status === 'connected' ? 'postgresql' : 'preview-memory-fallback',
      integrations: {
        postgres,
        kafka,
        opensearch,
        razorpay: {
          status: caps.razorpay
            ? env.razorpayKeyId.startsWith('rzp_test_')
              ? 'sandbox_configured'
              : 'live_configured'
            : 'unconfigured',
        },
        gemini: {
          status: caps.gemini ? 'configured' : 'unconfigured',
        },
        whatsapp: {
          status: caps.whatsapp ? 'configured' : 'unconfigured_test_mode',
        },
      },
    });
  });

  app.use('/api', authRoutes);
  app.use('/api', catalogRoutes);
  app.use('/api', commerceRoutes);
  app.use('/api', webhookRoutes);
  app.use('/api', adminRoutes);

  // Consistent JSON error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    console.error('[ShelfSync API Error]:', err);
    res.status(500).json({ error: message });
  });

  return app;
}
