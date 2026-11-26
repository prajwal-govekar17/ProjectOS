import { z } from 'zod';
import { decisionIdSchema } from './identifiers.ts';

const pathEncoder = new TextEncoder();

function hasValidDatabaseText(value: string) {
  return !value.includes('\0') && !/\p{Surrogate}/u.test(value);
}

export const decisionStatusSchema = z.enum(['pending', 'approved', 'rejected', 'superseded']);

export const repositoryPathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (path) =>
      hasValidDatabaseText(path) &&
      pathEncoder.encode(path).byteLength <= 1024 &&
      !/^[a-z]:/i.test(path) &&
      !path.includes('\\') &&
      [...path].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127) &&
      path.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
  );

export const decisionListQuerySchema = z.strictObject({
  decision_id: decisionIdSchema.optional(),
  query: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .refine((value) => !value.includes('\0'))
    .optional(),
  related_files: z
    .union([repositoryPathSchema, z.array(repositoryPathSchema).min(1).max(50)])
    .transform((files) => (typeof files === 'string' ? [files] : files))
    .optional(),
  status: decisionStatusSchema.optional(),
  include_history: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .prefault('false'),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(50))
    .prefault('10'),
});

export const decisionHistoryEntrySchema = z.object({
  version: z.number().int().positive(),
  status: decisionStatusSchema,
  occurred_at: z.iso.datetime(),
  reviewer_id: z.uuid().nullable(),
  feedback: z.string().nullable(),
  provenance: z.enum(['fixture', 'human', 'agent']),
});

export const decisionSchema = z.object({
  decision_id: decisionIdSchema,
  version: z.number().int().positive(),
  title: z.string(),
  decision: z.string(),
  rationale: z.string(),
  status: decisionStatusSchema,
  related_paths: z.array(repositoryPathSchema),
  related_decision_ids: z.array(decisionIdSchema),
  supersedes_decision_id: decisionIdSchema.nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  provenance: z.enum(['fixture', 'human', 'agent']),
  history: z.array(decisionHistoryEntrySchema).max(20).optional(),
  history_truncated: z.boolean().optional(),
});

export const decisionListResponseSchema = z.object({
  decisions: z.array(decisionSchema).max(50),
  truncated: z.boolean(),
});

const decisionTextSchema = z
  .string()
  .min(1)
  .max(10000)
  .refine((value) => value.trim().length > 0 && hasValidDatabaseText(value));

export const createDecisionProposalInputSchema = z.strictObject({
  title: decisionTextSchema.max(160),
  decision: decisionTextSchema,
  rationale: decisionTextSchema,
  related_paths: z
    .array(repositoryPathSchema)
    .max(50)
    .transform((paths) => [...new Set(paths)].sort()),
  related_decision_ids: z
    .array(decisionIdSchema)
    .max(50)
    .transform((ids) => [...new Set(ids)].sort())
    .prefault([]),
  supersedes_decision_id: decisionIdSchema.optional(),
});

export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);

export const decisionCreationSchema = z.object({
  decision_id: decisionIdSchema,
  version: z.number().int().positive(),
  status: z.literal('pending'),
  review_url: z.string(),
});

export const decisionReviewInputSchema = z.strictObject({
  version: z.number().int().min(1).max(2147483647),
  outcome: z.enum(['approve', 'reject']),
  feedback: z.string().max(2000).refine(hasValidDatabaseText).optional(),
});

export const decisionStatusResponseSchema = z.object({
  decision_id: decisionIdSchema,
  version: z.number().int().positive(),
  status: decisionStatusSchema,
  reviewed_at: z.iso.datetime().optional(),
  reviewer: z.object({ user_id: z.uuid() }).optional(),
  feedback: z.string().optional(),
  review_url: z.string().optional(),
});

export type Decision = z.infer<typeof decisionSchema>;
export type DecisionHistoryEntry = z.infer<typeof decisionHistoryEntrySchema>;
export type DecisionListQuery = z.infer<typeof decisionListQuerySchema>;
export type DecisionListResponse = z.infer<typeof decisionListResponseSchema>;
export type CreateDecisionProposalInput = z.infer<typeof createDecisionProposalInputSchema>;
export type DecisionCreation = z.infer<typeof decisionCreationSchema>;
export type DecisionReviewInput = z.infer<typeof decisionReviewInputSchema>;
export type DecisionStatusResponse = z.infer<typeof decisionStatusResponseSchema>;
