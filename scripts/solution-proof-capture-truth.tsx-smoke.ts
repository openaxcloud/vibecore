import assert from 'node:assert/strict';

import { chromium } from '@playwright/test';

import { auditPromptBubbleViewport } from './solution-proof-capture-truth.js';

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { height: 900, width: 1440 } });

    await page.setContent(`
      <main data-testid="prompt-scrollport" style="height:300px;overflow:auto;margin:100px">
        <article data-message-id="tsx-smoke-message" style="width:600px;min-height:1000px;padding:24px;background:#222;color:white;font:20px sans-serif">
          <span>Build a genuine local project with a working interaction and verified preview.</span>
          <span style="display:block;margin-top:700px">PeopleOps</span>
        </article>
      </main>
    `);

    const audit = await auditPromptBubbleViewport(
      page,
      page.locator('[data-message-id="tsx-smoke-message"]'),
      'PeopleOps',
      'tsx-smoke-message',
    );

    assert.equal(audit.identityVisible, true);
    assert.equal(audit.messageIdMatchesProvenance, true);
    assert.deepEqual(audit.viewport, { height: 900, width: 1440 });
    assert.ok((await page.getByTestId('prompt-scrollport').evaluate((element) => element.scrollTop)) > 0);

    await page.setContent(`
      <article data-message-id="tsx-smoke-clipped" style="margin:100px;width:600px;height:160px;padding:24px;background:#222;color:white;font:20px sans-serif">
        <span>Visible prompt introduction with enough substantial bubble content for capture.</span>
        <span style="position:fixed;top:1800px;left:100px">PeopleOps</span>
      </article>
    `);

    await assert.rejects(
      auditPromptBubbleViewport(
        page,
        page.locator('[data-message-id="tsx-smoke-clipped"]'),
        'PeopleOps',
        'tsx-smoke-clipped',
      ),
      /Agent prompt viewport proof failed/,
    );
  } finally {
    await browser.close();
  }

  process.stdout.write('tsx prompt viewport smoke passed\n');
}

await main();
