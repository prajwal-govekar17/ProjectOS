import { loginInputSchema } from '@projectos/contracts';
import { Router } from 'express';
import type { Pool } from 'pg';
import { ApiFailure } from '../errors.ts';
import { getHumanActor, unauthenticated } from './authorize.ts';
import { verifyPassword } from './password.ts';
import {
  destroySession,
  getCsrfToken,
  getSavedCsrfToken,
  regenerateSession,
  requireCsrf,
  saveSession,
  SESSION_COOKIE,
  sessionCookie,
} from './session.ts';
import { findUserForLogin } from './user.repository.ts';

export function createAuthRoutes(pool: Pool, appOrigin: string, isSecure: boolean) {
  const router = Router();
  router.use((request, _response, next) => {
    if (request.get('Authorization') !== undefined) throw unauthenticated();
    next();
  });

  router.get('/csrf', async (request, response) => {
    response.json({ csrf_token: await getSavedCsrfToken(request) });
  });

  router.post('/login', async (request, response) => {
    requireCsrf(request, appOrigin);
    const input = loginInputSchema.safeParse(request.body);
    if (!input.success) throw new ApiFailure(400, 'INVALID_INPUT', 'Invalid login input.');

    const user = await findUserForLogin(pool, input.data.email);
    const isValid = await verifyPassword(input.data.password, user?.password_hash);
    if (!user || !isValid) throw unauthenticated();

    await regenerateSession(request);
    request.session.userId = user.user_id;
    const csrfToken = getCsrfToken(request);
    await saveSession(request);
    response.json({ user: { user_id: user.user_id, email: user.email }, csrf_token: csrfToken });
  });

  router.get('/session', async (request, response) => {
    const actor = await getHumanActor(pool, request);
    response.json({
      user: { user_id: actor.userId, email: actor.email },
      csrf_token: await getSavedCsrfToken(request),
    });
  });

  router.post('/logout', async (request, response) => {
    await getHumanActor(pool, request);
    requireCsrf(request, appOrigin);
    await destroySession(request);
    response.clearCookie(SESSION_COOKIE, sessionCookie(isSecure)).status(204).end();
  });

  return router;
}
