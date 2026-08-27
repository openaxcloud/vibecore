import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SOLUTION_APP_SHOWCASES, SOLUTION_APP_SHOWCASE_SLUGS, SOLUTION_SHOWCASE_UI } from './solution-app-showcases';

function publicFile(publicUrl: string): string {
  return resolve(process.cwd(), 'public', publicUrl.replace(/^\//u, ''));
}

function pngDimensions(filePath: string): { width: number; height: number } {
  const image = readFileSync(filePath);
  const signature = image.subarray(0, 8).toString('hex');

  expect(signature).toBe('89504e470d0a1a0a');

  return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}

describe('solution application showcases', () => {
  it('maps every SOL-02 → SOL-09 route to its own primary working application', () => {
    expect(Object.keys(SOLUTION_APP_SHOWCASES)).toEqual([...SOLUTION_APP_SHOWCASE_SLUGS]);

    const primaryIds = SOLUTION_APP_SHOWCASE_SLUGS.map((slug) => SOLUTION_APP_SHOWCASES[slug].primary.id);

    expect(new Set(primaryIds).size).toBe(SOLUTION_APP_SHOWCASE_SLUGS.length);
    expect(primaryIds).not.toContain('app-builder');
  });

  for (const slug of SOLUTION_APP_SHOWCASE_SLUGS) {
    it(`${slug} uses executable previews and real 1200×675 captures`, () => {
      const showcase = SOLUTION_APP_SHOWCASES[slug];

      for (const visual of [showcase.primary, showcase.supporting, showcase.related]) {
        const thumbnail = publicFile(visual.thumbnailSrc);
        const preview = publicFile(`${visual.previewHref}index.html`);

        expect(existsSync(thumbnail), `${visual.id} thumbnail`).toBe(true);
        expect(existsSync(preview), `${visual.id} preview`).toBe(true);
        expect(pngDimensions(thumbnail)).toEqual({ width: 1200, height: 675 });

        for (const language of ['en', 'fr'] as const) {
          expect(visual.alt[language].length).toBeGreaterThan(50);
          expect(visual.description[language].length).toBeGreaterThan(50);
          expect(visual.capability[language].length).toBeGreaterThan(5);
        }
      }
    });
  }

  it('ships complete English and French interface copy', () => {
    for (const language of ['en', 'fr'] as const) {
      for (const value of Object.values(SOLUTION_SHOWCASE_UI[language])) {
        expect(value.trim().length).toBeGreaterThan(4);
      }
    }
  });
});
