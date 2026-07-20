import { listGalleryDemoApps, materializeGalleryDemoApp } from '@vibecore/template-catalog/server';
import type {
  GalleryAppRecord,
  GalleryAppVersionRecord,
  GalleryArtifactType,
  GalleryPublishedAppResolver,
  ProjectGalleryStore,
} from './project-gallery.js';
import { galleryFacetsFromApps, mergeGalleryFacets, ProjectGalleryError } from './project-gallery.js';
import { prepareGallerySnapshot, type GalleryRuntimeConfiguration } from './project-gallery-validation.js';

type GallerySort = 'FEATURED' | 'MOST_REMIXED' | 'RECENT' | 'NAME';

interface CompositeCursor {
  v: 1;
  dbCursor?: string;
  demoOffset: number;
}

const DEMO_ORGANIZATION_ID = 'gallery-demo-apps';

const artifactTypes: Record<string, GalleryArtifactType> = {
  'business-app': 'BUSINESS_APP',
  'customer-app': 'BOOKING',
  dashboard: 'DASHBOARD',
  'developer-tool': 'INTERNAL_TOOL',
  productivity: 'PRODUCTIVITY',
  'productivity-app': 'PRODUCTIVITY',
  pwa: 'INTERNAL_TOOL',
};

function encodeCursor(cursor: CompositeCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value?: string): CompositeCursor {
  if (!value) {
    return { v: 1, demoOffset: 0 };
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<CompositeCursor>;

    if (
      parsed.v !== 1 ||
      !Number.isSafeInteger(parsed.demoOffset) ||
      (parsed.demoOffset ?? -1) < 0 ||
      (parsed.dbCursor !== undefined && (typeof parsed.dbCursor !== 'string' || parsed.dbCursor.length > 128))
    ) {
      throw new Error('invalid cursor');
    }

    return { v: 1, demoOffset: parsed.demoOffset!, ...(parsed.dbCursor ? { dbCursor: parsed.dbCursor } : {}) };
  } catch {
    throw new ProjectGalleryError('Gallery cursor is invalid', 400, 'GALLERY_CURSOR_INVALID');
  }
}

function runtimeForDemo(appId: string): GalleryRuntimeConfiguration {
  const snapshot = materializeGalleryDemoApp(appId);

  if (!snapshot) {
    throw new ProjectGalleryError('Gallery demo snapshot is unavailable', 500, 'GALLERY_DEMO_SNAPSHOT_MISSING');
  }

  const packageJson = snapshot.files['package.json'];
  let scripts: Record<string, string> = {};

  if (packageJson) {
    try {
      scripts = (JSON.parse(packageJson) as { scripts?: Record<string, string> }).scripts ?? {};
    } catch {
      throw new ProjectGalleryError('Gallery demo package.json is invalid', 500, 'GALLERY_DEMO_RUNTIME_INVALID');
    }
  }

  return {
    packageManager: 'npm',
    installCommand: snapshot.manifest.installCommand ?? 'npm install',
    devCommand: snapshot.manifest.runCommand ?? scripts.dev ?? 'npm run dev',
    ...(scripts.build ? { buildCommand: 'npm run build' } : {}),
    ...(scripts.start ? { startCommand: 'npm run start' } : {}),
    previewPort: snapshot.manifest.previewPort ?? 5173,
    requiredSecretNames: [],
  };
}

function demoRecord(appId: string): { app: GalleryAppRecord; version: GalleryAppVersionRecord } | undefined {
  const definition = listGalleryDemoApps().find(
    (candidate) => candidate.id === appId || candidate.slug === appId || `demo:${candidate.id}` === appId,
  );

  if (!definition) {
    return undefined;
  }

  const materialized = materializeGalleryDemoApp(definition.id);

  if (!materialized) {
    throw new ProjectGalleryError('Gallery demo snapshot is unavailable', 500, 'GALLERY_DEMO_SNAPSHOT_MISSING');
  }

  const prepared = prepareGallerySnapshot({
    files: Object.entries(materialized.files).map(([path, content]) => ({ path, content })),
    runtime: runtimeForDemo(definition.id),
    dataRequirements: [],
  });
  const id = `demo:${definition.id}`;
  const versionId = `${id}:v1`;
  const app: GalleryAppRecord = {
    id,
    slug: definition.slug,
    organizationId: DEMO_ORGANIZATION_ID,
    authorUserId: definition.author.id,
    author: {
      handle: definition.author.handle,
      displayName: definition.author.displayName,
    },
    name: definition.name,
    description: definition.description,
    artifactType: artifactTypes[definition.artifactType] ?? 'OTHER',
    category: definition.category,
    technologies: [...definition.technologies],
    tags: [definition.artifactType, definition.category, ...definition.technologies.map((item) => item.toLowerCase())],
    thumbnailUrl: definition.thumbnailUrl,
    visibility: 'PUBLIC',
    status: 'PUBLISHED',
    moderationStatus: 'APPROVED',
    allowRemix: definition.remixAllowed,
    featured: definition.featured,
    remixCount: definition.remixCount,
    reportCount: 0,
    previewStatus: 'VERIFIED',
    previewUrl: definition.previewUrl,
    latestVersionId: versionId,
    publishedAt: definition.publishedAt,
    createdAt: definition.publishedAt,
    updatedAt: definition.publishedAt,
  };
  const version: GalleryAppVersionRecord = {
    id: versionId,
    galleryAppId: id,
    version: 1,
    files: prepared.files,
    runtime: prepared.runtime,
    dataRequirements: prepared.dataRequirements,
    contentHash: prepared.contentHash,
    byteLength: prepared.byteLength,
    removedPaths: prepared.removedPaths,
    redactedValueCount: prepared.redactedValueCount,
    validationChecks: prepared.validationChecks,
    createdByUserId: definition.author.id,
    createdAt: definition.publishedAt,
  };

  return { app, version };
}

function compareApps(left: GalleryAppRecord, right: GalleryAppRecord, sort: GallerySort): number {
  if (sort === 'NAME') {
    return left.name.localeCompare(right.name, 'en') || left.id.localeCompare(right.id);
  }

  if (sort === 'FEATURED') {
    const featured = Number(right.featured) - Number(left.featured);
    if (featured) return featured;
  }

  if (sort !== 'RECENT') {
    const remixes = right.remixCount - left.remixCount;
    if (remixes) return remixes;
  }

  const published = Date.parse(right.publishedAt ?? right.createdAt) - Date.parse(left.publishedAt ?? left.createdAt);
  return published || right.id.localeCompare(left.id);
}

function filteredDemos(input: Parameters<GalleryPublishedAppResolver['listPublishedApps']>[0]): GalleryAppRecord[] {
  const query = input.query?.trim().toLowerCase();
  const category = input.category?.trim().toLowerCase();
  const technology = input.technology?.trim().toLowerCase();

  return listGalleryDemoApps()
    .map((definition) => demoRecord(definition.id)!.app)
    .filter((app) => {
      if (input.featured !== undefined && app.featured !== input.featured) return false;
      if (input.artifactType && app.artifactType !== input.artifactType) return false;
      if (category && app.category.toLowerCase() !== category) return false;
      if (technology && !app.technologies.some((item) => item.toLowerCase() === technology)) return false;
      if (!query) return true;

      return [app.name, app.description, app.author.displayName, app.author.handle, app.category, ...app.technologies]
        .join(' ')
        .toLowerCase()
        .includes(query);
    })
    .sort((left, right) => compareApps(left, right, input.sort));
}

function globalDemoFacets() {
  return galleryFacetsFromApps(
    listGalleryDemoApps().map((definition) => ({
      artifactType: artifactTypes[definition.artifactType] ?? 'OTHER',
      category: definition.category,
      technologies: [...definition.technologies],
    })),
  );
}

async function currentDemoEngagement(store: ProjectGalleryStore, demos: GalleryAppRecord[]) {
  if (demos.length === 0) return demos;
  const counts = new Map(
    (await store.getGalleryEngagementCounts(demos.map((app) => app.id))).map((entry) => [entry.galleryAppId, entry]),
  );

  return demos.map((app) => {
    const current = counts.get(app.id);
    return current
      ? {
          ...app,
          remixCount: app.remixCount + current.completedRemixCount,
          reportCount: current.reportCount,
        }
      : app;
  });
}

/**
 * Merges immutable code-owned demo applications with persisted community
 * publications without losing rows across cursor boundaries. Store item cursors
 * let the composite cursor remember exactly how many rows of each stream were
 * consumed.
 */
export function createGalleryPublishedAppResolver(store: ProjectGalleryStore): GalleryPublishedAppResolver {
  return {
    async listPublishedApps(input) {
      const cursor = decodeCursor(input.cursor);
      const [demos, dbPage, persistedFacets] = await Promise.all([
        currentDemoEngagement(store, filteredDemos(input)),
        store.listPublishedGalleryApps({
          ...input,
          cursor: cursor.dbCursor,
          limit: input.limit + 1,
        }),
        store.listPublishedGalleryFacets(),
      ]);
      const dbItemCursors = dbPage.itemCursors ?? dbPage.apps.map((app) => app.id);
      const apps: GalleryAppRecord[] = [];
      let demoIndex = cursor.demoOffset;
      let dbIndex = 0;
      let dbCursor = cursor.dbCursor;

      while (apps.length < input.limit && (demoIndex < demos.length || dbIndex < dbPage.apps.length)) {
        const demo = demos[demoIndex];
        const persisted = dbPage.apps[dbIndex];

        if (demo && (!persisted || compareApps(demo, persisted, input.sort) <= 0)) {
          apps.push(demo);
          demoIndex += 1;
        } else if (persisted) {
          apps.push(persisted);
          dbCursor = dbItemCursors[dbIndex] ?? persisted.id;
          dbIndex += 1;
        }
      }

      const hasMore = demoIndex < demos.length || dbIndex < dbPage.apps.length || Boolean(dbPage.nextCursor);

      return {
        apps,
        facets: mergeGalleryFacets(globalDemoFacets(), persistedFacets),
        ...(hasMore ? { nextCursor: encodeCursor({ v: 1, dbCursor, demoOffset: demoIndex }) } : {}),
      };
    },

    async resolvePublishedApp(input) {
      const demoKey = input.appId ?? input.slug;
      const demo = demoKey ? demoRecord(demoKey) : undefined;
      if (demo) {
        const [app] = await currentDemoEngagement(store, [demo.app]);
        return { app: app!, version: demo.version };
      }

      const app = input.appId
        ? await store.getGalleryApp(input.appId)
        : input.slug
          ? await store.getGalleryAppBySlug(input.slug)
          : undefined;

      if (!app) return undefined;
      const version = await store.getGalleryAppVersion(app.latestVersionId);
      return version?.galleryAppId === app.id ? { app, version } : undefined;
    },
  };
}

export const galleryDemoRecords = () => listGalleryDemoApps().map((definition) => demoRecord(definition.id)!);
