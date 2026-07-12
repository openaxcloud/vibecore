import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const rootSource = readFileSync(join(process.cwd(), 'app/root.tsx'), 'utf8');
const clientEntrySource = readFileSync(join(process.cwd(), 'app/entry.client.tsx'), 'utf8');

describe('React Router document hydration contract', () => {
  it('renders route content directly in body without the legacy root island wrapper', () => {
    expect(rootSource).toMatch(/<body[^>]*>\s*\{children\}/);
    expect(rootSource).not.toContain('id="root"');
  });

  it('hydrates the same document root that the server renders', () => {
    expect(clientEntrySource).toContain('hydrateRoot(document, <HydratedRouter />)');
  });

  it('defers persisted document preferences until React has hydrated', () => {
    const inlineThemeStart = rootSource.indexOf('const inlineThemeCode');
    const hydrationListenerStart = rootSource.indexOf("window.addEventListener('ecode:hydrated'");
    const preHydrationBootCode = rootSource.slice(inlineThemeStart, hydrationListenerStart);

    expect(inlineThemeStart).toBeGreaterThan(-1);
    expect(hydrationListenerStart).toBeGreaterThan(inlineThemeStart);
    expect(preHydrationBootCode).not.toMatch(
      /(?:setTutorialKitTheme|markDismissedAnnouncement|markSidebarCollapsed)\(\);/,
    );
    expect(rootSource).toMatch(
      /useEffect\(\(\) => \{\s*window\.dispatchEvent\(new Event\('ecode:hydrated'\)\);\s*\}, \[\]\);/,
    );
  });
});
