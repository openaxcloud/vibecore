import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { compile } from 'sass-embedded';
import { createGenerator } from 'unocss';
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- use the real root UnoCSS config for browser contrast measurements
import unoConfig from '../../../uno.config';
import { EcodeMobilePage } from './EcodeProductMarketingPages';
import { prechaufferCoquillePublique } from '~/components/dashboard/prechauffer-coquille-publique';
import { createI18nInstance } from '~/lib/i18n/runtime';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? chromium.executablePath();

/* Real components + repository CSS, without application hydration or remote services. */
describe('mobile editor code contrast', () => {
  it.skipIf(!existsSync(executablePath))('meets AA in both themes at phone, tablet and desktop widths', async () => {
    await prechaufferCoquillePublique();

    const router = createMemoryRouter([{ path: '/mobile', element: <EcodeMobilePage /> }], {
      initialEntries: ['/mobile'],
    });
    const markup = renderToStaticMarkup(
      <I18nextProvider i18n={createI18nInstance('en')}>
        <RouterProvider router={router} />
      </I18nextProvider>,
    );

    const uno = await createGenerator(unoConfig);
    const utilities = await uno.generate(`${markup} text-emerald-200`);
    const css = compile(join(__dirname, '../../styles/index.scss'), { style: 'expanded' }).css;
    const reset = readFileSync(join(process.cwd(), 'node_modules/@unocss/reset/tailwind-compat.css'), 'utf8');
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      for (const width of [390, 768, 1440]) {
        for (const theme of ['light', 'dark']) {
          const page = await browser.newPage({ viewport: { width, height: 1000 } });

          try {
            // External fonts, images and links must never make a network request.
            await page.route('**/*', (route) => route.abort());
            await page.setContent(
              `<html data-theme="${theme}"><head><style>${reset}\n${utilities.css}\n${css}</style></head><body>${markup}</body></html>`,
            );

            const code = page.locator('pre').filter({ hasText: 'import Workspace from "@ecode/mobile";' });
            expect(await code.count()).toBe(1);
            await code.scrollIntoViewIfNeeded();

            const measurement = await code.evaluate((element) => {
              const rgba = (value: string) => value.match(/[\d.]+/g)!.map(Number);

              const luminance = (rgb: number[]) =>
                rgb.slice(0, 3).reduce((sum, value, index) => {
                  const channel = value / 255;

                  return (
                    sum +
                    [0.2126, 0.7152, 0.0722][index] *
                      (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
                  );
                }, 0);

              const layers: number[][] = [];

              let current: Element | null = element;

              while (current) {
                const style = getComputedStyle(current);

                if (style.backgroundImage !== 'none' || Number(style.opacity) !== 1) {
                  throw new Error('Contrast probe requires solid backgrounds and opaque ancestors');
                }

                layers.unshift(rgba(style.backgroundColor));
                current = current.parentElement;
              }

              const background = layers.reduce(
                (back, front) => {
                  const alpha = front[3] ?? 1;

                  return back.map((channel, index) => front[index] * alpha + channel * (1 - alpha));
                },
                [255, 255, 255],
              );

              const codeStyle = getComputedStyle(element.querySelector('code')!);
              const foreground = rgba(codeStyle.color);

              if ((foreground[3] ?? 1) !== 1 || Number(codeStyle.opacity) !== 1) {
                throw new Error('Contrast probe requires opaque code text');
              }

              const a = luminance(foreground);
              const b = luminance(background);
              const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

              return { foreground, background, ratio, fontSize: getComputedStyle(element).fontSize };
            });

            if (process.env.CONTRAST_EVIDENCE_DIR) {
              const directory = process.env.CONTRAST_EVIDENCE_DIR;
              mkdirSync(directory, { recursive: true });
              writeFileSync(
                join(directory, `${theme}-${width}.json`),
                JSON.stringify({ width, theme, ...measurement }, null, 2),
              );
              await code.locator('..').screenshot({ path: join(directory, `${theme}-${width}.png`) });
            }

            expect(measurement.ratio, JSON.stringify({ width, theme, ...measurement })).toBeGreaterThanOrEqual(4.5);
          } finally {
            await page.close();
          }
        }
      }
    } finally {
      router.dispose();
      await browser.close();
    }
  });
});
