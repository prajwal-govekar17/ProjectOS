import { z } from 'zod';

export const projectIdSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const decisionIdSchema = z.string().regex(/^DEC-(?:00[1-9]|0[1-9]\d|[1-9]\d{2,})$/);
export const reportIdSchema = z.string().regex(/^IMP-(?:00[1-9]|0[1-9]\d|[1-9]\d{2,})$/);
