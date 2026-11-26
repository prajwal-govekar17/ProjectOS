import { z } from 'zod';
import { databaseUrl } from '../db/pool.ts';

const envSchema = z.object({
  PORT: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535))
    .prefault('3000'),
  APP_ORIGIN: z
    .string()
    .transform((value, context) => {
      const url = URL.parse(value);
      if (
        !url ||
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.href !== `${url.origin}/`
      ) {
        context.addIssue({ code: 'custom', message: 'Expected an HTTP or HTTPS origin.' });
        return z.NEVER;
      }
      return url.origin;
    })
    .prefault('http://localhost:5173'),
  DATABASE_URL: z.string().optional(),
  DATABASE_CA_FILE: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
});

export interface Env {
  port: number;
  appOrigin: string;
  database?: { url: URL; caFile?: string; sessionSecret: string };
}

export function parseEnv(input: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(input);
  if (!result.success) {
    const keys = new Set(result.error.issues.map((issue) => issue.path.join('.')));
    throw new Error(`Invalid configuration variables: ${[...keys].join(', ')}.`);
  }

  const data = result.data;
  const config: Env = { port: data.PORT, appOrigin: data.APP_ORIGIN };
  if (
    data.DATABASE_URL !== undefined ||
    data.SESSION_SECRET !== undefined ||
    data.DATABASE_CA_FILE !== undefined
  ) {
    if (!data.SESSION_SECRET) throw new Error('Invalid configuration variables: SESSION_SECRET.');
    let url: URL;
    try {
      url = databaseUrl(data.DATABASE_URL);
    } catch {
      throw new Error('Invalid configuration variables: DATABASE_URL.');
    }
    config.database = { url, caFile: data.DATABASE_CA_FILE, sessionSecret: data.SESSION_SECRET };
  }

  return config;
}
