import { z } from 'zod';

export const loginInputSchema = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(1).max(1024),
});

export const csrfResponseSchema = z.object({
  csrf_token: z.string().min(1),
});

export const sessionResponseSchema = csrfResponseSchema.extend({
  user: z.object({
    user_id: z.uuid(),
    email: z.email(),
  }),
});

export type LoginInput = z.infer<typeof loginInputSchema>;
export type CsrfResponse = z.infer<typeof csrfResponseSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
