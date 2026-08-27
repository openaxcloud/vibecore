import { describe, expect, it } from 'vitest';
import { GALLERY_DEMO_APP_SUMMARIES, getGalleryDemoAppSummary, listGalleryDemoAppSummaries } from './index.js';
import { GALLERY_DEMO_APP_CATALOG, getGalleryDemoApp, materializeGalleryDemoApp } from './server.js';

const NEW_APP_IDS = [
  'vendor-risk-review',
  'field-service-inspector',
  'revenue-cohort-explorer',
  'qbr-generator',
  'incident-postmortem-explainer',
  'warehouse-layout-planner',
  'pipeline-crm',
  'storefront',
] as const;

const GAME_APP_IDS = ['neon-trivia-arena'] as const;
const SUPPORT_APP_IDS = ['docs-copilot'] as const;

const HISTORICAL_IDS = [
  'react-saas',
  'next-dashboard',
  'fastify-api',
  'ai-agent',
  'landing-page',
  'mobile-starter',
] as const;

const REQUIRED_IDS = [...SUPPORT_APP_IDS, ...GAME_APP_IDS, ...NEW_APP_IDS, ...HISTORICAL_IDS] as const;

describe('published Gallery demo applications', () => {
  it('exposes application—not framework—cards for every published demo app', () => {
    expect(listGalleryDemoAppSummaries()).toBe(GALLERY_DEMO_APP_SUMMARIES);
    expect(GALLERY_DEMO_APP_SUMMARIES.map((item) => item.id)).toEqual(REQUIRED_IDS);
    expect(new Set(GALLERY_DEMO_APP_SUMMARIES.map((item) => item.key)).size).toBe(REQUIRED_IDS.length);
    expect(new Set(GALLERY_DEMO_APP_SUMMARIES.map((item) => item.slug)).size).toBe(REQUIRED_IDS.length);

    for (const item of GALLERY_DEMO_APP_SUMMARIES) {
      expect(item.name).not.toMatch(/starter|react \+|next\.js$|fastify api$/i);
      expect(item.description.length).toBeGreaterThan(50);
      expect(item.author).toEqual({
        id: 'ecode-studio',
        displayName: 'E-Code Studio',
        handle: 'ecode',
        verified: true,
      });
      expect(item.technologies.length).toBeGreaterThan(1);
      expect(item.publishedAt).toMatch(/^2026-/);
      expect(item.remixCount).toBeGreaterThan(0);
      expect(item.remixAllowed).toBe(true);
      expect(item.moderationStatus).toBe('approved');
      expect(item.thumbnailUrl).toBe(`/gallery-apps/${item.id}/thumbnail.png`);
      expect(item.previewUrl).toBe(`/gallery-apps/${item.id}/preview/`);
      expect(JSON.stringify(item).toLowerCase()).not.toMatch(/python|golang|\brust\b/);
    }
  });

  it('gives each of the eight real applications its own artifact-type chip', () => {
    const chips = NEW_APP_IDS.map((id) => getGalleryDemoAppSummary(id)!.artifactType);

    expect(chips).toEqual([
      'business-app',
      'mobile-app',
      'data-viz',
      'slide-deck',
      'animation',
      'three-d',
      'crm',
      'ecommerce',
    ]);
    expect(new Set(chips).size).toBe(NEW_APP_IDS.length);
  });

  it('keeps executable files out of the client-safe entrypoint', () => {
    expect('files' in GALLERY_DEMO_APP_SUMMARIES[0]).toBe(false);
    expect('runCommand' in GALLERY_DEMO_APP_SUMMARIES[0]).toBe(false);
  });

  it('serves professional French metadata while preserving technical identity', () => {
    const english = getGalleryDemoAppSummary('vendor-risk-review', 'en-US');
    const french = getGalleryDemoAppSummary('vendor-risk-review', 'fr-FR');
    const frenchDescriptions = listGalleryDemoAppSummaries('fr').map((item) => item.description);

    expect(english?.description).toContain('Every new vendor');
    expect(french?.description).toContain('Chaque nouveau fournisseur');
    expect(french).toMatchObject({
      id: english?.id,
      key: english?.key,
      slug: english?.slug,
      name: english?.name,
      technologies: english?.technologies,
    });
    expect(listGalleryDemoAppSummaries('fr')).toHaveLength(GALLERY_DEMO_APP_SUMMARIES.length);
    expect(frenchDescriptions.join(' ')).not.toMatch(
      /\b(?:backend|back-office|checklist|endpoints?|preview|logs?|marketplace|snapshots?|packages?|builds?|workspace|runtime|stack|starter|typecheck|full-stack|tokens?|tags?|tenants?)\b|feature flag/iu,
    );
  });

  it('falls back to English for unsupported or missing locales', () => {
    expect(getGalleryDemoAppSummary('react-saas', 'de-DE')?.description).toBe(
      getGalleryDemoAppSummary('react-saas', 'en')?.description,
    );
  });

  it('materializes every app into a distinct, immutable JS/TS snapshot', () => {
    expect(GALLERY_DEMO_APP_CATALOG).toHaveLength(REQUIRED_IDS.length);
    const hashes = new Set<string>();

    for (const id of REQUIRED_IDS) {
      const definition = getGalleryDemoApp(id);
      const snapshot = materializeGalleryDemoApp(id);

      expect(definition?.files.length).toBeGreaterThanOrEqual(3);
      expect(definition?.language === 'javascript' || definition?.language === 'typescript').toBe(true);
      expect(definition?.runtime).toBe('node');
      expect(definition?.installCommand).toBe('npm install');
      expect(definition?.runCommand).toBe('npm run dev');
      expect(snapshot?.manifest.fileCount).toBe(definition?.files.length);
      expect(snapshot?.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(snapshot?.app.id).toBe(id);
      expect(snapshot?.files['package.json']).toBeTruthy();
      expect(JSON.parse(snapshot?.files['package.json'] ?? '{}')).toMatchObject({
        scripts: { dev: expect.any(String) },
      });

      const source = Object.values(snapshot?.files ?? {})
        .join('\n')
        .replaceAll('\\"', '"');
      expect(source).toContain(`data-gallery-app-id="${id}"`);
      expect(source.toLowerCase()).not.toMatch(/python|golang|\brust\b/);
      expect(source).not.toMatch(/TODO/);

      hashes.add(snapshot!.contentHash);
      expect(Object.isFrozen(snapshot)).toBe(true);
      expect(Object.isFrozen(snapshot?.files)).toBe(true);
      expect(Object.isFrozen(snapshot?.manifest)).toBe(true);
    }

    expect(hashes.size).toBe(REQUIRED_IDS.length);
  });

  it('never embeds anything that looks like a live or test API key', () => {
    for (const id of REQUIRED_IDS) {
      const snapshot = materializeGalleryDemoApp(id)!;
      const source = Object.values(snapshot.files).join('\n');

      expect(source).not.toMatch(/sk_(?:test|live)_[A-Za-z0-9]{8,}/);
      expect(source).not.toMatch(/pk_(?:test|live)_[A-Za-z0-9]{8,}/);
      expect(source).not.toMatch(/AKIA[0-9A-Z]{16}/);
      expect(source).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
    }
  });

  it('declares required secrets only where an optional integration needs them', () => {
    for (const id of REQUIRED_IDS) {
      const manifest = materializeGalleryDemoApp(id)!.manifest;

      if (id === 'storefront') {
        expect(manifest.requiredSecretNames).toEqual(['STRIPE_SECRET_KEY']);
      } else {
        expect(manifest.requiredSecretNames).toEqual([]);
      }
    }
  });

  it('ships a usable index/preview surface and an interaction for each application', () => {
    for (const id of REQUIRED_IDS) {
      const snapshot = materializeGalleryDemoApp(id)!;
      const paths = Object.keys(snapshot.files);
      expect(
        paths.some(
          (path) =>
            path === 'index.html' ||
            path === 'app/page.tsx' ||
            path === 'src/server.ts' ||
            path === 'server/main.ts' ||
            path === 'App.tsx',
        ),
      ).toBe(true);
      const source = Object.values(snapshot.files).join('\n');
      expect(source).toMatch(/onClick|onChange|onSubmit|onPress|addEventListener/);

      if (([...SUPPORT_APP_IDS, ...GAME_APP_IDS, ...NEW_APP_IDS] as readonly string[]).includes(id)) {
        expect(paths.some((path) => /(^|\/)README\.md$/.test(path))).toBe(true);
      }
    }

    expect(materializeGalleryDemoApp('fastify-api')?.files['src/server.ts']).toContain("app.get('/api/health'");
    expect(materializeGalleryDemoApp('landing-page')?.files['main.js']).toContain("form.addEventListener('submit'");
    expect(materializeGalleryDemoApp('mobile-starter')?.files['public/manifest.webmanifest']).toContain('standalone');
    expect(materializeGalleryDemoApp('mobile-starter')?.files['public/sw.js']).toContain(
      "self.addEventListener('fetch'",
    );
  });

  it('ships Neon Trivia Arena as a strict, playable Game Builder application', () => {
    const definition = getGalleryDemoApp('neon-trivia-arena');
    const snapshot = materializeGalleryDemoApp('demo-neon-trivia-arena');
    const packageJson = JSON.parse(snapshot?.files['package.json'] ?? '{}') as {
      scripts?: Record<string, string>;
    };

    expect(definition).toMatchObject({
      artifactType: 'game',
      category: 'gaming',
      language: 'typescript',
      runtime: 'node',
      previewUrl: '/gallery-apps/neon-trivia-arena/preview/',
      thumbnailUrl: '/gallery-apps/neon-trivia-arena/thumbnail.png',
    });
    expect(packageJson.scripts).toMatchObject({
      build: 'tsc -b && vite build',
      typecheck: 'tsc --noEmit',
    });
    expect(snapshot?.files['tsconfig.json']).toContain('"strict": true');
    expect(snapshot?.files['src/game.ts']).toContain('scoreAnswer');
    expect(snapshot?.files['src/App.tsx']).toContain('useLifeline');
    expect(snapshot?.files['src/App.tsx']).toContain('localStorage');
    expect(snapshot?.files['src/App.tsx']).toContain('data-gallery-app-id="neon-trivia-arena"');
  });

  it('ships Docs Copilot as a strict, grounded Chatbot Builder application', () => {
    const definition = getGalleryDemoApp('docs-copilot');
    const snapshot = materializeGalleryDemoApp('demo-docs-copilot');
    const packageJson = JSON.parse(snapshot?.files['package.json'] ?? '{}') as {
      scripts?: Record<string, string>;
    };

    expect(definition).toMatchObject({
      artifactType: 'productivity-app',
      category: 'productivity',
      language: 'typescript',
      runtime: 'node',
      previewUrl: '/gallery-apps/docs-copilot/preview/',
      thumbnailUrl: '/gallery-apps/docs-copilot/thumbnail.png',
    });
    expect(packageJson.scripts).toMatchObject({
      build: 'tsc -b && vite build',
      typecheck: 'tsc --noEmit',
      test: 'vitest run',
    });
    expect(snapshot?.files['tsconfig.json']).toContain('"strict": true');
    expect(snapshot?.files['src/lib/answer-engine.ts']).toContain('rankArticles');
    expect(snapshot?.files['src/lib/answer-engine.ts']).toContain('without guessing');
    expect(snapshot?.files['src/App.tsx']).toContain('data-gallery-app-id="docs-copilot"');
  });

  it('keeps the mobile chip on a real Expo + Metro application and the animation chip off Remotion', () => {
    const snapshot = materializeGalleryDemoApp('field-service-inspector')!;
    const packageJson = JSON.parse(snapshot.files['package.json']!) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.expo).toBeTruthy();
    expect(packageJson.dependencies?.['react-native']).toBeTruthy();
    expect(packageJson.scripts?.dev).toContain('expo start');

    const allDependencies = GALLERY_DEMO_APP_CATALOG.flatMap((definition) => {
      const parsed = JSON.parse(definition.files.find((file) => file.path === 'package.json')?.content ?? '{}') as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      return [...Object.keys(parsed.dependencies ?? {}), ...Object.keys(parsed.devDependencies ?? {})];
    });
    expect(allDependencies.some((name) => name.includes('remotion'))).toBe(false);
  });

  it('looks up app id, stable key and public slug while rejecting unknown values', () => {
    expect(getGalleryDemoAppSummary('react-saas')?.name).toBe('Orbit CRM');
    expect(getGalleryDemoAppSummary('vendor-risk-review')?.name).toBe('Vendor Risk Review');
    expect(getGalleryDemoApp(' DEMO-NEXT-OPERATIONS-DASHBOARD ')?.id).toBe('next-dashboard');
    expect(getGalleryDemoApp('demo-storefront')?.id).toBe('storefront');
    expect(getGalleryDemoApp('pulse-api-monitor')?.id).toBe('fastify-api');
    expect(getGalleryDemoApp('unknown-app')).toBeUndefined();
    expect(materializeGalleryDemoApp('unknown-app')).toBeUndefined();
  });
});
