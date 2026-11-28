// Run against the isolated app and Google double described in README.md.
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');

const app = 'http://127.0.0.1:19871';
const provider = 'http://127.0.0.1:19873';
const destination = '/projects/new?draft=registration';

const cases = [
  ['short query', '?', 'Café 🪴'],
  ['8000-unit query', '?', 'a'.repeat(7750) + '漢'.repeat(250)],
  ['8000-unit Unicode fragment', '#', '漢🪴é'.repeat(2000)],
  ['over limit', '#', '漢🪴é'.repeat(2000) + '!'],
];

async function check(browser, name, delimiter, idea) {
  const context = await browser.newContext();

  try {
    const page = await context.newPage();
    const authorizeRequests = [];
    const projectSubmissions = [];
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (url.origin === provider && url.pathname === '/authorize') {
        authorizeRequests.push(url);
      }

      if (url.origin === app && url.pathname.startsWith('/projects/new') && request.method() === 'POST') {
        projectSubmissions.push(url.pathname);
      }

      if ([app, provider].includes(url.origin)) {
        await route.continue();
      } else {
        await route.abort();
      }
    });
    await page.goto(app + '/register' + delimiter + new URLSearchParams({ prompt: idea }), {
      waitUntil: 'domcontentloaded',
    });

    const google = page.locator('a[href^="/auth/oauth/google"]');
    await expect(google).toHaveAttribute('href', '/auth/oauth/google?returnTo=' + encodeURIComponent(destination), {
      timeout: 90000,
    });

    const oauthStart = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.startsWith('/auth/oauth/google') && !response.url().includes('callback'),
    );
    await google.click();

    const response = await oauthStart;
    const headers = await response.headersArray();

    const cookie = headers.find(
      (header) => header.name.toLowerCase() === 'set-cookie' && header.value.startsWith('vc_oauth_return='),
    );
    assert.equal(cookie?.value.split(';')[0], 'vc_oauth_return=' + encodeURIComponent(destination));
    await expect(page).toHaveURL(app + destination, { timeout: 90000 });
    await expect(page.locator('textarea[name=prompt]')).toHaveValue(idea, { timeout: 90000 });

    if (idea.length > 8000) {
      await expect(page.locator('textarea[name=prompt]')).toHaveAttribute('aria-invalid', 'true');
    }

    assert.equal(authorizeRequests.length, 1);
    assert.ok(authorizeRequests[0].href.length < 1000);

    const state = Buffer.from(authorizeRequests[0].searchParams.get('state'), 'base64url').toString('utf8');
    assert.match(state, /^google\.\d+\.[0-9a-f-]{36}\.[0-9a-f]{64}$/);
    assert.ok(!decodeURIComponent(authorizeRequests[0].href).includes(idea));
    assert.equal((await (await context.request.get(app + '/api/auth/user')).json()).email, 'google@local.test');
    assert.deepEqual(projectSubmissions, []);
    console.log(name + ': exact draft restored, short cookie, provider round trip, zero project submissions');
  } finally {
    await context.close();
  }
}

async function checkBlockedStorage(browser) {
  const context = await browser.newContext();

  try {
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === app ? route.continue() : route.abort(),
    );
    await context.addInitScript(() => {
      const setItem = Storage.prototype.setItem;

      Storage.prototype.setItem = function (key, value) {
        if (this === sessionStorage && key === 'registrationReviewDraft') {
          throw new DOMException('Blocked', 'QuotaExceededError');
        }

        return setItem.call(this, key, value);
      };
    });

    const page = await context.newPage();
    await page.goto(app + '/register?lang=en#prompt=Recover+this+idea', { waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('Your idea')).toHaveValue('Recover this idea', { timeout: 90000 });
    await expect(page.locator('a[href^="/auth/oauth/google"]')).toHaveCount(0);
    await page.getByRole('link', { name: 'Continue without the draft' }).click();
    await expect(page.locator('a[href^="/auth/oauth/google"]')).toHaveAttribute('href', '/auth/oauth/google');
    console.log('blocked storage: recoverable text and explicit opt-out');
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

  try {
    for (const [name, delimiter, idea] of cases) {
      await check(browser, name, delimiter, idea);
    }
    await checkBlockedStorage(browser);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
