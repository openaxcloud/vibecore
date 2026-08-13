import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  applyAllowlist,
  buildBaseline,
  compareWithBaseline,
  scanHtml,
  scanSource,
  shouldScanFile,
  validateAllowlist,
} from './source-scanner.mjs';

describe('i18n source scanner', () => {
  it('finds JSX copy, visible attributes, UI messages, metadata and technical errors', () => {
    const source = `
      export function Example() {
        toast.success('Project saved');
        const meta = { name: 'description', content: 'Build production applications' };
        const email = { subject: 'Verify your email' };
        const response = new Response('Project not found');
        return <main aria-label="Project dashboard"><h1>Hello team</h1>{'Get started'}</main>;
      }
    `;

    const result = scanSource(source, 'app/routes/example.tsx');

    expect(result.parseErrors).toEqual([]);
    expect(result.findings.map((finding) => [finding.rule, finding.text])).toEqual(
      expect.arrayContaining([
        ['user-message-call', 'Project saved'],
        ['seo-meta-copy', 'Build production applications'],
        ['visible-object-copy', 'Verify your email'],
        ['response-message', 'Project not found'],
        ['visible-attribute', 'Project dashboard'],
        ['jsx-text', 'Hello team'],
        ['jsx-expression', 'Get started'],
      ]),
    );
  });

  it('does not flag code samples, URLs, translation keys or spec/catalog files', () => {
    const result = scanSource(
      `<><pre>npm run build</pre><code>const answer = 42</code><style>{\`.card { color: red; }\`}</style><a title="https://e-code.ai">x</a><p>{t('home.title')}</p></>`,
      'app/routes/example.tsx',
    );

    expect(result.findings).toEqual([]);
    expect(shouldScanFile('app/routes/example.spec.tsx')).toBe(false);
    expect(shouldScanFile('services/api/src/tests/fixture.ts')).toBe(false);
    expect(shouldScanFile('services/api/.vibecore-project-storage/project-1/src/App.tsx')).toBe(false);
    expect(shouldScanFile('app/lib/i18n/messages/en.ts')).toBe(false);
    expect(shouldScanFile('app/lib/i18n/catalogs/user-area.ts')).toBe(false);
    expect(shouldScanFile('app/components/marketing/solutions/app-builder.copy.ts')).toBe(false);
    expect(shouldScanFile('services/api/src/app-public-copy.ts')).toBe(false);
    expect(shouldScanFile('services/api/src/integrations/providers/public-error-copy.ts')).toBe(false);
    expect(shouldScanFile('services/api/src/transactional-i18n.ts')).toBe(false);
    expect(shouldScanFile('services/workspace-agent/src/public-i18n.ts')).toBe(false);
    expect(shouldScanFile('apps/admin/src/i18n.ts')).toBe(false);
    expect(shouldScanFile('app/routes/example.tsx')).toBe(true);
    expect(shouldScanFile('apps/mobile/index.html')).toBe(true);
    expect(shouldScanFile('public/offline.html')).toBe(true);
    expect(shouldScanFile('public/ecode-static/index.html')).toBe(false);
    expect(shouldScanFile('public/gallery-apps/landing-page/preview/index.html')).toBe(false);
    expect(shouldScanFile('docs/parity/baseline/snapshots/example.html')).toBe(false);
  });

  it('does not mistake hexadecimal color configuration for visible copy', () => {
    const result = scanSource(`export const palette = { text: '#FFFFFF' };`, 'app/types/design-scheme.ts');

    expect(result.findings).toEqual([]);
  });

  it('finds visible source HTML copy and metadata without scanning code or hidden templates', () => {
    const result = scanHtml(
      `<!doctype html>
      <html lang="en">
        <head>
          <title>Project dashboard</title>
          <meta name="description" content="Build production applications" />
          <style>.example::after { content: 'CSS diagnostic'; }</style>
        </head>
        <body>
          <main aria-label="Project workspace">
            <h1>Hello team</h1>
            <input placeholder="Search projects" />
            <input type="submit" value="Create project" />
            <section hidden aria-hidden="true">Offline connection lost</section>
            <pre>npm run build</pre>
            <template><p>Unrendered template copy</p></template>
          </main>
          <script>document.body.dataset.message = 'Script implementation detail';</script>
        </body>
      </html>`,
      'apps/example/index.html',
    );

    expect(result.parseErrors).toEqual([]);
    expect(result.findings.map((finding) => [finding.rule, finding.text])).toEqual(
      expect.arrayContaining([
        ['html-text', 'Project dashboard'],
        ['html-meta-copy', 'Build production applications'],
        ['html-visible-attribute', 'Project workspace'],
        ['html-text', 'Hello team'],
        ['html-visible-attribute', 'Search projects'],
        ['html-visible-attribute', 'Create project'],
        ['html-text', 'Offline connection lost'],
      ]),
    );
    expect(result.findings.map((finding) => finding.text)).not.toEqual(
      expect.arrayContaining([
        'CSS diagnostic',
        'npm run build',
        'Unrendered template copy',
        'Script implementation detail',
      ]),
    );
  });

  it('finds HTML embedded in a source literal', () => {
    const source = 'export const shell = `<!doctype html><html><body><h1>Connection interrupted</h1></body></html>`;';
    const result = scanSource(source, 'app/lib/offline-shell.ts');

    expect(result.findings).toMatchObject([
      { file: 'app/lib/offline-shell.ts', rule: 'embedded-html-text', text: 'Connection interrupted' },
    ]);
  });

  it('excludes only generated user-project HTML while retaining other findings in that module', () => {
    const source = `
      export const repairedProjectShell = \`<!doctype html><html><body><h1>E-code preview</h1></body></html>\`;
      throw new Error('Preview repair failed');
    `;

    const result = scanSource(source, 'app/lib/runtime/preview-manifest.ts');

    expect(result.findings).toMatchObject([{ rule: 'error-message', text: 'Preview repair failed' }]);
    expect(result.findings.some((finding) => finding.rule.startsWith('embedded-html'))).toBe(false);
  });

  it('accepts the externalized mobile HTML shell after the brand allowlist is applied', async () => {
    const source = await readFile('apps/mobile/index.html', 'utf8');
    const result = scanHtml(source, 'apps/mobile/index.html');

    const brandAllowlist = {
      schemaVersion: 1,
      entries: [
        {
          id: 'brand',
          path: '**/*',
          rule: '*',
          textPattern: '^(?:E-Code|VibeCore)$',
          justification: 'Brand names are not translated.',
          owner: 'brand-and-i18n',
          expiresOn: '2099-01-01',
        },
      ],
    };

    expect(result.parseErrors).toEqual([]);
    expect(applyAllowlist(result.findings, brandAllowlist).residual).toEqual([]);
  });

  it('finds interpolated messages and conditional or fallback copy', () => {
    const source = `
      toast.error(\`Snapshot failed: \${error.message}\`);
      setError(result.error ?? 'Panel action failed');
      const dialog = { title: compact ? t('dialog.short') : 'Review project changes' };
      const section = { heading: 'Deployment checks', items: ['Build passed', t('tests.passed')] };
      const payload = { error: 'Raw API failure' };
      throw new Error(error instanceof Error ? error.message : 'Unknown export error');
      setSettingsNotice(api.error ?? 'Settings could not be saved');
      export const View = () => <button aria-label={ready ? t('ready') : 'Start deployment'} />;
    `;

    const result = scanSource(source, 'app/routes/example.tsx');

    expect(result.findings.map((finding) => [finding.rule, finding.text])).toEqual(
      expect.arrayContaining([
        ['user-message-call', 'Snapshot failed: {…}'],
        ['user-message-call', 'Panel action failed'],
        ['visible-object-copy', 'Review project changes'],
        ['visible-object-copy', 'Deployment checks'],
        ['visible-object-copy', 'Build passed'],
        ['visible-object-copy', 'Raw API failure'],
        ['error-message', 'Unknown export error'],
        ['user-message-call', 'Settings could not be saved'],
        ['visible-attribute', 'Start deployment'],
      ]),
    );
  });

  it('does not mistake a SCREAMING_SNAKE protocol code for copy, but still catches real copy on the same key', () => {
    /*
     * `reason` is a visible object key because it often carries a sentence. It also
     * carries enum-like failure codes that no user ever reads. Production CI was red
     * on main for exactly this: `{ reason: 'SHARED_TENANT_UNAVAILABLE' }` in
     * services/api/src/database-provisioner.ts counted as new hardcoded-copy debt.
     */
    const source = `
      const machine = { reason: 'SHARED_TENANT_UNAVAILABLE' };
      const alsoMachine = { error: 'DB_TIMEOUT' };
      const copy = { reason: 'Your database is not ready yet' };
      const notACode = { reason: 'SHARED' };
    `;

    const rules = scanSource(source, 'services/api/src/example.ts').findings.map((f) => [f.rule, f.text]);

    expect(rules).not.toContainEqual(['visible-object-copy', 'SHARED_TENANT_UNAVAILABLE']);
    expect(rules).not.toContainEqual(['visible-object-copy', 'DB_TIMEOUT']);
    expect(rules).toContainEqual(['visible-object-copy', 'Your database is not ready yet']);

    // A single all-caps word is not a code — no underscore, and it reads as copy.
    expect(rules).toContainEqual(['visible-object-copy', 'SHARED']);
  });

  it('finds platform copy staged in semantically visible variables and assignments', () => {
    const source = `
      const description = 'Installed from the public repository';
      let note;
      note = unavailable ? 'The provider is unavailable right now.' : t('provider.available');
      state.message ??= \`Retry deployment for \${projectName}\`;
      let placeholder;
      placeholder ||= 'Search projects';
    `;

    const result = scanSource(source, 'app/routes/example.tsx');

    expect(result.parseErrors).toEqual([]);
    expect(result.findings.map((finding) => [finding.rule, finding.text])).toEqual(
      expect.arrayContaining([
        ['visible-variable-copy', 'Installed from the public repository'],
        ['visible-variable-copy', 'The provider is unavailable right now.'],
        ['visible-variable-copy', 'Retry deployment for {…}'],
        ['visible-variable-copy', 'Search projects'],
      ]),
    );
  });

  it('does not treat generic machine, protocol or user-content variables as platform copy', () => {
    const source = `
      const reason = 'token_expired_or_revoked';
      const code = 'CONNECTOR_TOKEN_EXPIRED';
      let status = 'pending';
      status = 'ready';
      const event = 'workspace.started';
      const userContent = 'A user-authored project description';
      const descriptionKey = 'settings.profile.description';
      const messageId = 'message_123';
      const title = t('catalog.title');
    `;

    expect(scanSource(source, 'app/routes/example.tsx').findings).toEqual([]);
  });

  it('finds rendered tuple collections, row props, aliases and copy inside template expressions', () => {
    const source = `
      const tools = [
        ['overview', 'Overview', 'Project summary', 'i-ph:gauge', 'var(--accent)', 'Workspace'],
        ['editor', 'Code', 'Code editor', 'i-ph:code', 'var(--accent)', 'Workspace'],
      ];
      const providers = [{
        provider: 'Neon',
        key: 'DATABASE_URL',
        value: 'postgresql://user:password@host/db',
        note: 'Use this connection for SQL migrations.',
        reason: 'Shown when the database is not connected.',
      }];
      export const View = ({ activity, pinned, dirty, tab }) => <>
        {[
          ['viewer', 'Can inspect files without editing.'],
          ['member', 'Can edit files and collaborate.'],
        ].map(([role, description]) => (
          <span key={role} title={description}><strong>{role}</strong>{description}</span>
        ))}
        <PanelRows
          rows={activity.map((event) => [event.action, event.actor ? \`By \${event.actor}\` : 'System'])}
          empty="No collaboration activity yet."
        />
        <div aria-label={\`\${pinned ? 'Pinned tab: ' : ''}\${tab.label}\${dirty ? ', unsaved changes' : ''}\`} />
      </>;
    `;

    const result = scanSource(source, 'app/routes/example.tsx');
    const findings = result.findings.map((finding) => [finding.rule, finding.text]);
    const texts = result.findings.map((finding) => finding.text);

    expect(findings).toEqual(
      expect.arrayContaining([
        ['visible-tuple-copy', 'Overview'],
        ['visible-tuple-copy', 'Project summary'],
        ['visible-tuple-copy', 'Workspace'],
        ['visible-tuple-copy', 'Code'],
        ['visible-tuple-copy', 'Code editor'],
        ['visible-object-copy', 'Use this connection for SQL migrations.'],
        ['visible-object-copy', 'Shown when the database is not connected.'],
        ['jsx-expression', 'viewer'],
        ['jsx-expression', 'Can inspect files without editing.'],
        ['jsx-expression', 'member'],
        ['jsx-expression', 'Can edit files and collaborate.'],
        ['visible-attribute', 'By {…}'],
        ['visible-attribute', 'System'],
        ['visible-attribute', 'No collaboration activity yet.'],
        ['visible-attribute', 'Pinned tab:'],
        ['visible-attribute', ', unsaved changes'],
      ]),
    );
    expect(texts).not.toEqual(
      expect.arrayContaining([
        'overview',
        'editor',
        'i-ph:gauge',
        'var(--accent)',
        'DATABASE_URL',
        'postgresql://user:password@host/db',
      ]),
    );
  });

  it('flags a raw dotted implementation key when it would be rendered verbatim', () => {
    const result = scanSource('<p>settings.profile.title</p>', 'app/routes/example.tsx');

    expect(result.findings).toMatchObject([{ rule: 'jsx-text', text: 'settings.profile.title' }]);
  });

  it('requires structured, owned and non-expired allowlist entries', () => {
    const valid = {
      schemaVersion: 1,
      entries: [
        {
          id: 'brand',
          path: '**/*',
          rule: '*',
          textPattern: '^E-Code$',
          justification: 'Brand',
          owner: 'i18n',
          expiresOn: '2099-01-01',
        },
      ],
    };

    const finding = scanSource('<h1>E-Code</h1>', 'app/routes/index.tsx').findings[0];

    expect(validateAllowlist(valid, new Date('2026-08-04T00:00:00Z'))).toEqual([]);
    expect(applyAllowlist([finding], valid)).toMatchObject({ accepted: [{ allowlistId: 'brand' }], residual: [] });
    expect(
      validateAllowlist(
        { ...valid, entries: [{ ...valid.entries[0], expiresOn: '2025-01-01' }] },
        new Date('2026-08-04T00:00:00Z'),
      ),
    ).not.toEqual([]);
  });

  it('blocks new/equal-but-changed debt while allowing measured reductions', () => {
    const original = [
      { file: 'app/a.tsx', rule: 'jsx-text', text: 'One' },
      { file: 'app/a.tsx', rule: 'jsx-text', text: 'Two' },
    ];

    const baseline = buildBaseline(original, { generatedAt: '2026-08-04T00:00:00.000Z' });

    expect(compareWithBaseline(original, baseline).violations).toEqual([]);
    expect(compareWithBaseline(original.slice(0, 1), baseline)).toMatchObject({ violations: [], improvements: [{}] });
    expect(
      compareWithBaseline([{ file: 'app/a.tsx', rule: 'jsx-text', text: 'Changed' }, original[1]], baseline).violations,
    ).toMatchObject([{ code: 'finding-set-changed' }]);
    expect(
      compareWithBaseline([...original, { file: 'app/new.tsx', rule: 'jsx-text', text: 'New' }], baseline).violations,
    ).toMatchObject([{ code: 'new-file-debt' }]);
  });
});
