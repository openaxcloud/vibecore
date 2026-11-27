// Browser smoke for the fixture and its oracle, on loopback only.
import { checkLocalPublication } from './anonymous';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { checkCalculation, emittedOrigin } from './probe';

const directory = await mkdtemp(join(tmpdir(), 'dynamic-fixture-'));
const filepath = join(directory, 'rule.json');
const serverFile = join(directory, 'server.cjs');
await copyFile(new URL('./server.cjs', import.meta.url), serverFile);
await writeFile(filepath, JSON.stringify({ version: 'A', factor: 3 }));
const child = spawn(process.execPath, [serverFile], {
  env: { ...process.env, PORT: '0', HOST: '127.0.0.1' },
  stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
});
try {
  const [port] = await Promise.race([
    once(child, 'message'),
    once(child, 'exit').then(() => {
      throw Error('Fixture exited before listening');
    }),
  ]);
  const origin = 'http://127.0.0.1:' + port;
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium',
  });
  try {
    const page = await browser.newPage();
    await checkCalculation(page, origin, 'A', 3);
    await writeFile(filepath, JSON.stringify({ version: 'B', factor: 7 }));
    const context = await browser.newContext();
    assert.deepEqual(await context.cookies(), []);
    const fresh = await context.newPage();
    await checkCalculation(fresh, origin, 'B', 7);
    await checkLocalPublication('https://d-localfixture.localhost', 'B', 7, Number(port));
    await assert.rejects(checkCalculation(fresh, origin, 'A', 3));
    await assert.rejects(checkCalculation(fresh, origin, 'B', 3));
    assert.equal(emittedOrigin('https://d-ab1234.localhost/', 'ab1234'), 'https://d-ab1234.localhost');
    for (const wrong of [
      'https://d-other.localhost',
      'http://d-ab1234.localhost',
      'https://example.com',
      'https://d-ab1234.localhost/redirect',
    ])
      assert.throws(() => emittedOrigin(wrong, 'ab1234'));
    console.log(
      'PASS A, saved B, anonymous B, stale version and stale calculation rejected, emitted origin restricted',
    );
  } finally {
    await browser.close();
  }
} finally {
  child.kill();
  await rm(directory, { recursive: true, force: true });
}
