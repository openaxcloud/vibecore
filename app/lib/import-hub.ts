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

export const IMPORT_HUB_CATEGORY_LABELS: Record<ImportHubCategory, string> = {
  git: 'Git repositories',
  export: 'Agent & builder exports',
  data: 'Data',
  design: 'Design',
  ai: 'AI',
  blank: 'Start fresh',
};

/**
 * The canonical hub registry. Kept in the documented order. Every entry routes
 * to a REAL destination; `credential` entries route to a page that explains the
 * exact token needed and never pretends the import happened.
 */
export const IMPORT_HUB_PROVIDERS: ImportHubProvider[] = [
  {
    id: 'github',
    label: 'GitHub',
    description: 'Import a public repository by URL — including a quick express import from a paste.',
    icon: Github,
    category: 'git',
    status: 'ready',
    to: '/import-github',
  },
  {
    id: 'bitbucket',
    label: 'Bitbucket',
    description: 'Import a Bitbucket repository by URL into a persistent project.',
    icon: GitBranch,
    category: 'git',
    status: 'ready',
    to: '/import-github?source=bitbucket',
  },
  {
    id: 'zip',
    label: 'ZIP archive',
    description: 'Upload a .zip of your code and turn it into a persistent workspace.',
    icon: FileArchive,
    category: 'export',
    status: 'ready',
    to: '/import-zip',
  },
  {
    id: 'spreadsheet',
    label: 'Spreadsheet',
    description: 'Paste or upload CSV/TSV and generate a real, sortable data app.',
    icon: Table2,
    category: 'data',
    status: 'ready',
    to: '/import/spreadsheet',
  },
  {
    id: 'bolt',
    label: 'Bolt',
    description: 'Import a Bolt export archive. Files are staged and scanned for secrets before commit.',
    icon: Zap,
    category: 'export',
    status: 'ready',
    to: '/import-zip?source=bolt',
  },
  {
    id: 'lovable',
    label: 'Lovable',
    description: 'Import a Lovable export archive with secret detection and a preview before it lands.',
    icon: Heart,
    category: 'export',
    status: 'ready',
    to: '/import-zip?source=lovable',
  },
  {
    id: 'base44',
    label: 'Base44',
    description: 'Import a Base44 export archive into an isolated, persistent project.',
    icon: Boxes,
    category: 'export',
    status: 'ready',
    to: '/import-zip?source=base44',
  },
  {
    id: 'previous-agent-export',
    label: 'Previous Agent export',
    description: 'Bring an export from another AI builder and continue it in the E-Code IDE.',
    icon: PackageOpen,
    category: 'export',
    status: 'ready',
    to: '/import-zip?source=previous-agent-export',
  },
  {
    id: 'empty',
    label: 'Empty project',
    description: 'Start from a blank workspace — no agent, framework or scaffolding. For power users.',
    icon: FilePlus2,
    category: 'blank',
    status: 'ready',
    to: '/import/empty',
  },
  {
    id: 'vercel',
    label: 'Vercel',
    description: 'Import a Vercel project. Requires connecting a Vercel access token.',
    icon: Triangle,
    category: 'export',
    status: 'credential',
    to: '/import/vercel',
    badge: 'Connect token',
  },
  {
    id: 'figma',
    label: 'Figma',
    description: 'Import a Figma design. Requires a Figma personal access token.',
    icon: Figma,
    category: 'design',
    status: 'credential',
    to: '/import/figma',
    badge: 'Connect token',
  },
  {
    id: 'claude',
    label: 'Claude',
    description: 'Import a Claude design/artifact source. Requires the source to connect.',
    icon: Sparkles,
    category: 'ai',
    status: 'credential',
    to: '/import/claude',
    badge: 'Connect source',
  },
];

/** Provider ids that have a real, executing import path today. */
export const IMPORT_HUB_READY_IDS: ImportHubProviderId[] = IMPORT_HUB_PROVIDERS.filter(
  (provider) => provider.status === 'ready',
).map((provider) => provider.id);

/** Provider ids that are honestly credential-gated until a user token is supplied. */
export const IMPORT_HUB_CREDENTIAL_IDS: ImportHubProviderId[] = IMPORT_HUB_PROVIDERS.filter(
  (provider) => provider.status === 'credential',
).map((provider) => provider.id);

export function getImportHubProvider(id: string): ImportHubProvider | undefined {
  return IMPORT_HUB_PROVIDERS.find((provider) => provider.id === id);
}
