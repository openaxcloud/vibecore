/** Only the guarded ephemeral workflow may opt into remote Playwright. */
export function browserEndpoint(env = process.env) {
  const endpoint = env.PW_TEST_CONNECT_WS_ENDPOINT;

  if (!endpoint) {
    return undefined;
  }

  if (
    env.GITHUB_ACTIONS !== 'true' ||
    env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    env.VIBECORE_CI_EPHEMERAL_RUNTIME !== '1' ||
    env.VIBECORE_CI_BROWSER_ISOLATION !== '1' ||
    endpoint !== 'ws://127.0.0.1:18082/runtime-browser'
  ) {
    throw new Error('runtime_browser_guard');
  }

  return endpoint;
}
export async function launchRuntimeChromium(chromium, options, env = process.env) {
  const endpoint = browserEndpoint(env);

  if (!endpoint) {
    return chromium.launch(options);
  }

  return chromium.connect(endpoint, {
    timeout: options?.timeout ?? 180000,
    headers: { 'x-playwright-launch-options': JSON.stringify(options ?? {}) },
  });
}
