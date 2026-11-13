import assert from 'node:assert/strict';

export const browserValidationRef = 'refs/heads/validation/private-runtime-browser-20261113';
export function assertBrowserRecipeEnvironment(env: NodeJS.ProcessEnv) {
  assert.equal(env.PRIVATE_RUNTIME_BROWSER_RECIPE, '1');
  assert.ok(
    env.GITHUB_EVENT_NAME === 'workflow_dispatch' ||
      (env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === browserValidationRef),
    'Unexpected browser recipe event/ref',
  );

  for (const [key, value] of Object.entries(env)) {
    assert.ok(
      !value ||
        !/(?:API_KEY|ACCESS_KEY(?:_ID)?|SECRET_ACCESS_KEY|SESSION_TOKEN|CLIENT_SECRET|SERVICE_ACCOUNT_KEY|APPLICATION_CREDENTIALS)$/.test(
          key,
        ),
      `Browser recipe refuses external credential variable ${key}`,
    );
  }
}

export const browserBuildEnvironment = {
  RUNTIME_MODE: 'remote-kubernetes',
  VITE_RUNTIME_MODE: 'remote-kubernetes',
  RUNTIME_API_BASE_URL: 'http://127.0.0.1:3001/api/runtime',
  VITE_RUNTIME_API_BASE_URL: 'http://127.0.0.1:3001/api/runtime',
};
