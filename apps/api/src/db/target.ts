import { DATABASE_SCHEMA, databaseUrl, DatabaseSetupError } from './pool.ts';

export type TargetName = 'development' | 'production' | 'test';

export interface MigrationTarget {
  name: TargetName;
  url: URL;
  database: string;
  role: string;
  caFile?: string;
}

const TEST_IDENTIFIER = /^projectos_test(?:_[a-z0-9]+)*$/;
const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;

export function parseMigrationTarget(
  name: TargetName,
  env: Record<string, string | undefined>,
): MigrationTarget {
  const prefix = {
    development: 'MIGRATION_DATABASE',
    production: 'PRODUCTION_MIGRATION_DATABASE',
    test: 'TEST_DATABASE',
  }[name];
  const database = env[`${prefix}_NAME`];
  const role = env[`${prefix}_ROLE`];
  const badTarget = new DatabaseSetupError(`Invalid ${name} database target configuration.`);
  if (!database || !role || !IDENTIFIER.test(database) || !IDENTIFIER.test(role)) throw badTarget;

  if (name === 'test') {
    if (
      !TEST_IDENTIFIER.test(database) ||
      !TEST_IDENTIFIER.test(role) ||
      env.TEST_DATABASE_SCHEMA !== DATABASE_SCHEMA
    ) {
      throw badTarget;
    }
  } else if (TEST_IDENTIFIER.test(database) || TEST_IDENTIFIER.test(role)) {
    throw badTarget;
  }

  let url: URL;
  try {
    url = databaseUrl(env[`${prefix}_URL`]);
  } catch {
    throw badTarget;
  }
  const urlRole = decodeURIComponent(url.username);
  const isPoolerRole =
    url.hostname.endsWith('.pooler.supabase.com') &&
    /^\w+\.[a-z0-9]+$/.test(urlRole) &&
    urlRole.split('.')[0] === role;
  if (
    decodeURIComponent(url.pathname.slice(1)) !== database ||
    (urlRole !== role && !isPoolerRole)
  ) {
    throw badTarget;
  }

  const caFile =
    env[name === 'development' ? 'DATABASE_CA_FILE' : `${name.toUpperCase()}_DATABASE_CA_FILE`];
  return { name, url, database, role, caFile };
}

interface DatabaseIdentity {
  database_name: string;
  role_name: string;
  login_role: string;
  owns_schema: boolean;
  restricted_role: boolean;
  can_write_outside_schema: boolean;
}

export async function verifyMigrationTarget(
  target: MigrationTarget,
  query: (sql: string, values: string[]) => Promise<{ rows: DatabaseIdentity[] }>,
) {
  const {
    rows: [identity],
  } = await query(
    `
    SELECT current_database() AS database_name, current_user AS role_name, session_user AS login_role,
      EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1 AND nspowner = role.oid) AS owns_schema,
      NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR EXISTS (
        SELECT 1 FROM pg_auth_members WHERE member = role.oid
      )) AS restricted_role,
      has_database_privilege(current_user, current_database(), 'CREATE') OR EXISTS (
        SELECT 1 FROM pg_namespace WHERE nspname <> $1 AND has_schema_privilege(oid, 'CREATE')
      ) OR EXISTS (
        SELECT 1 FROM pg_class AS c JOIN pg_namespace AS n ON c.relnamespace = n.oid
        WHERE n.nspname NOT IN ($1, 'pg_catalog', 'information_schema')
          AND c.relkind IN ('r', 'p', 'v', 'f') AND (
          has_table_privilege(c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER')
          OR has_any_column_privilege(c.oid, 'INSERT, UPDATE')
        )
      ) AS can_write_outside_schema
    FROM pg_roles AS role WHERE rolname = current_user`,
    [DATABASE_SCHEMA],
  );
  if (
    !identity ||
    identity.database_name !== target.database ||
    identity.role_name !== target.role ||
    identity.login_role !== target.role ||
    !identity.owns_schema ||
    !identity.restricted_role ||
    (target.name === 'test' && identity.can_write_outside_schema)
  ) {
    throw new DatabaseSetupError(`Refused unsafe database identity for ${target.name}.`);
  }
}
