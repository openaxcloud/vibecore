/**
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(resolve(process.cwd(), 'app/routes/projects.new.tsx'), 'utf8');
const stylesSource = readFileSync(resolve(process.cwd(), 'app/styles/index.scss'), 'utf8');

describe('projects/new responsive UI contract', () => {
  it('keeps the prompt first and groups secondary choices behind one mobile disclosure', () => {
    const composerIndex = routeSource.indexOf('className="vc-new-project-composer"');
    const disclosureIndex = routeSource.indexOf('className="vc-new-project-advanced-toggle"');
    const advancedContentIndex = routeSource.indexOf('id="vc-new-project-advanced-content"');
    const metadataIndex = routeSource.indexOf('className="vc-new-project-meta"', advancedContentIndex);
    const examplesIndex = routeSource.indexOf('className="vc-new-project-examples"', advancedContentIndex);
    const templatesIndex = routeSource.indexOf('id="vc-new-project-templates"');

    expect(routeSource).toContain('const [advancedOpen, setAdvancedOpen] = useState(false)');
    expect(routeSource).toContain('aria-expanded={advancedOpen}');
    expect(routeSource).toContain('aria-controls="vc-new-project-advanced-content vc-new-project-templates"');
    expect(routeSource).toContain("data-open={advancedOpen ? 'true' : 'false'}");
    expect(composerIndex).toBeGreaterThan(-1);
    expect(disclosureIndex).toBeGreaterThan(composerIndex);
    expect(advancedContentIndex).toBeGreaterThan(disclosureIndex);
    expect(metadataIndex).toBeGreaterThan(advancedContentIndex);
    expect(examplesIndex).toBeGreaterThan(metadataIndex);
    expect(templatesIndex).toBeGreaterThan(examplesIndex);
  });

  it('shows advanced controls directly on larger screens and collapses them on mobile', () => {
    expect(stylesSource).toMatch(/\.vc-new-project-advanced-toggle\s*{\s*display:\s*none;/);
    expect(stylesSource).toMatch(
      /\.vc-new-project-advanced-content\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/,
    );
    expect(stylesSource).toMatch(
      /@media \(max-width:\s*640px\)[\s\S]*\.vc-new-project-advanced-toggle\s*{[^}]*display:\s*flex;/,
    );
    expect(stylesSource).toMatch(/\.vc-new-project-advanced-content\[data-open='true'\]\s*{\s*display:\s*flex;/);
    expect(stylesSource).toMatch(/\.vc-new-project-templates\[data-open='true'\]\s*{\s*display:\s*flex;/);
  });

  it('only reveals keyboard hints when the browser reports desktop-style input', () => {
    expect(routeSource).toContain('className="vc-new-project-keyboard-hint"');
    expect(stylesSource).toMatch(/\.vc-new-project-submit-shortcut\s*{\s*display:\s*none;/);
    expect(stylesSource).toMatch(/\.vc-new-project-keyboard-hint\s*{\s*display:\s*none;/);
    expect(stylesSource).toMatch(
      /@media \(hover:\s*hover\) and \(pointer:\s*fine\)[\s\S]*\.vc-new-project-submit-shortcut\s*{\s*display:\s*inline-flex;/,
    );
  });

  it('keeps primary touch controls at least 44 pixels tall', () => {
    expect(stylesSource).toMatch(/\.vc-new-project-attach\s*{[^}]*width:\s*44px;[^}]*height:\s*44px;/);
    expect(stylesSource).toMatch(/\.vc-new-project-submit\s*{[^}]*min-height:\s*44px;/);
    expect(stylesSource).toMatch(/\.vc-new-project-chip\s*{[^}]*height:\s*44px;/);
    expect(stylesSource).toMatch(/\.vc-new-project-refresh\s*{[^}]*width:\s*44px;[^}]*height:\s*44px;/);
    expect(stylesSource).toMatch(/\.vc-new-project-example\s*{[^}]*min-height:\s*44px;/);
    expect(stylesSource).toMatch(
      /\.vc-new-project-templates button\s*{[^}]*height:\s*44px\s*!important;[^}]*min-height:\s*44px\s*!important;/,
    );
  });

  it('does not expose implementation copy or decorative glow in the creation flow', () => {
    expect(routeSource).not.toContain('Authenticated template flow already wired');
    expect(routeSource).not.toContain('vc-new-project-glow');
    expect(stylesSource).not.toContain('.vc-new-project-glow');
    expect(routeSource).toContain('Choose a curated starter and customize it with the agent.');
  });
});
