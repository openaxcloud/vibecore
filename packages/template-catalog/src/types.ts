/**
 * This package intentionally keeps its historical workspace/package name while
 * exposing application-gallery concepts. These are published demo applications,
 * not framework or language starter templates.
 */
export const GALLERY_DEMO_APP_ARTIFACT_TYPES = [
  'business-app',
  'dashboard',
  'developer-tool',
  'productivity-app',
  'customer-app',
  'pwa',
  'mobile-app',
  'data-viz',
  'slide-deck',
  'animation',
  'three-d',
  'crm',
  'ecommerce',
  'game',
] as const;

export type GalleryDemoAppArtifactType = (typeof GALLERY_DEMO_APP_ARTIFACT_TYPES)[number];

export const GALLERY_DEMO_APP_CATEGORIES = [
  'sales',
  'operations',
  'developer-tools',
  'productivity',
  'booking',
  'field-service',
  'compliance',
  'analytics',
  'reporting',
  'incident-response',
  'logistics',
  'commerce',
  'gaming',
] as const;

export type GalleryDemoAppCategory = (typeof GALLERY_DEMO_APP_CATEGORIES)[number];

export const GALLERY_DEMO_APP_MODERATION_STATUSES = ['approved'] as const;
export type GalleryDemoAppModerationStatus = (typeof GALLERY_DEMO_APP_MODERATION_STATUSES)[number];

export const GALLERY_DEMO_APP_RUNTIMES = ['node', 'static'] as const;
export type GalleryDemoAppRuntime = (typeof GALLERY_DEMO_APP_RUNTIMES)[number];

export type GalleryDemoAppLanguage = 'typescript' | 'javascript';

export interface GalleryDemoAppAuthor {
  readonly id: string;
  readonly displayName: string;
  readonly handle: string;
  readonly verified: boolean;
}

export interface GalleryDemoAppSummary {
  readonly id: string;
  readonly key: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly author: GalleryDemoAppAuthor;
  readonly artifactType: GalleryDemoAppArtifactType;
  readonly category: GalleryDemoAppCategory;
  readonly technologies: readonly string[];
  readonly publishedAt: string;
  readonly remixCount: number;
  readonly featured: boolean;
  readonly remixAllowed: boolean;
  readonly moderationStatus: GalleryDemoAppModerationStatus;
  readonly thumbnailUrl: string;
  readonly previewUrl: string;
}

export interface GalleryDemoAppFile {
  readonly path: string;
  readonly content: string;
}

export interface GalleryDemoAppDefinition extends GalleryDemoAppSummary {
  readonly language: GalleryDemoAppLanguage;
  readonly runtime: GalleryDemoAppRuntime;
  readonly files: readonly GalleryDemoAppFile[];
  readonly installCommand?: string;
  readonly runCommand?: string;
  readonly previewPort?: number;
  /** Secrets the remixed project needs before optional integrations activate (never bundled). */
  readonly requiredSecretNames?: readonly string[];
}

export interface GalleryDemoAppSnapshot {
  readonly app: GalleryDemoAppSummary;
  readonly version: 1;
  readonly manifest: {
    readonly runtime: GalleryDemoAppRuntime;
    readonly language: GalleryDemoAppLanguage;
    readonly technologies: readonly string[];
    readonly installCommand?: string;
    readonly runCommand?: string;
    readonly previewPort?: number;
    readonly requiredSecretNames?: readonly string[];
    readonly fileCount: number;
  };
  readonly files: Readonly<Record<string, string>>;
  readonly contentHash: string;
}
