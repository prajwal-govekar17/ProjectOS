import { z } from 'zod';
import { projectIdSchema } from './identifiers.ts';

export const repositoryIdentitySchema = z
  .string()
  .max(512)
  .regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?(?:\/[A-Za-z0-9_.-]+)+$/)
  .refine((identity) => !/(?:^|\/)\.{1,2}(?:\/|$)/.test(identity));

export const createProjectInputSchema = z.strictObject({
  project_id: projectIdSchema,
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((name) => !name.includes('\0')),
  repository_identity: repositoryIdentitySchema,
});

export const projectSchema = z.object({
  ...createProjectInputSchema.shape,
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  last_repository_verified_at: z.iso.datetime().nullable().optional(),
});

export const projectListResponseSchema = z.object({
  projects: z.array(projectSchema),
  next_cursor: z.string().min(1).nullable(),
});

export const projectListQuerySchema = z.strictObject({
  cursor: projectIdSchema.optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(50))
    .prefault('20'),
});

export const repositoryVerificationInputSchema = z.strictObject({
  repository_identity: repositoryIdentitySchema,
});

export const repositoryVerificationResponseSchema = z.object({
  last_repository_verified_at: z.iso.datetime(),
});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;
export type RepositoryVerificationInput = z.infer<typeof repositoryVerificationInputSchema>;
