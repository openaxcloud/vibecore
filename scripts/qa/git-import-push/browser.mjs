import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import JSZip from 'jszip';

const { QA_WEB: web, QA_API: api, QA_ROOT: root } = process.env;
const auth = await (
  await fetch(api + '/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'QA', email: 'qa-' + Date.now() + '@example.invalid', password: 'Synthetic123!' }),
  })
).json();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page
    .context()
    .route(/^https?:/, (route) =>
      [web, api].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort(),
    );
  await page.context().addCookies([{ name: 'vc_session', value: auth.token, url: web }]);
  await page.goto(web + '/import-github', { waitUntil: 'domcontentloaded' });
  await page.locator('[name=repositoryUrl]').fill('https://forge.example.invalid/qa/project.git');
  await page.locator('[name=branch]').fill('main');
  await page.locator('[name=name]').fill('Clone proof');
  await page.locator('form button[type=submit]').click();
  await page.getByTestId('ide-dock-git').waitFor();
  const org = auth.organization?.id ?? auth.organizations[0].id;
  const headers = { authorization: 'Bearer ' + auth.token };
  const projects = await (await fetch(api + '/orgs/' + org + '/projects', { headers })).json();
  const project = projects.projects.find((p) => p.name === 'Clone proof');
  const cwd = root + '/projects/' + project.id;
  const bare = root + '/origin.git';
  const git = (args, dir = cwd) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  const before = git(['rev-parse', 'main'], bare);
  assert.equal(git(['rev-parse', 'HEAD']), before);
  assert.equal(git(['rev-parse', 'HEAD~2']), git(['rev-parse', 'main~2'], bare));
  assert.equal(git(['remote', 'get-url', 'origin']), 'https://forge.example.invalid/qa/project.git');
  const name = 'qa-change-' + Date.now() + '.txt';
  const zip = new JSZip();
  zip.file(name, 'Local UI commit proof');
  const seed = await fetch(api + '/projects/' + project.id + '/files/import/zip', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ zipBase64: await zip.generateAsync({ type: 'base64' }) }),
  });
  assert.equal(seed.ok, true);
  await page.getByTestId('ide-dock-git').click();
  await page.getByRole('button', { name: /^(Tout indexer|Stage all)$/ }).click();
  await page.locator('textarea[name="message"],input[name="message"]').first().fill('UI history proof');
  const commit = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('ide-panel/git'));
  await page.getByRole('button', { name: /^(Committer les modifications|Commit changes)$/ }).click();
  assert.equal((await commit).status(), 200);
  const expected = git(['rev-parse', 'HEAD']);
  assert.equal(git(['rev-parse', 'HEAD^']), before);
  assert.equal(git(['show', 'HEAD:' + name]), 'Local UI commit proof');
  console.log('Imported tip', before, 'new UI commit', expected);
  await page.getByTestId('git-ahead-behind-badge').click();
  const action = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('ide-panel/git'));
  await page.getByTestId('git-badge-push').click();
  const response = await action;
  console.log('push', response.status(), (await response.text()).slice(0, 450));
  if (!response.ok() || git(['rev-parse', 'main'], bare) !== expected) throw Error('push did not update bare remote');
  console.log('verified bare main', expected);
} finally {
  await browser.close();
}
