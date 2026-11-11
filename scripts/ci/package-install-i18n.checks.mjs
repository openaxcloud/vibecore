import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { loadPackageTestModule } from './package-test-loader.mjs';

const apiCopy = loadPackageTestModule('services/api/src/transactional-i18n.ts');
const agentCopy = loadPackageTestModule('services/workspace-agent/src/public-i18n.ts');
const { dedicatedPackageInstall } = loadPackageTestModule('services/api/src/dedicated-package-install.ts');
const { packageInstallPlan } = loadPackageTestModule('services/workspace-agent/src/package-install-contract.ts');
const { publicErrorCode } = loadPackageTestModule('services/api/src/public-error-code.ts');
const body = { packageManager: 'npm', packages: ['is-odd'], timeoutMs: 300000 };
const capability = { version: 1, maxBudgetMs: 300000, validatedSpecs: 1 };
const api = readFileSync('services/api/src/app.ts', 'utf8');
const agent = readFileSync('services/workspace-agent/src/app.ts', 'utf8');

const compile = (source) =>
  ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
    .outputText;

// Execute the actual generic API error response branch, including its 5xx public-message handling.
const errorHandler = api.indexOf('  app.setErrorHandler(');

const start = api.indexOf(
  '    const locale = transactionalLocaleForRequest(request);',
  api.indexOf("if (request.url.startsWith('/billing/stripe/webhook'))", errorHandler),
);

const end = api.indexOf('\n  });', start);
assert.ok(errorHandler >= 0 && start > errorHandler && end > start);

const localeStart = api.indexOf('function transactionalLocaleForRequest(');
const localeEnd = api.indexOf('\nfunction localizeBackendOwnedText(', localeStart);
assert.ok(localeStart >= 0 && localeEnd > localeStart);

const requestLocale = new Function(
  'resolveTransactionalLocale',
  compile(api.slice(localeStart, localeEnd)) + '\nreturn transactionalLocaleForRequest;',
)(apiCopy.resolveTransactionalLocale);

function apiResponse(error, headers) {
  const reply = {
    code(status) {
      this.status = status;
      return this;
    },
    send(payload) {
      return { status: this.status, ...payload };
    },
  };
  return new Function(
    'error',
    'request',
    'reply',
    'statusCode',
    'code',
    'transactionalLocaleForRequest',
    'appPublicEnglish',
    'localizeAppPublicMessage',
    'publicErrorMessage',
    'publicErrorCode',
    compile(api.slice(start, end)),
  )(
    error,
    { headers },
    reply,
    error.statusCode,
    error.code,
    requestLocale,
    () => 'Internal server error',
    () => ({ matched: false }),
    apiCopy.publicErrorMessage,
    publicErrorCode,
  );
}

for (const locale of ['en', 'fr']) {
  for (const scenario of ['budget', 'missing', 'mismatch', 'deadline']) {
    test(`API ${scenario} keeps localized ${locale} message, status and code through response branch`, async () => {
      let now = 0;

      const install =
        scenario === 'deadline'
          ? loadPackageTestModule('services/api/src/dedicated-package-install.ts', { performance: { now: () => now } })
              .dedicatedPackageInstall
          : dedicatedPackageInstall;

      let writes = 0;
      let error;

      try {
        await install(
          async (_path, init) => {
            if (init.method === 'POST') {
              writes++;
            }

            if (scenario === 'missing') {
              throw Object.assign(new Error('fixture'), { statusCode: 404 });
            }

            if (scenario === 'deadline') {
              now = 330001;
            }

            return scenario === 'mismatch' ? {} : capability;
          },
          { ...body, timeoutMs: scenario === 'budget' ? 300001 : 300000 },
        );
      } catch (caught) {
        error = caught;
      }
      assert.ok(error);

      const code =
        scenario === 'budget'
          ? 'INVALID_PACKAGE_INSTALL_BUDGET'
          : scenario === 'deadline'
            ? 'PACKAGE_INSTALL_DEADLINE'
            : 'PACKAGE_INSTALL_CAPABILITY_REQUIRED';

      const status = scenario === 'budget' ? 400 : scenario === 'deadline' ? 504 : 409;
      const response = apiResponse(error, { 'accept-language': locale });
      assert.equal(response.status, status);
      assert.equal(response.code, code);
      assert.equal(response.error, apiCopy.TRANSACTIONAL_CATALOGUE[locale][`errors.${code}`]);
      assert.notEqual(response.error, code);
      assert.equal(writes, 0);
      assert.equal(apiCopy.localizedPublicErrorPayload(response, locale).error, response.error);
    });
  }
  test(`agent invalid install passes real ${locale} error handler`, () => {
    const start = agent.indexOf('  app.setErrorHandler(');
    const end = agent.indexOf('\n  });', start) + 6;

    let handler;

    const deps = {
      app: {
        setErrorHandler(fn) {
          handler = fn;
        },
      },
      ...agentCopy,
      z: { ZodError: class extends Error {} },
    };
    new Function(...Object.keys(deps), compile(agent.slice(start, end)))(...Object.values(deps));

    let error;

    try {
      packageInstallPlan({ ...body, command: 'sh' });
    } catch (caught) {
      error = caught;
    }

    const reply = {
      code(status) {
        this.status = status;
        return this;
      },
      send(payload) {
        return { status: this.status, ...payload };
      },
    };

    const result = handler(error, { headers: { 'accept-language': locale } }, reply);
    assert.equal(result.status, 400);
    assert.equal(result.code, 'INVALID_PACKAGE_INSTALL_REQUEST');
    assert.equal(result.message, agentCopy.workspaceAgentMessage('invalidPackageInstallRequest', locale));
    assert.equal(result.error, result.message);
  });
}

test('API install errors use the actual request locale resolver for headers and persisted cookies', () => {
  const code = 'INVALID_PACKAGE_INSTALL_BUDGET';

  const error = Object.assign(new Error(apiCopy.TRANSACTIONAL_CATALOGUE.en[`errors.${code}`]), {
    statusCode: 400,
    code,
  });

  for (const [headers, expected] of [
    [{ 'accept-language': 'fr-CA, en;q=0.8' }, 'fr'],
    [{ 'accept-language': 'en-US, fr;q=0.8' }, 'en'],
    [{ 'accept-language': 'en', cookie: 'vibecore-lang=fr' }, 'fr'],
    [{ 'accept-language': 'en', cookie: 'vibecore-auto-lang=fr' }, 'fr'],
    [{ 'accept-language': 'fr', cookie: 'vibecore-lang=en; vibecore-auto-lang=fr' }, 'en'],
    [{ 'accept-language': 'de-DE' }, 'en'],
    [{}, 'en'],
  ]) {
    const response = apiResponse(error, headers);
    assert.equal(response.status, 400);
    assert.equal(response.code, code);
    assert.equal(response.error, apiCopy.TRANSACTIONAL_CATALOGUE[expected][`errors.${code}`]);
  }
});
