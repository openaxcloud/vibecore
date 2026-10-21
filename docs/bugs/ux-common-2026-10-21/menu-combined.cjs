// Exact local recipe: run from the integration checkout with its private synthetic session files.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
(async () => {
  const s = JSON.parse(fs.readFileSync('.vibecore/ux-qa/integration-menu-session.json'));
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  let results = [];
  const headers = { authorization: `Bearer ${s.cookies[0].value}`, 'content-type': 'application/json' };
  const created = await fetch(`http://127.0.0.1:3016/projects/${s.projectId}/ai/conversations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: 'Menu extra UX QA' }),
  });
  expect(created.ok).toBe(true);
  const { conversation } = await created.json();
  const saved = await fetch(
    `http://127.0.0.1:3016/projects/${s.projectId}/ai/conversations/${conversation.id}/transcript`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        messages: [{ clientId: 'menu-extra-user', role: 'user', content: 'Synthetic menu accessibility audit' }],
      }),
    },
  );
  expect(saved.ok).toBe(true);
  const state = await fetch(`http://127.0.0.1:3016/projects/${s.projectId}/ide-state`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ state: { chat: { metadata: { aiConversationId: conversation.id } } } }),
  });
  expect(state.ok).toBe(true);
  for (const lang of ['en', 'fr']) {
    const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await c.addCookies(s.cookies);
    await c.addCookies([{ name: 'vibecore-lang', value: lang, url: 'http://127.0.0.1:5209' }]);
    const p = await c.newPage();
    await p.goto(`http://127.0.0.1:5209/projects/${s.projectId}/ide?panel=agent&lang=${lang}`);
    await p
      .locator('.bolt-user-message-bubble')
      .filter({ hasText: 'Synthetic menu accessibility audit' })
      .first()
      .waitFor();
    const label = lang === 'en' ? 'More agent actions' : "Plus d'actions d'agent";
    const trigger = p.getByRole('button', { name: label, exact: true }),
      menu = p.getByRole('menu', { name: label, exact: true });
    const target = p.getByTestId('ide-agent-composer').locator('textarea').first();
    await trigger.click();
    await expect(menu).toBeVisible();
    await target.click();
    await expect(menu).toBeHidden();
    await expect(target).toBeFocused();
    results.push({ lang, gesture: 'outside click on composer', passed: true });
    await trigger.click();
    await expect(menu).toBeVisible();
    await target.focus();
    await expect(menu).toBeHidden();
    await expect(target).toBeFocused();
    results.push({ lang, gesture: 'focus leaves menu', passed: true });
    await trigger.focus();
    await p.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await p.keyboard.press('Shift+Tab');
    await expect(menu).toBeHidden();
    const focus = await p.evaluate(() => ({
      tag: document.activeElement.tagName,
      label: document.activeElement.getAttribute('aria-label'),
      text: document.activeElement.textContent.slice(0, 100),
    }));
    expect(focus.tag).not.toBe('BODY');
    await expect(trigger).not.toBeFocused();
    results.push({ lang, gesture: 'Shift+Tab', passed: true, focus });
    await trigger.click();
    await expect(menu).toBeVisible();
    await menu
      .getByRole('menuitem', { name: lang === 'en' ? 'Clear history' : "Effacer l'historique", exact: true })
      .click();
    const confirmation = p.getByRole('dialog', {
      name: lang === 'en' ? 'Clear conversation history?' : "Effacer l'historique des conversations ?",
      exact: true,
    });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: lang === 'en' ? 'Cancel' : 'Annuler', exact: true }).click();
    await expect(confirmation).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(
      p.locator('.bolt-user-message-bubble').filter({ hasText: 'Synthetic menu accessibility audit' }).first(),
    ).toBeVisible();
    results.push({
      lang,
      gesture: 'menu opens shared confirmation, cancel preserves conversation and restores trigger focus',
      passed: true,
    });
    await p.screenshot({ path: `/workspace/ux-artifacts/common-749-750-753/menu-${lang}.png` });
    await c.close();
  }
  fs.writeFileSync(
    '/workspace/ux-artifacts/common-749-750-753/menu.json',
    JSON.stringify(
      {
        sources: [
          'e996671e600322a5c5df8f70f4ad8f4cfe766707',
          'f06923ff4c7aa4ce71e9b0e9af0584c0ca39f7a8',
          'fc8a687e715e6052668ade83474da4aef5f27df9',
        ],
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results, null, 2));
  await b.close();
})();
