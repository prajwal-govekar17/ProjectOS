import { randomBytes, timingSafeEqual } from 'node:crypto';
import connectPgSimple from 'connect-pg-simple';
import type { Request } from 'express';
import session from 'express-session';
import type { Pool } from 'pg';
import { DATABASE_SCHEMA } from '../db/pool.ts';
import { ApiFailure } from '../errors.ts';

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
    userId?: string;
  }
}

const postgresSessionStore = connectPgSimple(session);
const SESSION_DURATION = 8 * 60 * 60 * 1000;
export const SESSION_COOKIE = 'projectos.sid';

export function sessionCookie(isSecure: boolean) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: isSecure, path: '/' };
}

export function createSessionMiddleware(pool: Pool, secret: string, isSecure: boolean) {
  return session({
    name: SESSION_COOKIE,
    secret,
    store: new postgresSessionStore({
      pool,
      schemaName: DATABASE_SCHEMA,
      tableName: 'sessions',
      disableTouch: true,
      errorLog: () => console.error('PostgreSQL session storage operation failed.'),
    }),
    resave: false,
    saveUninitialized: false,
    cookie: { ...sessionCookie(isSecure), maxAge: SESSION_DURATION },
  });
}

export function getCsrfToken(request: Request) {
  request.session.csrfToken ??= randomBytes(32).toString('base64url');
  return request.session.csrfToken;
}

export async function getSavedCsrfToken(request: Request) {
  if (request.session.csrfToken) return request.session.csrfToken;
  const token = getCsrfToken(request);
  await saveSession(request);
  return token;
}

export function requireCsrf(request: Request, appOrigin: string) {
  const expected = Buffer.from(request.session.csrfToken ?? '');
  const actual = Buffer.from(request.get('X-CSRF-Token') ?? '');
  if (
    request.get('Origin') !== appOrigin ||
    !expected.length ||
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    throw new ApiFailure(403, 'FORBIDDEN', 'A valid same-origin CSRF token is required.');
  }
}

function runSessionOperation(request: Request, method: 'regenerate' | 'save' | 'destroy') {
  return new Promise<void>((resolve, reject) => {
    request.session[method]((error: unknown) => {
      if (error) {
        // Prevent Express from saving or sending a cookie for rejected session state.
        Reflect.deleteProperty(request, 'session');
        reject(new ApiFailure(503, 'SERVICE_UNAVAILABLE', 'Session storage unavailable.'));
      } else {
        resolve();
      }
    });
  });
}

export function regenerateSession(request: Request) {
  return runSessionOperation(request, 'regenerate');
}

export function saveSession(request: Request) {
  return runSessionOperation(request, 'save');
}

export function destroySession(request: Request) {
  return runSessionOperation(request, 'destroy');
}
