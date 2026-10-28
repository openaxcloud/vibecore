import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./index.scss', import.meta.url), 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
const root = css.match(/\.bolt-project-deploy-tool\s*\{([^}]+)\}/)?.[1] ?? '';
const start = css.indexOf('@container project-deploy (max-width: 600px)');
const narrow = css.slice(start, css.indexOf('\n}\n', start));

describe('Publish layout in a resized IDE pane', () => {
  it('places tabs and each active view in successive full-width rows', () => {
    expect(root).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\);/);
    expect(root).toMatch(/align-content:\s*start;/);
    expect(root).toMatch(/container:\s*project-deploy \/ inline-size;/);
  });

  it('reflows domain and managed form fields by container, without hiding content', () => {
    expect(start).toBeGreaterThan(-1);
    expect(narrow).toContain('.bolt-project-deploy-tool .bolt-project-domain-add-card');
    expect(narrow).toContain('.bolt-project-deploy-tool .vc-managed-publish-form > .grid');
    expect(narrow).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\);/);
    expect(narrow).not.toMatch(/display:\s*none|visibility:\s*hidden/);

    const records = css.match(/\.bolt-project-deploy-tool \.bolt-project-dns-record code\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(records).toMatch(/white-space:\s*normal;/);
    expect(records).toMatch(/overflow-wrap:\s*anywhere;/);
    expect(narrow).toMatch(/overflow-wrap:\s*anywhere;/);
  });
});
