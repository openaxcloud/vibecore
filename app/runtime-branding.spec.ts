import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(file: string) {
  return readFileSync(join(process.cwd(), file), 'utf8');
}

describe('runtime E-Code branding', () => {
  it('removes the upstream landing tagline from the empty chat surface', () => {
    const chat = source('app/components/chat/BaseChat.tsx');
    const chatCatalog = source('app/lib/i18n/catalogs/chat.ts');

    expect(chatCatalog).toContain('Turn ideas into working software');
    expect(`${chat}\n${chatCatalog}`).not.toContain('Where ideas begin');
  });

  it('identifies E-Code in network and diagnostic surfaces', () => {
    expect(source('app/lib/hooks/useGit.ts')).toContain("'User-Agent': 'E-Code'");
    expect(source('app/routes/api.bug-report.ts')).toContain('`- E-Code: ${data.environmentInfo.boltVersion}\\n`');
    expect(source('app/lib/api/updates.ts')).toContain(
      'https://raw.githubusercontent.com/openaxcloud/vibecore/main/package.json',
    );
    expect(source('scripts/update.sh')).toContain('Starting E-Code update process');
    expect(source('scripts/update.sh')).toContain('https://api.github.com/repos/openaxcloud/vibecore/releases/latest');
    expect(source('scripts/update.sh')).not.toContain('stackblitz-labs/bolt.diy');
    expect(source('pre-start.cjs')).toContain('E - C O D E');
    expect(source('pre-start.cjs')).not.toContain('B O L T . D I Y');
  });

  it('publishes desktop updates from the public E-Code repository', () => {
    const updater = source('electron-update.yml');
    const builder = source('electron-builder.yml');

    expect(updater).toContain('owner: openaxcloud\nrepo: vibecore\nprovider: github\nprivate: false');
    expect(builder).toMatch(
      /publish:\n  provider: github\n  owner: openaxcloud\n  repo: vibecore\n  private: false\n  releaseType: release/,
    );
    expect(`${updater}\n${builder}`).not.toMatch(/stackblitz-labs|repo: bolt\.diy|owner: vibecore|private: true/i);
  });

  it('keeps public contributor surfaces owned by E-Code', () => {
    const bugReport = source('.github/ISSUE_TEMPLATE/bug_report.yml');
    const issueConfig = source('.github/ISSUE_TEMPLATE/config.yml');
    const preview = source('.github/workflows/preview.yaml');
    const changelog = source('.github/scripts/generate-changelog.sh');
    const codeowners = source('.github/CODEOWNERS');

    expect(bugReport).toContain('[E-Code](https://e-code.ai)');
    expect(bugReport).toContain('Link to the E-Code project that caused the error');
    expect(issueConfig).toContain('url: https://e-code.ai/contact');
    expect(preview).toContain('projectName: bolt-diy-preview');
    expect(preview.match(/Built with \[E-Code\]\(https:\/\/e-code\.ai\)/g)).toHaveLength(2);
    expect(changelog).toContain(': "${GITHUB_REPOSITORY:=openaxcloud/vibecore}"');
    expect(codeowners).toContain('# Code Owners for E-Code');
    expect(codeowners.match(/@openaxcloud/g)?.length).toBeGreaterThanOrEqual(10);

    const brandedSurfaces = [
      bugReport,
      issueConfig,
      preview.replace('bolt-diy-preview', ''),
      changelog,
      codeowners,
    ].join('\n');
    expect(brandedSurfaces).not.toMatch(/bolt\.diy|stackblitz-labs\/bolt|thinktank\.ottomator\.ai|@stackblitz-labs/i);
  });

  it('keeps the published documentation on E-Code product and repository links', () => {
    const mkdocs = source('docs/mkdocs.yml');
    const index = source('docs/docs/index.md');
    const faq = source('docs/docs/FAQ.md');
    const contributing = source('docs/docs/CONTRIBUTING.md');
    const documentation = [mkdocs, index, faq, contributing].join('\n');

    expect(mkdocs).toContain('site_name: E-Code Docs');
    expect(mkdocs).toContain('repo_name: openaxcloud/vibecore');
    expect(mkdocs).toContain('repo_url: https://github.com/openaxcloud/vibecore');
    expect(index).toContain('# Welcome to E-Code');
    expect(index).toContain('git clone https://github.com/openaxcloud/vibecore.git');
    expect(faq).toContain('https://github.com/openaxcloud/vibecore/issues/new/choose');
    expect(contributing).toContain('git clone https://github.com/openaxcloud/vibecore.git');

    // Keep one explicit upstream attribution and the existing Docker target identifiers.
    expect(index).toContain(
      'E-Code originated from the open-source [bolt.diy](https://github.com/stackblitz-labs/bolt.diy) project',
    );
    expect(documentation.match(/stackblitz-labs\/bolt\.diy/g)).toHaveLength(1);
    expect(documentation.match(/bolt\.diy/gi)).toHaveLength(2);
    expect(documentation).toContain('bolt-ai-development');
    expect(documentation).toContain('bolt-ai-production');
    expect(documentation).not.toMatch(/thinktank\.ottomator\.ai|x\.com\/bolt_diy|bsky\.app\/profile\/bolt\.diy/i);
  });

  it('uses E-Code in user-facing agent guidance while preserving compatibility identifiers', () => {
    const walkthrough = source('app/components/docs/AgentWalkthrough.tsx');
    const walkthroughCatalog = source('app/lib/i18n/catalogs/agent-walkthrough.ts');
    const chat = source('app/components/chat/BaseChat.tsx');
    const chatCatalog = source('app/lib/i18n/catalogs/chat.ts');
    const prompt = source('app/lib/common/prompts/discuss-prompt.ts');

    expect(walkthroughCatalog).toContain('Standalone E-Code safety:');
    expect(chatCatalog).toContain('Core E-Code workflow');
    expect(prompt).toContain('E-Code ALWAYS uses stock photos from Pexels');
    expect(prompt).toContain('E-Code NEVER downloads the images');
    expect(`${walkthrough}\n${walkthroughCatalog}\n${chat}\n${chatCatalog}\n${prompt}`).not.toMatch(
      /Standalone Bolt safety|Core Bolt workflow|Bolt (?:ALWAYS|NEVER)/,
    );

    // These names are parser, theme and storage contracts rather than product copy.
    expect(prompt).toContain('<bolt-quick-actions>');
    expect(chat).toContain('workbenchStore.boltTerminal');
  });

  it('keeps root contributor documentation owned by E-Code', () => {
    const contributing = source('CONTRIBUTING.md');
    const project = source('PROJECT.md');
    const faq = source('FAQ.md');
    const documentation = [contributing, project, faq].join('\n');

    expect(contributing).toContain('helping us make **E-Code** a better tool');
    expect(contributing).toContain('git clone https://github.com/openaxcloud/vibecore.git');
    expect(project).toContain('# Project management for E-Code');
    expect(project).toContain('https://github.com/openaxcloud/vibecore/issues');
    expect(faq).toContain("What is E-Code's open-source history?");
    expect(faq).toContain(
      'It originated from the open-source [bolt.diy](https://github.com/stackblitz-labs/bolt.diy) project',
    );
    expect(faq).toContain('https://github.com/openaxcloud/vibecore/issues/new/choose');

    // Preserve one structured upstream attribution and existing Docker contracts only.
    expect(documentation.match(/stackblitz-labs\/bolt\.diy/g)).toHaveLength(1);
    expect(documentation).toContain('bolt-ai-development');
    expect(documentation).toContain('bolt-ai-production');
    expect(documentation).not.toMatch(/orgs\/stackblitz-labs|roadmap\.sh\/r\/ottodev|forms\.gle\//i);
  });
});
