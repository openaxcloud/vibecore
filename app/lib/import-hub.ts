/**
 * Frontend registry for the Import hub (TPL-02.3 — Replit-parity "Create app →
 * Import" surface). Mirrors the backend `IMPORT_HUB_PROVIDERS` /
 * `IMPORT_PROVIDERS_EXECUTED` contract in `services/api/src/import-pipeline.ts`
 * so the hub can present ALL twelve documented sources with an HONEST status per
 * provider — never a fake "coming soon" for something that already works, and
 * never a fake success for a source that still needs a user credential.
 *
 * The twelve sources (order = hub tile order): GitHub, Bitbucket, ZIP archive,
 * Spreadsheet, Bolt, Lovable, Base44, Previous Agent export, Empty project,
 * Vercel, Figma, Claude. `screenshot` is intentionally NOT a provider (design
 * decision — kept out of the hub, see IMPORT_PROVIDER_REGISTRY.yaml).
 */
import {
  Boxes,
  FileArchive,
  FilePlus2,
  Figma,
  Github,
  GitBranch,
  Heart,
  PackageOpen,
  Sparkles,
  Table2,
  Triangle,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { getImportHubCopy, type ImportHubKey } from '~/lib/i18n/catalogs/import-hub';

export type ImportHubProviderId =
  | 'github'
  | 'bitbucket'
  | 'zip'
  | 'spreadsheet'
  | 'bolt'
  | 'lovable'
  | 'base44'
  | 'previous-agent-export'
  | 'empty'
  | 'vercel'
  | 'figma'
  | 'claude';

/**
 * `ready`       — the flow works end-to-end today (real import → project → IDE).
 * `credential`  — needs a user-supplied token/source; the tile explains the
 *                 connect step and the server returns an honest 424 until it is
 *                 provided (no fake success). External-API providers only.
 */
export type ImportHubStatus = 'ready' | 'credential';

export type ImportHubCategory = 'git' | 'export' | 'data' | 'design' | 'ai' | 'blank';

export interface ImportHubProvider {
  id: ImportHubProviderId;
  label: string;

  /** One-line, plain, honest description of what this source imports. */
  description: string;
  icon: LucideIcon;
  category: ImportHubCategory;
  status: ImportHubStatus;

  /** In-app destination for the tile's primary action. */
  to: string;

  /** Short badge text describing the honest status. */
  badge?: string;
}

function categoryCopyKey(category: ImportHubCategory): ImportHubKey {
  return `importHub.category.${category}` as ImportHubKey;
}

export function getImportHubCategoryLabels(language?: string | null): Record<ImportHubCategory, string> {
  const copy = getImportHubCopy(language);

  return {
    git: copy[categoryCopyKey('git')],
    export: copy[categoryCopyKey('export')],
    data: copy[categoryCopyKey('data')],
    design: copy[categoryCopyKey('design')],
    ai: copy[categoryCopyKey('ai')],
    blank: copy[categoryCopyKey('blank')],
  };
}

export const IMPORT_HUB_CATEGORY_LABELS: Record<ImportHubCategory, string> = getImportHubCategoryLabels('en');

/**
 * The canonical hub registry. Kept in the documented order. Every entry routes
 * to a REAL destination; `credential` entries route to a page that explains the
 * exact token needed and never pretends the import happened.
 */
type ImportHubProviderDefinition = readonly [
  id: ImportHubProviderId,
  icon: LucideIcon,
  category: ImportHubCategory,
  status: ImportHubStatus,
  to: string,
];

const IMPORT_HUB_PROVIDER_DEFINITIONS: readonly ImportHubProviderDefinition[] = [
  ['github', Github, 'git', 'ready', '/import-github'],
  ['bitbucket', GitBranch, 'git', 'ready', '/import-github?source=bitbucket'],
  ['zip', FileArchive, 'export', 'ready', '/import-zip'],
  ['spreadsheet', Table2, 'data', 'ready', '/import/spreadsheet'],
  ['bolt', Zap, 'export', 'ready', '/import-zip?source=bolt'],
  ['lovable', Heart, 'export', 'ready', '/import-zip?source=lovable'],
  ['base44', Boxes, 'export', 'ready', '/import-zip?source=base44'],
  ['previous-agent-export', PackageOpen, 'export', 'ready', '/import-zip?source=previous-agent-export'],
  ['empty', FilePlus2, 'blank', 'ready', '/import/empty'],
  ['vercel', Triangle, 'export', 'credential', '/import/vercel'],
  ['figma', Figma, 'design', 'credential', '/import/figma'],
  ['claude', Sparkles, 'ai', 'credential', '/import/claude'],
];

function providerCopyKey(id: ImportHubProviderId, field: 'label' | 'description' | 'badge'): ImportHubKey {
  return `importHub.provider.${id}.${field}` as ImportHubKey;
}

export function getImportHubProviders(language?: string | null): ImportHubProvider[] {
  const copy = getImportHubCopy(language);

  return IMPORT_HUB_PROVIDER_DEFINITIONS.map(([id, icon, category, status, to]) => ({
    id,
    label: copy[providerCopyKey(id, 'label')],
    description: copy[providerCopyKey(id, 'description')],
    icon,
    category,
    status,
    to,
    ...(status === 'credential' ? { badge: copy[providerCopyKey(id, 'badge')] } : {}),
  }));
}

/** English remains the stable default and fallback for existing consumers. */
export const IMPORT_HUB_PROVIDERS: ImportHubProvider[] = getImportHubProviders('en');

/** Provider ids that have a real, executing import path today. */
export const IMPORT_HUB_READY_IDS: ImportHubProviderId[] = IMPORT_HUB_PROVIDERS.filter(
  (provider) => provider.status === 'ready',
).map((provider) => provider.id);

/** Provider ids that are honestly credential-gated until a user token is supplied. */
export const IMPORT_HUB_CREDENTIAL_IDS: ImportHubProviderId[] = IMPORT_HUB_PROVIDERS.filter(
  (provider) => provider.status === 'credential',
).map((provider) => provider.id);

export function getImportHubProvider(id: string, language?: string | null): ImportHubProvider | undefined {
  return getImportHubProviders(language).find((provider) => provider.id === id);
}
