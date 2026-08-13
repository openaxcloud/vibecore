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

  it('applies the persisted theme before paint while deferring layout preferences until hydration', () => {
    const inlineThemeStart = rootSource.indexOf('const inlineThemeCode');
    const inlineThemeEnd = rootSource.indexOf('\n`;', inlineThemeStart);
    const inlineThemeSource = rootSource.slice(inlineThemeStart, inlineThemeEnd);

    expect(inlineThemeStart).toBeGreaterThan(-1);
    expect(inlineThemeEnd).toBeGreaterThan(inlineThemeStart);
    expect(inlineThemeSource.match(/setTutorialKitTheme\(\);/g)).toHaveLength(2);
    expect(inlineThemeSource.match(/markDismissedAnnouncement\(\);/g)).toHaveLength(1);
    expect(inlineThemeSource.match(/markSidebarCollapsed\(\);/g)).toHaveLength(1);
    expect(inlineThemeSource).toContain("root.setAttribute('data-ecode-theme-ready', 'true')");
    expect(inlineThemeSource).toContain("performance.mark('ecode-theme-applied')");
    expect(rootSource).toMatch(
      /useEffect\(\(\) => \{\s*window\.dispatchEvent\(new Event\('ecode:hydrated'\)\);\s*\}, \[\]\);/,
    );
  });
});
