/**
 * Seeds the LIVE curated Gallery (GalleryListing, TPL-02) with the published
 * demo applications from @vibecore/template-catalog. For each app the script
 * follows the exact production publish pipeline — no direct database writes:
 *
 *   1. POST /orgs/:orgId/projects              (source project)
 *   2. POST /projects/:id/files/import/zip     (the application files)
 *   3. POST /projects/:id/snapshots            (the immutable release the Remix pins)
 *   4. POST /admin/gallery-listings            (curated listing → PUBLISHED)
 *
 * Required environment:
 *   SEED_API_URL          e.g. https://api.e-code.ai
 *   SEED_ADMIN_TOKEN      bearer token of a PLATFORM ADMIN session
 *   SEED_ADMIN_PASSWORD   admin password, used once for POST /auth/reauth
 *                         (the curator endpoint requires a recent step-up)
 *   SEED_ORGANIZATION_ID  organization that owns the source projects
 *
 * Optional:
 *   --app=<id|slug>       seed a single application
 *   --dry-run             print the plan without calling the API
 *
 * Idempotence: a listing slug that already exists (409 GALLERY_SLUG_TAKEN) is
 * reported and skipped — existing listings are never mutated or deleted.
 */
import JSZip from 'jszip';
import { listGalleryDemoApps, materializeGalleryDemoApp } from '../packages/template-catalog/src/server.js';

const apiUrl = process.env.SEED_API_URL?.replace(/\/$/, '');
const adminToken = process.env.SEED_ADMIN_TOKEN;
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
const organizationId = process.env.SEED_ORGANIZATION_ID;
const selectedApp = process.argv.find((argument) => argument.startsWith('--app='))?.split('=')[1];
const dryRun = process.argv.includes('--dry-run');

async function call<T>(method: string, route: string, body?: unknown): Promise<T> {
  const response = await fetch(`${apiUrl}${route}`, {
    method,
    headers: {
      authorization: `Bearer ${adminToken}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${method} ${route} → HTTP ${response.status}: ${text.slice(0, 600)}`);
  }

  return (text ? JSON.parse(text) : {}) as T;
}

async function main() {
  const apps = listGalleryDemoApps().filter(
    (app) => !selectedApp || app.id === selectedApp || app.slug === selectedApp,
  );

  if (apps.length === 0) {
    throw new Error(`Unknown Gallery demo app: ${selectedApp}`);
  }

  if (dryRun) {
    for (const app of apps) {
      const snapshot = materializeGalleryDemoApp(app.id)!;
      process.stdout.write(
        `[dry-run] ${app.id} → slug=${app.slug} files=${snapshot.manifest.fileCount} ` +
          `category=${app.category} artifactType=${app.artifactType}\n`,
      );
    }
    return;
  }

  if (!apiUrl || !adminToken || !adminPassword || !organizationId) {
    throw new Error('SEED_API_URL, SEED_ADMIN_TOKEN, SEED_ADMIN_PASSWORD and SEED_ORGANIZATION_ID are required');
  }

  // The curator endpoint enforces a recent admin re-auth; step the session up once.
  await call('POST', '/auth/reauth', { password: adminPassword });

  for (const app of apps) {
    const materialized = materializeGalleryDemoApp(app.id);

    if (!materialized) {
      throw new Error(`Could not materialize ${app.id}`);
    }

    process.stdout.write(`\n[seed] ${app.id} (${materialized.manifest.fileCount} files)\n`);

    const { project } = await call<{ project: { id: string } }>('POST', `/orgs/${organizationId}/projects`, {
      name: app.name,
      description: app.description,
    });
    process.stdout.write(`[seed]   project ${project.id}\n`);

    const zip = new JSZip();
    for (const [filePath, content] of Object.entries(materialized.files)) {
      zip.file(filePath, content);
    }
    const zipBase64 = await zip.generateAsync({ type: 'base64' });
    await call('POST', `/projects/${project.id}/files/import/zip`, { zipBase64, replaceExisting: true });
    process.stdout.write(`[seed]   files imported (${Math.round((zipBase64.length * 3) / 4 / 1024)} KiB zip)\n`);

    const { snapshot } = await call<{ snapshot: { id: string } }>('POST', `/projects/${project.id}/snapshots`, {
      label: `gallery-release-${app.id}-v${materialized.version}`,
    });
    process.stdout.write(`[seed]   snapshot ${snapshot.id}\n`);

    try {
      const { listing } = await call<{ listing: { id: string; slug: string } }>('POST', '/admin/gallery-listings', {
        slug: app.slug,
        title: app.name,
        description: app.description,
        category: app.category,
        tags: [app.artifactType, ...app.technologies.map((item) => item.toLowerCase().replace(/[^a-z0-9+._-]/g, '-'))].slice(0, 12),
        sourceProjectId: project.id,
        sourceSnapshotId: snapshot.id,
        authorName: app.author.displayName,
        featured: app.featured,
        status: 'PUBLISHED',
      });
      process.stdout.write(`[seed]   listing ${listing.id} → /gallery/${listing.slug} PUBLISHED\n`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('GALLERY_SLUG_TAKEN')) {
        process.stdout.write(`[seed]   listing slug "${app.slug}" already exists — skipped (not mutated)\n`);
        continue;
      }

      throw error;
    }
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
