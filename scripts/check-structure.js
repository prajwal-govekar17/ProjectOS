import { globSync, readFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(import.meta.dirname, '..');
const IGNORED = new Set(['node_modules', 'dist', 'coverage']);
const KEBAB = '[a-z0-9]+(?:-[a-z0-9]+)*';
const DIRECTORY_NAME = new RegExp(`^${KEBAB}$`);
const SOURCE_NAME = new RegExp(`^${KEBAB}(?:\\.${KEBAB})*\\.[cm]?[jt]sx?$`);
const WIRE_FIELD = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const DB_PACKAGES = new Set(['pg', 'postgres', '@supabase/supabase-js', 'node:sqlite']);
const TABLE_CONSTRAINTS = new Set([
  'CHECK',
  'CONSTRAINT',
  'EXCLUDE',
  'FOREIGN',
  'LIKE',
  'PRIMARY',
  'UNIQUE',
]);
const resolverOptions = { moduleResolution: ts.ModuleResolutionKind.NodeNext };
const errors = [];

function readJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
}

function findFiles(patterns) {
  return globSync(patterns, {
    cwd: ROOT,
    exclude: (path) => IGNORED.has(basename(path)),
  }).map((path) => path.replaceAll('\\', '/'));
}

const rootManifest = readJson('package.json');
const workspaces = findFiles(rootManifest.workspaces.map((path) => `${path}/package.json`)).map(
  (path) => ({ ...readJson(path), path: dirname(path) }),
);
const workspaceNames = new Map(workspaces.map((workspace) => [workspace.name, workspace]));
const sources = findFiles([
  '{apps,packages,scripts,tests}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
]).filter((path) => !path.startsWith('tests/fixtures/'));
const graph = new Map(sources.map((path) => [path, []]));

function report(path, message) {
  errors.push(`${path}: ${message}`);
}

function checkPath(path) {
  const directories = dirname(path).split('/');
  if (directories.some((directory) => !DIRECTORY_NAME.test(directory))) {
    report(path, 'Directory names must use lowercase kebab-case.');
  }

  const name = basename(path);
  const isReactFile =
    path.startsWith('apps/web/') &&
    (/^(?:[A-Z][a-zA-Z0-9]*|main)(?:\.test)?\.tsx$/.test(name) ||
      /^use[A-Z][a-zA-Z0-9]*(?:\.test)?\.ts$/.test(name));
  const isMigration = /^\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.sql$/.test(name);
  if (!SOURCE_NAME.test(name) && !isReactFile && !isMigration) {
    report(path, 'Use the ORG-02 source or migration filename convention.');
  }
  if (/\.spec\.[cm]?[jt]sx?$/.test(name)) report(path, 'Test files must use the .test suffix.');
}

function workspaceAt(path) {
  return workspaces.find((workspace) => path.startsWith(`${workspace.path}/`));
}

function exportedSources(workspace, entry) {
  if (typeof entry === 'string') {
    const sourcePath = entry.replace(/^\.\/dist\//, 'src/').replace(/\.d(?=\.[cm]?ts$)/, '');
    const source = resolve(ROOT, workspace.path, sourcePath);
    const path = relative(ROOT, source).replaceAll('\\', '/');
    return [path, path.replace(/\.([cm]?)js$/, '.$1ts'), path.replace(/\.js$/, '.tsx')];
  }
  if (!entry || typeof entry !== 'object') return [];
  return Object.values(entry).flatMap((target) => exportedSources(workspace, target));
}

function resolveImports(path, specifier, importer) {
  const packageName = specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/');
  if (/^apps\/(mcp|web)\//.test(path) && DB_PACKAGES.has(packageName)) {
    report(path, `Use the REST API for database access (${specifier}).`);
  }
  if (isBuiltin(specifier)) {
    if (importer.name === '@projectos/contracts' && !path.endsWith('.test.ts')) {
      report(path, `Shared contracts must be browser-compatible (${specifier}).`);
    }
    return [];
  }

  if (specifier.startsWith('.') || isAbsolute(specifier)) {
    const absolutePath = resolve(ROOT, path);
    const resolved = ts.resolveModuleName(specifier, absolutePath, resolverOptions, ts.sys);
    const target =
      resolved.resolvedModule?.resolvedFileName ?? resolve(dirname(absolutePath), specifier);
    const targetPath = relative(ROOT, target).replaceAll('\\', '/');
    const owner = workspaceAt(targetPath);
    if (owner && owner !== importer) {
      report(
        path,
        `Cross-workspace import ${specifier} must use a declared public package export.`,
      );
    }
    return [targetPath];
  }

  const owner = workspaceNames.get(packageName);
  const isTest = /\.test\.[cm]?[jt]sx?$/.test(path) || path.startsWith('tests/');
  const isDeclared =
    importer.dependencies?.[packageName] ||
    importer.peerDependencies?.[packageName] ||
    importer.optionalDependencies?.[packageName] ||
    ((isTest || !importer.path) && importer.devDependencies?.[packageName]);
  if (!owner) {
    if (!isDeclared) report(path, `Declare dependency ${packageName} in ${importer.name}.`);
    return [];
  }

  const exportName = specifier === packageName ? '.' : `.${specifier.slice(packageName.length)}`;
  const entry = owner.exports?.[exportName];
  if (owner.path.startsWith('apps/') || !entry || (owner !== importer && !isDeclared)) {
    report(path, `Import ${specifier} must target a declared public shared package export.`);
    return [];
  }
  if (
    importer?.path === 'apps/api' &&
    ['repo-analysis', 'git-adapter'].some((name) => owner.path === `packages/${name}`)
  ) {
    report(path, `Local repository operations belong to MCP (${specifier}).`);
  }

  return exportedSources(owner, entry);
}

function checkSchemas(path, content, isWireContract) {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  const zodNames = new Set();
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'zod'
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) zodNames.add(bindings.name.text);
    if (ts.isNamedImports(bindings)) {
      for (const binding of bindings.elements) {
        if ((binding.propertyName ?? binding.name).text === 'z') zodNames.add(binding.name.text);
      }
    }
  }

  function isSchemaExpression(expression) {
    if (ts.isCallExpression(expression)) {
      let callee = expression.expression;
      while (ts.isPropertyAccessExpression(callee)) {
        if (
          /^(?:(?:safe)?(?:parse|decode|encode)(?:Async)?|isOptional|isNullable)$/i.test(
            callee.name.text,
          )
        )
          return false;
        callee = callee.expression;
      }
      return (ts.isIdentifier(callee) && zodNames.has(callee.text)) || isSchemaExpression(callee);
    }
    return ts.isIdentifier(expression) && expression.text.endsWith('Schema');
  }

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      isSchemaExpression(node.initializer) &&
      !/^[a-z][A-Za-z0-9]*Schema$/.test(node.name.getText(source))
    ) {
      report(
        path,
        `Zod schema ${node.name.getText(source)} must use camelCase and end with Schema.`,
      );
    }
    if (
      isWireContract &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const method = node.expression.name.text;
      const [shape] = node.arguments;
      if (
        ['object', 'strictObject', 'looseObject', 'extend', 'safeExtend'].includes(method) &&
        shape &&
        ts.isObjectLiteralExpression(shape)
      ) {
        for (const { name } of shape.properties) {
          if (
            name &&
            (ts.isIdentifier(name) || ts.isStringLiteral(name)) &&
            !WIRE_FIELD.test(name.text)
          ) {
            report(path, `Wire field ${name.text} must use snake_case.`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

function checkMigrationNames(path) {
  const sql = readFileSync(resolve(ROOT, path), 'utf8');
  const tokens =
    sql.match(
      /--[^\r\n]*|\/\*[\s\S]*?\*\/|(\$\w*\$)[\s\S]*?\1|'(?:''|[^'])*'|"(?:""|[^"])*"|[\w$]+|[.(),;[\]]/g,
    ) ?? [];
  const keywordsAndNames = tokens.filter((token) => !/^(?:--|\/\*|\$|')/.test(token));
  const keywords = keywordsAndNames.map((token) => token.toUpperCase());

  function checkIdentifier(token) {
    if (!token) return;
    const name = token.replace(/^"|"$/g, '');
    if (!WIRE_FIELD.test(name)) report(path, `PostgreSQL identifier ${token} must use snake_case.`);
  }

  function checkTableName(index) {
    checkIdentifier(keywordsAndNames[index]);
    if (keywords[index + 1] !== '.') return index + 1;
    checkIdentifier(keywordsAndNames[index + 2]);
    return index + 3;
  }

  function checkAlterTable(index) {
    if (keywords.slice(index, index + 2).join(' ') === 'IF EXISTS') index += 2;
    if (keywords[index] === 'ONLY') index++;
    const firstAction = checkTableName(index);
    let depth = 0;
    for (let action = firstAction; action < keywords.length && keywords[action] !== ';'; action++) {
      const token = keywords[action];
      if (token === '(' || token === '[') depth++;
      if (token === ')' || token === ']') depth--;
      if (depth > 0 || (action !== firstAction && keywords[action - 1] !== ',')) continue;
      if (!['ADD', 'DROP', 'ALTER', 'RENAME'].includes(token)) continue;

      let column = action + 1;
      if (keywords[column] === 'COLUMN') column++;
      if (keywords.slice(column, column + 3).join(' ') === 'IF NOT EXISTS') column += 3;
      if (keywords.slice(column, column + 2).join(' ') === 'IF EXISTS') column += 2;
      if (TABLE_CONSTRAINTS.has(keywords[column])) continue;
      if (token === 'RENAME' && keywords[column] === 'TO') column++;
      checkIdentifier(keywordsAndNames[column]);
      if (token === 'RENAME' && keywords[column + 1] === 'TO') {
        checkIdentifier(keywordsAndNames[column + 2]);
      }
    }
  }

  for (let index = 0; index < keywordsAndNames.length; index++) {
    if (keywords[index] === 'ALTER' && keywords[index + 1] === 'TABLE') {
      checkAlterTable(index + 2);
      continue;
    }
    if (keywords[index] !== 'CREATE') continue;
    const declaration = keywords.slice(index + 1, index + 7);
    const tableIndex = ['TEMP', 'TEMPORARY', 'UNLOGGED'].includes(declaration[0]) ? 1 : 0;
    if (declaration[tableIndex] !== 'TABLE') continue;

    const hasIfNotExists =
      declaration.slice(tableIndex + 1, tableIndex + 4).join(' ') === 'IF NOT EXISTS';
    const columnStart = checkTableName(index + tableIndex + (hasIfNotExists ? 5 : 2));
    if (keywords[columnStart] !== '(') continue;

    let depth = 0;
    for (let columnIndex = columnStart; columnIndex < keywordsAndNames.length; columnIndex++) {
      const token = keywordsAndNames[columnIndex];
      if (token === '(' || token === '[') depth++;
      if (token === ')' || token === ']') depth--;
      if (depth === 0) break;
      if (depth !== 1 || (token !== '(' && token !== ',')) continue;

      const column = keywordsAndNames[columnIndex + 1];
      if (column && column !== ')' && !TABLE_CONSTRAINTS.has(column.toUpperCase())) {
        checkIdentifier(column);
      }
    }
  }
}

for (const workspace of workspaces) {
  if (
    workspace.name !== `@projectos/${basename(workspace.path)}` ||
    !DIRECTORY_NAME.test(basename(workspace.path))
  ) {
    report(
      `${workspace.path}/package.json`,
      'Workspace names must match @projectos/<kebab-case directory>.',
    );
  }
}

for (const path of sources) {
  checkPath(path);
  const content = readFileSync(resolve(ROOT, path), 'utf8');
  const importer = workspaceAt(path) ?? rootManifest;
  const isWireContract = /^(packages\/contracts\/src|apps\/mcp\/src\/tools)\//.test(path);
  if (path.endsWith('.ts') && !path.endsWith('.test.ts'))
    checkSchemas(path, content, isWireContract);
  const { importedFiles } = ts.preProcessFile(content, true, true);
  for (const { fileName } of importedFiles) {
    const targets = resolveImports(path, fileName, importer);
    graph.get(path).push(...new Set(targets.filter((target) => graph.has(target))));
  }
}

for (const path of findFiles(['apps/api/migrations/**/*.sql'])) {
  checkPath(path);
  checkMigrationNames(path);
}

const checked = new Set();
const active = new Set();
function checkCycles(path) {
  if (active.has(path)) {
    const cycle = [...active].slice([...active].indexOf(path));
    report(path, `Circular dependency: ${[...cycle, path].join(' -> ')}.`);
    return;
  }
  if (checked.has(path)) return;
  active.add(path);
  for (const target of graph.get(path)) checkCycles(target);
  active.delete(path);
  checked.add(path);
}
for (const path of sources) checkCycles(path);

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
