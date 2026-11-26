import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMigrationTarget, verifyMigrationTarget } from './target.ts';

const testEnv = {
  TEST_DATABASE_URL: 'postgresql://projectos_test_owner:fixture@127.0.0.1/projectos_test_local',
  TEST_DATABASE_NAME: 'projectos_test_local',
  TEST_DATABASE_ROLE: 'projectos_test_owner',
  TEST_DATABASE_SCHEMA: 'projectos',
};

test('requires an explicit, dedicated test database, role and schema before connecting', () => {
  assert.equal(parseMigrationTarget('test', testEnv).database, 'projectos_test_local');
  for (const overrides of [
    { TEST_DATABASE_SCHEMA: undefined },
    { TEST_DATABASE_SCHEMA: 'public' },
    { TEST_DATABASE_NAME: 'postgres' },
    { TEST_DATABASE_ROLE: 'postgres' },
    { TEST_DATABASE_URL: 'postgresql://postgres:fixture@db.example.test/postgres' },
    { TEST_DATABASE_URL: 'postgresql://projectos_test_owner:fixture@127.0.0.1/projectos_dev' },
    {
      TEST_DATABASE_URL:
        'postgresql://projectos_test_owner:fixture@prod.example.test/projectos_prod',
    },
  ]) {
    assert.throws(
      () => parseMigrationTarget('test', { ...testEnv, ...overrides }),
      /test database/i,
    );
  }
});

test('production requires its own explicit operator settings', () => {
  const development = {
    MIGRATION_DATABASE_URL: 'postgresql://development_owner:fixture@dev.example.test/postgres',
    MIGRATION_DATABASE_NAME: 'postgres',
    MIGRATION_DATABASE_ROLE: 'development_owner',
  };
  assert.equal(parseMigrationTarget('development', development).role, 'development_owner');
  assert.throws(() => parseMigrationTarget('production', development), /production database/i);
});

test('rejects a mismatched connected database, role or schema without making a write', async () => {
  const target = parseMigrationTarget('test', testEnv);
  const identity = {
    database_name: 'projectos_test_local',
    role_name: 'projectos_test_owner',
    login_role: 'projectos_test_owner',
    owns_schema: true,
    restricted_role: true,
    can_write_outside_schema: false,
  };
  for (const overrides of [
    { database_name: 'postgres' },
    { role_name: 'production_owner' },
    { login_role: 'production_owner' },
    { owns_schema: false },
    { restricted_role: false },
    { can_write_outside_schema: true },
  ]) {
    await assert.rejects(
      verifyMigrationTarget(target, async (sql) => {
        assert.match(sql, /^\s*SELECT\b/);
        return { rows: [{ ...identity, ...overrides }] };
      }),
      /unsafe database identity/i,
    );
  }
});
