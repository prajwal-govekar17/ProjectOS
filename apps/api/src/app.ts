import { randomUUID } from 'node:crypto';
import express from 'express';
import type { Pool } from 'pg';
import { createAuthRoutes } from './auth/auth.routes.ts';
import { createSessionMiddleware } from './auth/session.ts';
import { isDatabaseReady } from './db/migrate.ts';
import type { Migration } from './db/migrate.ts';
import { errorHandler, sendError } from './middleware/error-handler.ts';
import { createDecisionRoutes } from './modules/decisions/decision.routes.ts';
import { createProjectRoutes } from './modules/projects/project.routes.ts';

interface AppDependencies {
  createRequestId?: () => string;
  database?: { pool: Pool; migrations: Migration[]; sessionSecret: string; appOrigin: string };
}

const JSON_BODY_LIMIT = 2 * 1024 * 1024;

export function createApp({ createRequestId = randomUUID, database }: AppDependencies = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.set('X-Request-ID', createRequestId());
    next();
  });

  app.get('/healthz', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/readyz', async (_request, response) => {
    response.set('Cache-Control', 'no-store');
    const isReady =
      database && (await isDatabaseReady(database.pool, database.migrations).catch(() => false));
    if (!isReady) {
      sendError(
        response,
        503,
        'SERVICE_UNAVAILABLE',
        'Database or required migrations are unavailable.',
      );
      return;
    }
    response.json({ status: 'ok' });
  });

  app.use('/api', (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', express.json({ limit: JSON_BODY_LIMIT }));

  if (database) {
    const { pool, appOrigin, sessionSecret } = database;
    const isSecure = appOrigin.startsWith('https://');
    if (isSecure) app.set('trust proxy', 'loopback');
    const browserSession = createSessionMiddleware(pool, sessionSecret, isSecure);
    app.use(['/api/auth', '/api/projects'], (request, response, next) => {
      if (request.get('Authorization') !== undefined) next();
      else browserSession(request, response, next);
    });
    app.use('/api/auth', createAuthRoutes(pool, appOrigin, isSecure));
    app.use('/api/projects', createDecisionRoutes(pool, appOrigin));
    app.use('/api/projects', createProjectRoutes(pool, appOrigin));
  }
  app.use((_request, response) => {
    sendError(response, 404, 'NOT_FOUND', 'Route not found.');
  });
  app.use(errorHandler);
  return app;
}
