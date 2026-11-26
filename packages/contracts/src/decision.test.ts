/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decisionListQuerySchema, repositoryPathSchema } from './decision.ts';

test('bounds repository paths to 1024 UTF-8 bytes', () => {
  const path = `${`${'界'.repeat(50)}/`.repeat(6)}${'a'.repeat(118)}`;
  assert.equal(repositoryPathSchema.safeParse(path).success, true);
  assert.equal(repositoryPathSchema.safeParse(`${path}a`).success, false);
});

test('parses fresh REST queries and repeated repository-relative paths', () => {
  assert.deepEqual(decisionListQuerySchema.parse({}), { limit: 10, include_history: false });
  assert.deepEqual(
    decisionListQuerySchema.parse({
      decision_id: 'DEC-001',
      related_files: ['src/a.ts', 'src/nested/my file.ts'],
      include_history: 'true',
      limit: '50',
    }),
    {
      decision_id: 'DEC-001',
      related_files: ['src/a.ts', 'src/nested/my file.ts'],
      include_history: true,
      limit: 50,
    },
  );
  assert.deepEqual(
    decisionListQuerySchema.parse({ related_files: 'src/a.ts', include_history: 'false' }),
    {
      related_files: ['src/a.ts'],
      include_history: false,
      limit: 10,
    },
  );
});

test('rejects invalid limits, boolean values, path forms and unknown filters', () => {
  for (const relatedFile of [
    '/src/a.ts',
    'C:/src/a.ts',
    'C:src/a.ts',
    'src\\a.ts',
    'src/../a.ts',
    './src/a.ts',
    'src//a.ts',
    'src/a.ts/',
    'src/\0a.ts',
  ]) {
    assert.equal(decisionListQuerySchema.safeParse({ related_files: relatedFile }).success, false);
  }
  for (const input of [
    { limit: '0' },
    { limit: '51' },
    { include_history: '1' },
    { include_history: ['true', 'false'] },
    { project_id: 'other' },
  ]) {
    assert.equal(decisionListQuerySchema.safeParse(input).success, false);
  }
});
