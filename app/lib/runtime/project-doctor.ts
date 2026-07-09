/**
 * Project Doctor — the unified post-generation health pass.
 *
 * E-Code generates with parallel role-lanes (architect/frontend/backend/…), each
 * OWNING DIFFERENT files, and the consensus reconciles opinions, NOT code. So —
 * unlike bolt.diy's single coherent stream — inter-file inconsistencies slip
 * through: a component named-exported here but default-imported there, a barrel
 * import with no index, a component that is imported but never written. Any of
 * these renders the app blank with no build error the user can act on.
 *
 * The doctor runs ONCE over the whole file set (the same holistic point that
 * already repairs package.json / barrels / the Vite config) and:
 *   1. reconciles default-import ↔ named-export mismatches across EVERY file
 *      (generalising the App-entry-only fix to the whole graph),
 *   2. flags relative imports that resolve to no file and no synthesizable
 *      barrel — the "silent blank app" case — so the caller can self-repair or
 *      surface a clear message instead of shipping a broken "Done".
 *
 * Pure + dependency-free (reuses the tested reconcile/barrel primitives) so the
 * whole pass is unit-testable with a plain file map.
 */
import { synthesizeMissingBarrels } from './barrel-synthesis';
import {
  hasDefaultExport,
  hasNamedExport,
  reconcileEntryDefaultExports,
  resolveSiblingCandidates,
} from './entry-export-reconcile';

const SOURCE_RE = /\.(tsx|jsx|ts|js|mjs|cjs)$/;

function isSource(path: string): boolean {
  return SOURCE_RE.test(path) && !/\.d\.ts$/.test(path);
}

/** Every relative module specifier `from '...'` / bare `import '...'` in a file. */
const RELATIVE_IMPORT_RE = /(?:from|import)\s*['"](\.[^'"]+)['"]/g;

export function parseRelativeSpecifiers(content: string): string[] {
  const specs = new Set<string>();

  for (const match of content.matchAll(RELATIVE_IMPORT_RE)) {
    specs.add(match[1]);
  }

  return [...specs];
}

/**
 * Reconcile default-import/named-export mismatches across the WHOLE project, not
 * just the Vite entry. Treats every source file as a potential importer and
 * appends `export default <Name>` to any local module that is default-imported
 * but only exports `<Name>` as a named local binding. Returns `{ path -> content }`
 * fixups; pure, no mutation of the input.
 */
export function reconcileAllDefaultExports(files: Record<string, string>): Record<string, string> {
  const fixups: Record<string, string> = {};

  /*
   * Fold onto a working view so a target fixed via one importer is seen (already
   * has a default export) by the next importer and not appended twice.
   */
  const view: Record<string, string> = { ...files };

  for (const [path, content] of Object.entries(files)) {
    if (!isSource(path)) {
      continue;
    }

    const perFile = reconcileEntryDefaultExports(path, content, view);

    for (const [targetPath, fixed] of Object.entries(perFile)) {
      fixups[targetPath] = fixed;
      view[targetPath] = fixed;
    }
  }

  return fixups;
}

export interface UnresolvedImport {
  importer: string;
  specifier: string;
}

/**
 * Find relative imports that resolve to no existing file AND no barrel the
 * barrel-synthesizer would create. These are the imports that leave the app
 * blank with no actionable error. Never invents a module (that would mask a
 * genuinely missing component) — it reports so the caller can self-repair or
 * tell the user precisely what is missing.
 */
export function detectUnresolvedImports(files: Record<string, string>): UnresolvedImport[] {
  const present = new Set(Object.keys(files));
  const barrelPaths = new Set(synthesizeMissingBarrels(files).map((barrel) => barrel.path));
  const unresolved: UnresolvedImport[] = [];

  for (const [importer, content] of Object.entries(files)) {
    if (!isSource(importer)) {
      continue;
    }

    for (const spec of parseRelativeSpecifiers(content)) {
      // Ignore non-module assets (css/json/svg/images) — Vite resolves those.
      if (/\.(css|scss|sass|less|json|svg|png|jpe?g|gif|webp|woff2?)$/.test(spec)) {
        continue;
      }

      const candidates = resolveSiblingCandidates(importer, spec);
      const resolved = candidates.some((candidate) => present.has(candidate) || barrelPaths.has(candidate));

      if (!resolved) {
        unresolved.push({ importer, specifier: spec });
      }
    }
  }

  return unresolved;
}

export interface DoctorFinding {
  kind: 'default-export-added' | 'unresolved-import';
  path: string;
  detail: string;
}

export interface ProjectDoctorResult {
  /** `{ path -> newContent }` for import/export reconciliation to write back. */
  fixups: Record<string, string>;

  /** Imports that could not be resolved (the app will not mount). */
  unresolved: UnresolvedImport[];

  /** Human-readable findings for the workspace log. */
  findings: DoctorFinding[];

  /** True when the graph looks mountable after the fixups (no unresolved imports). */
  healthy: boolean;
}

/**
 * Run the import/export half of the doctor over a file map. package.json / vite /
 * barrels are still handled by buildPreviewManifestRepair at the same call site;
 * this adds the generic cross-file reconciliation + resolution audit that the
 * fragmented per-file passes did not cover. Pure.
 */
export function runProjectDoctor(files: Record<string, string>): ProjectDoctorResult {
  const fixups = reconcileAllDefaultExports(files);

  /*
   * Re-audit resolution against the FIXED view (a reconciled default export can
   * itself never create/remove a module, but keep the contract explicit).
   */
  const fixedView = { ...files, ...fixups };
  const unresolved = detectUnresolvedImports(fixedView);

  const findings: DoctorFinding[] = [];

  for (const path of Object.keys(fixups)) {
    findings.push({
      kind: 'default-export-added',
      path,
      detail: `Added a default export to ${path} to match a default import (prevents a blank app).`,
    });
  }

  for (const item of unresolved) {
    findings.push({
      kind: 'unresolved-import',
      path: item.importer,
      detail: `${item.importer} imports "${item.specifier}", which resolves to no file — the app will not mount until it exists.`,
    });
  }

  return { fixups, unresolved, findings, healthy: unresolved.length === 0 };
}

// Re-exported so callers can reason about the primitives without a second import.
export { hasDefaultExport, hasNamedExport };
