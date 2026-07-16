import { describe, expect, it } from 'vitest';
import {
  GALLERY_DEMO_APP_SUMMARIES,
  getGalleryDemoAppSummary,
  listGalleryDemoAppSummaries,
} from './index.js';
import {
  GALLERY_DEMO_APP_CATALOG,
  getGalleryDemoApp,
  materializeGalleryDemoApp,
} from './server.js';

const REQUIRED_IDS = [
  'react-saas',
  'next-dashboard',
  'fastify-api',
  'ai-agent',
  'landing-page',
  'mobile-starter',
] as const;

describe('published Gallery demo applications', () => {
  it('exposes exactly the six historical starters as application—not framework—cards', () => {
    expect(listGalleryDemoAppSummaries()).toBe(GALLERY_DEMO_APP_SUMMARIES);
    expect(GALLERY_DEMO_APP_SUMMARIES.map((item) => item.id)).toEqual(REQUIRED_IDS);
    expect(new Set(GALLERY_DEMO_APP_SUMMARIES.map((item) => item.key)).size).toBe(REQUIRED_IDS.length);
    expect(new Set(GALLERY_DEMO_APP_SUMMARIES.map((item) => item.slug)).size).toBe(REQUIRED_IDS.length);

    for (const item of GALLERY_DEMO_APP_SUMMARIES) {
      expect(item.name).not.toMatch(/starter|react \+|next\.js$|fastify api$/i);
      expect(item.description.length).toBeGreaterThan(50);
      expect(item.author).toEqual({ id: 'ecode-studio', displayName: 'E-Code Studio', handle: 'ecode', verified: true });
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

  it('keeps executable files out of the client-safe entrypoint', () => {
    expect('files' in GALLERY_DEMO_APP_SUMMARIES[0]).toBe(false);
    expect('runCommand' in GALLERY_DEMO_APP_SUMMARIES[0]).toBe(false);
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
      expect(JSON.parse(snapshot?.files['package.json'] ?? '{}')).toMatchObject({ scripts: { dev: expect.any(String) } });

      const source = Object.values(snapshot?.files ?? {}).join('\n').replaceAll('\\"', '"');
      expect(source).toContain(`data-gallery-app-id="${id}"`);
      expect(source.toLowerCase()).not.toMatch(/python|golang|\brust\b/);
      expect(source).not.toMatch(/TODO|placeholder code/i);

      hashes.add(snapshot!.contentHash);
      expect(Object.isFrozen(snapshot)).toBe(true);
      expect(Object.isFrozen(snapshot?.files)).toBe(true);
      expect(Object.isFrozen(snapshot?.manifest)).toBe(true);
    }

    expect(hashes.size).toBe(REQUIRED_IDS.length);
  });

  it('ships a usable index/preview surface and an interaction for each application', () => {
    for (const id of REQUIRED_IDS) {
      const snapshot = materializeGalleryDemoApp(id)!;
      const paths = Object.keys(snapshot.files);
      expect(paths.some((path) => path === 'index.html' || path === 'app/page.tsx' || path === 'src/server.ts')).toBe(true);
      const source = Object.values(snapshot.files).join('\n');
      expect(source).toMatch(/onClick|onChange|onSubmit|addEventListener/);
    }

    expect(materializeGalleryDemoApp('fastify-api')?.files['src/server.ts']).toContain("app.get('/api/health'");
    expect(materializeGalleryDemoApp('landing-page')?.files['main.js']).toContain("form.addEventListener('submit'");
    expect(materializeGalleryDemoApp('mobile-starter')?.files['public/manifest.webmanifest']).toContain('standalone');
    expect(materializeGalleryDemoApp('mobile-starter')?.files['public/sw.js']).toContain("self.addEventListener('fetch'");
  });

  it('looks up app id, stable key and public slug while rejecting unknown values', () => {
    expect(getGalleryDemoAppSummary('react-saas')?.name).toBe('Orbit CRM');
    expect(getGalleryDemoApp(' DEMO-NEXT-OPERATIONS-DASHBOARD ')?.id).toBe('next-dashboard');
    expect(getGalleryDemoApp('pulse-api-monitor')?.id).toBe('fastify-api');
    expect(getGalleryDemoApp('unknown-app')).toBeUndefined();
    expect(materializeGalleryDemoApp('unknown-app')).toBeUndefined();
  });
});
