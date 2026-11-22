import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { env } from './backend/src/config/env';
import { createApiApp } from './backend/src/app';
import { ensurePgReady } from './backend/src/db/pgClient';
import { initEventWorkers } from './backend/src/services/eventOrchestrator';

async function startServer() {
  await ensurePgReady().catch((err) => {
    console.error('[ShelfSync] PostgreSQL startup initialization warning:', err instanceof Error ? err.message : err);
  });

  const app = createApiApp();
  const isProd = env.nodeEnv === 'production';

  await initEventWorkers().catch((err) => {
    console.warn('[ShelfSync] Event worker startup notice:', err instanceof Error ? err.message : err);
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api/')) {
        next();
        return;
      }
      try {
        const htmlPath = path.resolve(process.cwd(), 'index.html');
        let html = fs.readFileSync(htmlPath, 'utf8');
        html = await vite.transformIndexHtml(req.originalUrl, html);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(env.port, '0.0.0.0', () => {
    console.log(`[ShelfSync] Server running on http://0.0.0.0:${env.port} (${env.nodeEnv})`);
  });
}

startServer().catch((err) => {
  console.error('[ShelfSync] Failed to start server:', err);
  process.exit(1);
});
