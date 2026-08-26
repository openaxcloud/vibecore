#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DEPLOY_TIERS = Object.freeze(['runtime', 'web', 'admin', 'wsagent']);

const ADMIN_WEB_DEPENDENCIES = new Set(['app/lib/i18n/catalogs/admin.ts', 'app/lib/i18n/language.ts']);

function emptyTiers() {
  return { runtime: false, web: false, admin: false, wsagent: false };
}

function allTiers() {
  return { runtime: true, web: true, admin: true, wsagent: true };
}

export function parseForcedTiers(rawValue) {
  const raw = rawValue?.trim();

  if (!raw) {
    return undefined;
  }

  if (raw === 'all') {
    return allTiers();
  }

  const requested = raw.split(',').map((entry) => entry.trim());
  const invalid = requested.filter((entry) => !DEPLOY_TIERS.includes(entry));

  if (invalid.length > 0 || requested.some((entry) => entry.length === 0)) {
    throw new Error(
      `Invalid force_tiers value. Expected a comma list of ${DEPLOY_TIERS.join('/')} or 'all'; received ${JSON.stringify(rawValue)}.`,
    );
  }

  const tiers = emptyTiers();

  for (const tier of requested) {
    tiers[tier] = true;
  }

  return tiers;
}

function isSharedImageInput(path) {
  return (
    path === 'package.json' ||
    path === 'pnpm-lock.yaml' ||
    path === 'pnpm-workspace.yaml' ||
    path === 'tsconfig.json' ||
    path.endsWith('/package.json') ||
    path.startsWith('packages/') ||
    path === '.github/workflows/deploy-main.yml' ||
    path === 'scripts/cosign-sign-images.sh' ||
    path === 'scripts/validate-image-signing-wired.py'
  );
}

function isKnownNonImageInput(path) {
  return (
    path.endsWith('.md') ||
    path.startsWith('docs/') ||
    path.startsWith('infra/helm/') ||
    path.startsWith('.github/') ||
    path.startsWith('scripts/') ||
    path.startsWith('tests/') ||
    path === '.gitleaks.toml' ||
    path === '.trivyignore'
  );
}

/**
 * Resolve the image tiers affected by a set of repository paths.
 *
 * A missing base is deliberately fail-safe and rebuilds every tier. With a
 * valid diff, known chart/docs/test-only changes rebuild no image; the Helm
 * step can still apply chart changes atomically. Any unclassified production
 * input falls back to all tiers so a new service/source root cannot silently
 * ship stale code merely because this classifier has not learned it yet.
 */
export function detectDeployTiers(changedFiles, { forceTiers, hasBase = true } = {}) {
  const forced = parseForcedTiers(forceTiers);

  if (forced) {
    return forced;
  }

  if (!hasBase) {
    return allTiers();
  }

  const tiers = emptyTiers();
  let sawUnknownInput = false;

  for (const rawPath of changedFiles) {
    const path = rawPath.trim();

    if (!path) {
      continue;
    }

    if (isSharedImageInput(path)) {
      return allTiers();
    }

    let matched = false;

    if (
      path.startsWith('services/api/') ||
      path.startsWith('services/workspace-manager/') ||
      path.startsWith('services/preview-proxy/') ||
      path.startsWith('services/ai-gateway/') ||
      path.startsWith('services/worker/') ||
      path.startsWith('services/screenshotter/') ||
      path === 'infra/cloudbuild/runtime-tier.yaml' ||
      path === 'infra/docker/screenshotter.Dockerfile'
    ) {
      tiers.runtime = true;
      matched = true;
    }

    if (
      path.startsWith('app/') ||
      path.startsWith('electron/') ||
      path === 'Dockerfile' ||
      path === 'vite.config.ts' ||
      path === 'uno.config.ts' ||
      path === 'infra/cloudbuild/single-web.yaml'
    ) {
      tiers.web = true;
      matched = true;
    }

    if (
      path.startsWith('apps/admin/') ||
      ADMIN_WEB_DEPENDENCIES.has(path) ||
      path === 'infra/cloudbuild/single-admin.yaml'
    ) {
      tiers.admin = true;
      matched = true;
    }

    if (
      path.startsWith('services/workspace-agent/') ||
      path === 'services/workspace-agent/Dockerfile' ||
      path === 'infra/cloudbuild/workspace-agent.yaml'
    ) {
      tiers.wsagent = true;
      matched = true;
    }

    if (path === 'infra/docker/deps.Dockerfile') {
      tiers.runtime = true;
      tiers.web = true;
      tiers.admin = true;
      matched = true;
    }

    if (path === 'infra/docker/node-service.Dockerfile') {
      tiers.runtime = true;
      tiers.admin = true;
      matched = true;
    }

    if (!matched && !isKnownNonImageInput(path)) {
      sawUnknownInput = true;
    }
  }

  return sawUnknownInput ? allTiers() : tiers;
}

function parseCli(argv) {
  const options = { forceTiers: undefined, changedFileList: undefined, hasBase: true };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--force') {
      options.forceTiers = argv[++index];
    } else if (arg === '--changed-file-list') {
      options.changedFileList = argv[++index];
    } else if (arg === '--all') {
      options.hasBase = false;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.hasBase && !options.forceTiers && !options.changedFileList) {
    throw new Error('Pass --changed-file-list <path>, --force <tiers>, or --all.');
  }

  return options;
}

function main() {
  const options = parseCli(process.argv.slice(2));
  const changedFiles = options.changedFileList ? readFileSync(options.changedFileList, 'utf8').split(/\r?\n/u) : [];
  const tiers = detectDeployTiers(changedFiles, options);

  for (const tier of DEPLOY_TIERS) {
    process.stdout.write(`${tier}=${tiers[tier]}\n`);
  }

  process.stderr.write(`Tiers to build -> ${DEPLOY_TIERS.map((tier) => `${tier}=${tiers[tier]}`).join(' ')}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
