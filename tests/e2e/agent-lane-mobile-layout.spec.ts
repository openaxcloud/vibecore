import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { compileAsync } from 'sass-embedded';
import { createGenerator, presetUno } from 'unocss';

let fixtures: Record<string, string>;

const original = 'The agent emitted actions without a valid report. Execution has not been observed.';

let stylesheet: string;
test.describe('mobile specialist card geometry', () => {
  test.beforeAll(async () => {
    test.setTimeout(180_000);
    fixtures = JSON.parse(
      execFileSync(process.execPath, ['--import', 'tsx', 'tests/fixtures/render-agent-lanes.tsx'], {
        encoding: 'utf8',
      }),
    );
    stylesheet =
      readFileSync(createRequire(import.meta.url).resolve('@unocss/reset/tailwind-compat.css'), 'utf8') +
      (await compileAsync('app/styles/index.scss')).css;
  });

  for (const width of [390, 393, 430, 852]) {
    test(`real line boxes and terminal density at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 852 ? 393 : 852 });
      await page.route('**/*', (route) => route.abort());

      const markup = fixtures.streaming;
      const generator = await createGenerator({ presets: [presetUno()] });
      const css = (await generator.generate(markup)).css;
      await page.setContent(
        `<html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\n${stylesheet}</style></head><body>${markup}</body></html>`,
      );

      const preview = page.getByTestId('agent-lane-apercu');
      const height = (await preview.boundingBox())!.height;
      await preview.evaluate((node) => {
        node.textContent = 'Un texte long pendant le flux. '.repeat(30);
      });
      expect((await preview.boundingBox())!.height).toBeCloseTo(height, 1);
      expect(await preview.evaluate((n) => n.clientHeight / parseFloat(getComputedStyle(n).lineHeight))).toBeCloseTo(
        3,
        1,
      );

      const terminal = fixtures.terminal;
      await page.locator('main').evaluate((node, html) => {
        node.outerHTML = html;
      }, terminal);

      const metadata = page.getByTestId('agent-lane-output');
      expect(await metadata.evaluate((n) => n.scrollHeight <= n.clientHeight)).toBe(true);
      await expect(preview).toHaveText(
        'L’agent a émis des actions sans rapport valide. L’exécution n’a pas été observée.',
      );

      const details = page.locator('summary');
      expect((await details.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await details.click();
      await expect(page.locator('pre')).toHaveText(original);
      await details.click();
      await page.addStyleTag({ content: ':root { --vc-type-interface-size: 28px; }' });
      expect(await metadata.evaluate((n) => n.scrollHeight <= n.clientHeight)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('main').evaluate((node, html) => {
        node.outerHTML = html;
      }, fixtures.empty);
      await expect(page.getByTestId('agent-lane-output')).toBeHidden();
      expect((await preview.boundingBox())!.height).toBeLessThan(height);
    });
  }
});
