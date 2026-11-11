import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
new Function('exports', compile(readFileSync('services/api/src/workspace-env-metadata.ts', 'utf8')))(exports);
const api = readFileSync(process.env.WORKSPACE_ENV_BASELINE === '1' ? '../baseline/services/api/src/app.ts' : 'services/api/src/app.ts', 'utf8');
const start = api.indexOf('function collapseEnvForWorkspace(');
const end = api.indexOf('\nconst databaseConnectionQuerySchema', start);
assert.ok(start >= 0 && end > start);
const collapse = new Function('isIdeMetadataEnvKey', compile(api.slice(start, end)) + '\nreturn collapseEnvForWorkspace;')(exports.isIdeMetadataEnvKey);
const metadata = [
  'VIBECORE_IDE_SETTINGS_STATE', 'VIBECORE_INTEGRATIONS_STATE', 'VIBECORE_TERMINAL_STATE',
  'VIBECORE_PACKAGES_STATE', 'VIBECORE_DEBUGGER_STATE', 'VIBECORE_EXTENSIONS_STATE',
  'VIBECORE_PORTS_STATE', 'VIBECORE_WORKFLOWS_STATE', 'VIBECORE_SECURITY_STATE',
];

test('actual API projection excludes exact platform metadata keys in every scope', () => {
  for (const scope of [undefined, 'production', 'preview', 'development']) {
    assert.deepEqual(collapse(metadata.map(key => ({ key, value: 'private panel JSON', scope }))), {});
  }
});

test('changing panel state does not change desired workspace environment', () => {
  const real = [{ key: 'VITE_API_URL', value: 'https://app.example.test' }, { key: 'DATABASE_URL', value: 'fixture-db' }];
  const before = [...real, ...metadata.map(key => ({ key, value: '{"version":1}' }))];
  const after = [...real, ...metadata.map(key => ({ key, value: '{"version":2}' }))];
  assert.deepEqual(collapse(before), collapse(real));
  assert.deepEqual(collapse(after), collapse(real));
  assert.notDeepEqual(Object.fromEntries(before.map(x => [x.key, x.value])), Object.fromEntries(after.map(x => [x.key, x.value])));
});

test('preserves genuine application variables, including arbitrary VIBECORE prefix and state-like names', () => {
  const records = ['VIBECORE_CUSTOM_STATE', 'VIBECORE_APPLICATION_MODE', 'VIBECORE_PACKAGES_STATE_EXTRA', 'DATABASE_URL', 'API_TOKEN', 'PORT'].map(key => ({ key, value: key + '-fixture' }));
  assert.deepEqual(collapse(records), Object.fromEntries(records.map(x => [x.key, x.value])));
});

test('preserves development over production over preview scope precedence', () => {
  const records = [
    { key: 'APP_MODE', value: 'preview', scope: 'preview' },
    { key: 'APP_MODE', value: 'production', scope: 'production' },
    { key: 'APP_MODE', value: 'development', scope: 'development' },
  ];
  assert.deepEqual(collapse(records), { APP_MODE: 'development' });
  assert.deepEqual(collapse([...records].reverse()), { APP_MODE: 'development' });
  assert.deepEqual(collapse(records.slice(0, 2)), { APP_MODE: 'production' });
  assert.deepEqual(collapse([{ key: 'LEGACY', value: 'default' }]), { LEGACY: 'default' });
});

test('real application env changes still change desired environment', () => {
  assert.notDeepEqual(collapse([{ key: 'DATABASE_URL', value: 'before' }]), collapse([{ key: 'DATABASE_URL', value: 'after' }]));
});

test('projection does not mutate or erase stored metadata records', () => {
  const records = Object.freeze(metadata.map(key => Object.freeze({ key, value: 'saved panel state' })));
  const snapshot = JSON.stringify(records);
  collapse(records);
  assert.equal(JSON.stringify(records), snapshot);
});

test('all existing runtime environment call sites continue using the single projection', () => {
  assert.equal((api.match(/collapseEnvForWorkspace\(projectEnvVars\)/g) ?? []).length, 5);
  assert.match(api, /import \{ isIdeMetadataEnvKey \} from '\.\/workspace-env-metadata\.js'/);
});
