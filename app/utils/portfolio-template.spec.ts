import { describe, expect, it } from 'vitest';
import {
  createPortfolioTemplateArtifact,
  createPortfolioTemplateFiles,
  createPortfolioTemplateStreamChunks,
  shouldUsePortfolioTemplate,
} from './portfolio-template';

describe('portfolio template cache', () => {
  it('matches fresh portfolio creation requests', () => {
    expect(
      shouldUsePortfolioTemplate({
        chatMode: 'build',
        files: {
          'README.md': {},
          'package.json': {},
          'src/App.tsx': {},
        },
        messages: [{ role: 'user', content: 'Create a polished portfolio for Maya Chen with case studies' }],
      }),
    ).toBe(true);
  });

  it('does not override non-starter workspaces', () => {
    expect(
      shouldUsePortfolioTemplate({
        chatMode: 'build',
        files: {
          'src/App.tsx': {},
          'src/features/billing.ts': {},
          'src/server/api.ts': {},
          'src/components/Chart.tsx': {},
          'src/components/Header.tsx': {},
          'src/components/Table.tsx': {},
          'src/routes/settings.tsx': {},
          'src/routes/dashboard.tsx': {},
        },
        messages: [{ role: 'user', content: 'Improve this portfolio page' }],
      }),
    ).toBe(false);
  });

  it('generates a complete bolt artifact with cached portfolio files', () => {
    const files = createPortfolioTemplateFiles([{ role: 'user', content: 'Build a portfolio for Jordan Lee' }]);
    const artifact = createPortfolioTemplateArtifact([{ role: 'user', content: 'Build a portfolio for Jordan Lee' }]);

    expect(files.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        'package.json',
        'index.html',
        'src/main.tsx',
        'src/App.tsx',
        'src/components/Hero.tsx',
        'src/data/portfolio.ts',
        'src/styles.css',
      ]),
    );
    expect(artifact).toContain('<boltArtifact id="cached-portfolio-site" title="Portfolio website">');
    expect(artifact).toContain('<boltAction type="file" filePath="src/App.tsx">');
    expect(artifact).toContain('Jordan Lee');
    expect(artifact).toContain('<boltAction type="start">');
  });

  it('streams cached portfolio output by file action chunks', () => {
    const chunks = createPortfolioTemplateStreamChunks([{ role: 'user', content: 'Build a portfolio for Jordan Lee' }]);

    expect(chunks[0]).toContain("E-Code's cached portfolio app template");
    expect(chunks.filter((chunk) => chunk.includes('<boltAction type="file"'))).toHaveLength(
      createPortfolioTemplateFiles([{ role: 'user', content: 'Build a portfolio for Jordan Lee' }]).length,
    );
    expect(chunks.at(-1)).toContain('<boltAction type="start">');
  });
});
