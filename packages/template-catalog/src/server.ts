import { createHash } from 'node:crypto';
import { GALLERY_DEMO_APP_SUMMARIES, getGalleryDemoAppSummary } from './metadata.js';
import { GALLERY_DEMO_APP_FILES } from './scaffolds.js';
import type { GalleryDemoAppDefinition, GalleryDemoAppFile, GalleryDemoAppSnapshot } from './types.js';

function filesFor(id: string): readonly GalleryDemoAppFile[] {
  return GALLERY_DEMO_APP_FILES[id as keyof typeof GALLERY_DEMO_APP_FILES] ?? [];
}

/**
 * Optional integrations activate only once the remixed project defines these
 * secrets (Secrets pane). The applications degrade gracefully without them;
 * no key of any kind ships inside a snapshot.
 */
const REQUIRED_SECRET_NAMES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  storefront: Object.freeze(['STRIPE_SECRET_KEY']),
});

function definitionFor(id: string): GalleryDemoAppDefinition | undefined {
  const summary = getGalleryDemoAppSummary(id);
  if (!summary) return undefined;
  const files = filesFor(summary.id);
  if (files.length === 0) throw new Error(`Gallery demo application has no snapshot: ${summary.id}`);
  const packageJson = files.find((item) => item.path === 'package.json');
  const parsed = packageJson
    ? (JSON.parse(packageJson.content) as { scripts?: Readonly<Record<string, string>> })
    : undefined;
  const language = summary.technologies.includes('JavaScript') ? 'javascript' : 'typescript';

  return Object.freeze({
    ...summary,
    language,
    runtime: packageJson ? 'node' : 'static',
    files,
    installCommand: packageJson ? 'npm install' : undefined,
    runCommand: parsed?.scripts?.dev ? 'npm run dev' : undefined,
    previewPort: packageJson ? (summary.id === 'next-dashboard' ? 3000 : 5173) : undefined,
    requiredSecretNames: REQUIRED_SECRET_NAMES[summary.id] ?? Object.freeze([]),
  });
}

/** Server-only catalog. Files never cross the client-safe package entrypoint. */
export const GALLERY_DEMO_APP_CATALOG = Object.freeze(
  GALLERY_DEMO_APP_SUMMARIES.map((summary) => {
    const definition = definitionFor(summary.id);
    if (!definition) throw new Error(`Gallery metadata has no definition: ${summary.id}`);
    return definition;
  }),
);

const definitionsByKey = new Map<string, GalleryDemoAppDefinition>();
for (const definition of GALLERY_DEMO_APP_CATALOG) {
  definitionsByKey.set(definition.id, definition);
  definitionsByKey.set(definition.key, definition);
  definitionsByKey.set(definition.slug, definition);
}

export function listGalleryDemoApps(): readonly GalleryDemoAppDefinition[] {
  return GALLERY_DEMO_APP_CATALOG;
}

export function getGalleryDemoApp(idKeyOrSlug: string): GalleryDemoAppDefinition | undefined {
  return definitionsByKey.get(idKeyOrSlug.trim().toLowerCase());
}

export function materializeGalleryDemoApp(idKeyOrSlug: string): GalleryDemoAppSnapshot | undefined {
  const definition = getGalleryDemoApp(idKeyOrSlug);
  if (!definition) return undefined;
  const entries = [...definition.files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((item) => [item.path, item.content] as const);
  const files = Object.freeze(Object.fromEntries(entries));
  const canonical = JSON.stringify({ galleryAppId: definition.id, version: 1, files: entries });
  return Object.freeze({
    app: getGalleryDemoAppSummary(definition.id)!,
    version: 1 as const,
    manifest: Object.freeze({
      runtime: definition.runtime,
      language: definition.language,
      technologies: definition.technologies,
      installCommand: definition.installCommand,
      runCommand: definition.runCommand,
      previewPort: definition.previewPort,
      requiredSecretNames: definition.requiredSecretNames,
      fileCount: entries.length,
    }),
    files,
    contentHash: createHash('sha256').update(canonical).digest('hex'),
  });
}

export type { GalleryDemoAppDefinition, GalleryDemoAppFile, GalleryDemoAppSnapshot } from './types.js';
