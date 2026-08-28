import { lstat, readdir, readFile, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { PurgeClassReport, PurgeEffectDescriptor, PurgeLeaseContext } from './account-purge.js';
import { appPublicEnglish } from './app-public-copy.js';
import { projectStorageRoot, staticDeploymentStorageRoot } from './deployments.js';
import { SECONDARY_WORKSPACES_DIR, withProjectLock } from './project-storage.js';
import { withStaticDeploymentStorageLock, withStaticDeploymentStorageLocks } from './static-deployment-storage-lock.js';

const SAFE_STORAGE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const STATIC_ARTIFACT_REF = /^static-artifacts\/sha256\/([a-f0-9]{64})$/u;
const MAX_STATIC_ALIAS_SCAN = 10_000;

export interface LocalSnapshotObjectInventory {
  projectId: string;
  storageKey: string;
}

export interface LocalWorkspaceStorageInventory {
  projectId: string;
  workspaceId: string;
}

export interface LocalAccountStorageInventory {
  /** Sole-owner project trees; deleting one also removes every nested checkout. */
  ownedProjectIds: string[];
  /** Subject-specific checkouts in projects retained for other members. */
  workspaceStorage: LocalWorkspaceStorageInventory[];
  /** Exact DB-referenced local checkpoint objects, captured before DB cascade. */
  snapshotObjects: LocalSnapshotObjectInventory[];
  /** Static artifacts referenced by Deployment or append-only ReleaseManifest. */
  staticDeploymentIds: string[];
  /** Exact content-addressed objects captured from ReleaseManifest before cascade. */
  staticArtifactRefs: string[];
  /** Deployment ids whose source/target routing aliases must be erased. */
  staticAliasDeploymentIds: string[];
}

export interface LocalAccountStoragePurgeOptions {
  lease: PurgeLeaseContext;
  /** Injectable roots keep filesystem tests disposable and independent. */
  projectRoot?: string;
  staticRoot?: string;
  /** Rechecked while the artifact digest lock is held. */
  isStaticArtifactRetainedOutsidePurge?: (artifactRef: string) => Promise<boolean>;
}

export interface LocalPathErasureResult {
  kind:
    | 'project_tree'
    | 'archives'
    | 'checkpoints'
    | 'workspace_tree'
    | 'static_deployment'
    | 'static_artifact'
    | 'static_alias';
  resourceId: string;
  existedBefore: boolean;
  entriesBefore: number;
  remainingAfterPurge: number;
  /** A shared digest is deliberately retained only with a live external manifest. */
  retainedByOtherProject?: boolean;
}

export interface LocalAccountStoragePurgeOutcome {
  paths: LocalPathErasureResult[];
  classes: PurgeClassReport[];
  verified: boolean;
}

interface LocalPathEffect {
  descriptor: PurgeEffectDescriptor;
  kind: LocalPathErasureResult['kind'];
  resourceId: string;
  target: string;
  lock: <T>(effect: () => Promise<T>) => Promise<T>;
}

function assertSafeId(value: string, kind: string): void {
  if (!SAFE_STORAGE_ID.test(value)) {
    throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_STORAGE_ID_INVALID')), {
      code: `ACCOUNT_PURGE_INVALID_${kind.toUpperCase()}_ID`,
    });
  }
}

function childPath(root: string, ...segments: string[]): string {
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, ...segments);
  const rel = relative(absoluteRoot, target);

  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
    throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_LOCAL_PATH_OUTSIDE_ROOT')), {
      code: 'ACCOUNT_PURGE_LOCAL_PATH_OUTSIDE_ROOT',
    });
  }

  return target;
}

function normalizeSnapshotObject(input: LocalSnapshotObjectInventory, objectsRoot: string): string {
  assertSafeId(input.projectId, 'project');

  const normalized = input.storageKey.replaceAll('\\', '/').replace(/^\/+/, '');
  const expectedPrefix = `snapshots/${input.projectId}/`;

  if (!normalized.startsWith(expectedPrefix) || normalized.includes('/../') || normalized.endsWith('/..')) {
    throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_LOCAL_SNAPSHOT_KEY_OUTSIDE_PROJECT')), {
      code: 'ACCOUNT_PURGE_LOCAL_SNAPSHOT_KEY_OUTSIDE_PROJECT',
    });
  }

  return childPath(objectsRoot, ...normalized.split('/'));
}

async function pathEntryCount(target: string): Promise<number> {
  let metadata;

  try {
    metadata = await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }

  if (!metadata.isDirectory()) return 1;

  let total = 1;
  const entries = await readdir(target, { withFileTypes: true });

  for (const entry of entries) {
    const child = join(target, entry.name);
    total += entry.isDirectory() && !entry.isSymbolicLink() ? await pathEntryCount(child) : 1;
  }

  return total;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function erasePath(effect: LocalPathEffect, lease: PurgeLeaseContext): Promise<LocalPathErasureResult> {
  return effect.lock(async () => {
    await lease.validate();

    let existedBefore = false;
    let entriesBefore = 0;

    try {
      const execution = await lease.executeEffect(effect.descriptor, async () => {
        existedBefore = await pathExists(effect.target);
        entriesBefore = await pathEntryCount(effect.target);
        await rm(effect.target, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 });

        if (await pathExists(effect.target)) {
          throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_LOCAL_STORAGE_VERIFICATION_FAILED')), {
            code: 'ACCOUNT_PURGE_LOCAL_STORAGE_VERIFICATION_FAILED',
          });
        }

        return {
          kind: effect.kind,
          resourceId: effect.resourceId,
          existedBefore,
          entriesBefore,
          verifiedAbsent: true,
        };
      });

      const receipt = execution.receipt as {
        existedBefore?: unknown;
        entriesBefore?: unknown;
        verifiedAbsent?: unknown;
      };
      const remainingAfterPurge = (await pathExists(effect.target)) ? 1 : 0;

      return {
        kind: effect.kind,
        resourceId: effect.resourceId,
        existedBefore: receipt.existedBefore === true,
        entriesBefore:
          typeof receipt.entriesBefore === 'number' && Number.isSafeInteger(receipt.entriesBefore)
            ? receipt.entriesBefore
            : 0,
        remainingAfterPurge:
          receipt.verifiedAbsent === true && remainingAfterPurge === 0 ? 0 : Math.max(1, remainingAfterPurge),
      };
    } catch {
      return {
        kind: effect.kind,
        resourceId: effect.resourceId,
        existedBefore: existedBefore || (await pathExists(effect.target).catch(() => true)),
        entriesBefore,
        remainingAfterPurge: 1,
      };
    }
  });
}

function classReport(dataClass: string, model: string, results: LocalPathErasureResult[]): PurgeClassReport {
  return {
    dataClass,
    action: 'deleted',
    models: {
      [model]: results.length,
      ExistingPaths: results.filter((entry) => entry.existedBefore).length,
      EntriesErased: results.reduce((sum, entry) => sum + entry.entriesBefore, 0),
    },
    evidence: {
      resources: results.map(({ resourceId, existedBefore, entriesBefore, remainingAfterPurge }) => ({
        resourceId,
        existedBefore,
        entriesBefore,
        remainingAfterPurge,
      })),
    },
    remainingAfterPurge: results.reduce((sum, entry) => sum + entry.remainingAfterPurge, 0),
  };
}

function retainedArtifactClassReport(results: LocalPathErasureResult[]): PurgeClassReport {
  return {
    dataClass: 'shared_static_release_artifacts',
    action: 'retained',
    reason: appPublicEnglish('ACCOUNT_PURGE_SHARED_STATIC_ARTIFACT_RETAINED'),
    models: {
      SharedReleaseArtifacts: results.length,
      ExistingPaths: results.filter((entry) => entry.existedBefore).length,
    },
    evidence: {
      resources: results.map(({ resourceId, existedBefore, entriesBefore }) => ({
        resourceId,
        existedBefore,
        entriesBefore,
        retainedByOtherProject: true,
      })),
    },
  };
}

function staticArtifactTarget(artifactRef: string, deployRoot: string): { digest: string; target: string } {
  const match = STATIC_ARTIFACT_REF.exec(artifactRef);

  if (!match) {
    throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_LOCAL_STORAGE_VERIFICATION_FAILED')), {
      code: 'ACCOUNT_PURGE_STATIC_ARTIFACT_REF_INVALID',
    });
  }

  return {
    digest: match[1],
    target: childPath(deployRoot, '.artifacts', 'sha256', match[1]),
  };
}

async function eraseStaticArtifact(
  artifactRef: string,
  deployRoot: string,
  options: LocalAccountStoragePurgeOptions,
): Promise<LocalPathErasureResult> {
  const { digest, target } = staticArtifactTarget(artifactRef, deployRoot);
  const externalRetention = options.isStaticArtifactRetainedOutsidePurge;

  if (!externalRetention) {
    throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_LOCAL_STORAGE_VERIFICATION_FAILED')), {
      code: 'ACCOUNT_PURGE_STATIC_ARTIFACT_RETENTION_CHECK_UNAVAILABLE',
    });
  }

  return withStaticDeploymentStorageLock(digest, async () => {
    await options.lease.validate();
    const existedBefore = await pathExists(target);
    const entriesBefore = await pathEntryCount(target);

    try {
      if (await externalRetention(artifactRef)) {
        return {
          kind: 'static_artifact',
          resourceId: artifactRef,
          existedBefore,
          entriesBefore,
          remainingAfterPurge: existedBefore ? 1 : 0,
          retainedByOtherProject: true,
        };
      }

      const execution = await options.lease.executeEffect(
        {
          key: `static-release-artifact:${digest}`,
          resourceType: 'static_release_artifact',
          resourceId: artifactRef,
        },
        async () => {
          const effectExistedBefore = await pathExists(target);
          const effectEntriesBefore = await pathEntryCount(target);
          await rm(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 });

          if (await pathExists(target)) {
            throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_LOCAL_STORAGE_VERIFICATION_FAILED')), {
              code: 'ACCOUNT_PURGE_LOCAL_STORAGE_VERIFICATION_FAILED',
            });
          }

          return {
            existedBefore: effectExistedBefore,
            entriesBefore: effectEntriesBefore,
            verifiedAbsent: true,
          };
        },
      );
      const receipt = execution.receipt as {
        existedBefore?: unknown;
        entriesBefore?: unknown;
        verifiedAbsent?: unknown;
      };
      const remainingAfterPurge = (await pathExists(target)) ? 1 : 0;

      return {
        kind: 'static_artifact',
        resourceId: artifactRef,
        existedBefore: receipt.existedBefore === true,
        entriesBefore:
          typeof receipt.entriesBefore === 'number' && Number.isSafeInteger(receipt.entriesBefore)
            ? receipt.entriesBefore
            : 0,
        remainingAfterPurge:
          receipt.verifiedAbsent === true && remainingAfterPurge === 0 ? 0 : Math.max(1, remainingAfterPurge),
      };
    } catch {
      return {
        kind: 'static_artifact',
        resourceId: artifactRef,
        existedBefore: existedBefore || (await pathExists(target).catch(() => true)),
        entriesBefore,
        remainingAfterPurge: 1,
      };
    }
  });
}

interface StaticAliasEntry {
  sourceDeploymentId: string;
  targetDeploymentId?: string;
  target: string;
}

async function relevantStaticAliases(deployRoot: string, deploymentIds: Set<string>): Promise<StaticAliasEntry[]> {
  const aliasRoot = childPath(deployRoot, '.aliases');
  const entries = await readdir(aliasRoot, { withFileTypes: true }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });

  if (entries.length > MAX_STATIC_ALIAS_SCAN) {
    throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_LOCAL_STORAGE_VERIFICATION_FAILED')), {
      code: 'ACCOUNT_PURGE_STATIC_ALIAS_SCAN_LIMIT_EXCEEDED',
    });
  }

  const relevant: StaticAliasEntry[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!SAFE_STORAGE_ID.test(entry.name)) continue;
    const target = childPath(aliasRoot, entry.name);
    const rawTarget = entry.isFile() ? await readFile(target, 'utf8').catch(() => undefined) : undefined;
    const parsedTarget = rawTarget?.trim();
    const targetDeploymentId = parsedTarget && SAFE_STORAGE_ID.test(parsedTarget) ? parsedTarget : undefined;

    if (deploymentIds.has(entry.name) || (targetDeploymentId && deploymentIds.has(targetDeploymentId))) {
      relevant.push({ sourceDeploymentId: entry.name, targetDeploymentId, target });
    }
  }

  return relevant;
}

async function eraseRelevantStaticAliases(
  deployRoot: string,
  deploymentIds: string[],
  lease: PurgeLeaseContext,
): Promise<LocalPathErasureResult[]> {
  const ids = [...new Set(deploymentIds)].sort();
  for (const id of ids) assertSafeId(id, 'deployment');
  if (ids.length === 0) return [];

  const targetIds = new Set(ids);
  const initial = await relevantStaticAliases(deployRoot, targetIds);
  const lockIds = [
    ...ids,
    ...initial.flatMap(({ sourceDeploymentId, targetDeploymentId }) => [
      sourceDeploymentId,
      ...(targetDeploymentId ? [targetDeploymentId] : []),
    ]),
  ];

  return withStaticDeploymentStorageLocks(lockIds, async () => {
    await lease.validate();
    const aliases = await relevantStaticAliases(deployRoot, targetIds);
    const results: LocalPathErasureResult[] = [];

    for (const alias of aliases) {
      let existedBefore = false;
      let entriesBefore = 0;

      try {
        const execution = await lease.executeEffect(
          {
            key: `static-routing-alias:${alias.sourceDeploymentId}`,
            resourceType: 'static_routing_alias',
            resourceId: alias.sourceDeploymentId,
          },
          async () => {
            existedBefore = await pathExists(alias.target);
            entriesBefore = await pathEntryCount(alias.target);
            await rm(alias.target, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 });
            return { existedBefore, entriesBefore, verifiedAbsent: !(await pathExists(alias.target)) };
          },
        );
        const receipt = execution.receipt as {
          existedBefore?: unknown;
          entriesBefore?: unknown;
          verifiedAbsent?: unknown;
        };
        const remains = await pathExists(alias.target);
        results.push({
          kind: 'static_alias',
          resourceId: alias.sourceDeploymentId,
          existedBefore: receipt.existedBefore === true,
          entriesBefore:
            typeof receipt.entriesBefore === 'number' && Number.isSafeInteger(receipt.entriesBefore)
              ? receipt.entriesBefore
              : 0,
          remainingAfterPurge: receipt.verifiedAbsent === true && !remains ? 0 : 1,
        });
      } catch {
        results.push({
          kind: 'static_alias',
          resourceId: alias.sourceDeploymentId,
          existedBefore: existedBefore || (await pathExists(alias.target).catch(() => true)),
          entriesBefore,
          remainingAfterPurge: 1,
        });
      }
    }

    /* No late alias may mention a purged id while all source/target locks are held. */
    const remaining = await relevantStaticAliases(deployRoot, targetIds);
    for (const alias of remaining) {
      if (!results.some((result) => result.resourceId === alias.sourceDeploymentId)) {
        results.push({
          kind: 'static_alias',
          resourceId: alias.sourceDeploymentId,
          existedBefore: true,
          entriesBefore: 0,
          remainingAfterPurge: 1,
        });
      }
    }

    return results;
  });
}

/**
 * Erase and re-count every API-local/NFS footprint of a purged subject. Each
 * path is mutated while its cross-replica filesystem lock and the 0093 plan-row
 * lock are both held. A reused durable receipt never substitutes for live
 * verification: if a path reappeared, the class remains non-zero and the purge
 * cannot be certified.
 */
export async function eraseLocalAccountStorage(
  inventory: LocalAccountStorageInventory,
  options: LocalAccountStoragePurgeOptions,
): Promise<LocalAccountStoragePurgeOutcome> {
  const localRoot = resolve(options.projectRoot ?? projectStorageRoot());
  const objectsRoot = childPath(localRoot, '_objects');
  const deployRoot = resolve(options.staticRoot ?? staticDeploymentStorageRoot());
  const ownedProjectIds = [...new Set(inventory.ownedProjectIds)].sort();
  const ownedProjects = new Set(ownedProjectIds);

  for (const projectId of ownedProjectIds) assertSafeId(projectId, 'project');

  const snapshotTargets = new Map<string, string[]>();
  for (const snapshot of inventory.snapshotObjects) {
    const target = normalizeSnapshotObject(snapshot, objectsRoot);
    const targets = snapshotTargets.get(snapshot.projectId) ?? [];
    targets.push(target);
    snapshotTargets.set(snapshot.projectId, targets);
  }

  const effects: LocalPathEffect[] = [];

  for (const projectId of ownedProjectIds) {
    const projectLock = <T>(effect: () => Promise<T>) => withProjectLock(projectId, effect);
    effects.push(
      {
        descriptor: {
          key: `local-project-storage:${projectId}`,
          resourceType: 'local_project_storage',
          resourceId: projectId,
        },
        kind: 'project_tree',
        resourceId: projectId,
        target: childPath(localRoot, projectId),
        lock: projectLock,
      },
      {
        descriptor: {
          key: `local-project-archives:${projectId}`,
          resourceType: 'local_project_archive',
          resourceId: projectId,
        },
        kind: 'archives',
        resourceId: projectId,
        target: childPath(objectsRoot, 'exports', projectId),
        lock: projectLock,
      },
      {
        descriptor: {
          key: `local-project-checkpoints:${projectId}`,
          resourceType: 'local_project_snapshot',
          resourceId: projectId,
        },
        kind: 'checkpoints',
        resourceId: projectId,
        target: childPath(objectsRoot, 'snapshots', projectId),
        lock: projectLock,
      },
    );
  }

  for (const snapshot of inventory.snapshotObjects) {
    if (!ownedProjects.has(snapshot.projectId)) {
      throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_LOCAL_SNAPSHOT_PROJECT_NOT_OWNED')), {
        code: 'ACCOUNT_PURGE_LOCAL_SNAPSHOT_PROJECT_NOT_OWNED',
      });
    }
  }

  for (const workspace of inventory.workspaceStorage) {
    assertSafeId(workspace.projectId, 'project');
    assertSafeId(workspace.workspaceId, 'workspace');
    if (ownedProjects.has(workspace.projectId)) continue;

    effects.push({
      descriptor: {
        key: `local-workspace-storage:${workspace.projectId}:${workspace.workspaceId}`,
        resourceType: 'local_workspace_storage',
        resourceId: `${workspace.projectId}:${workspace.workspaceId}`,
      },
      kind: 'workspace_tree',
      resourceId: `${workspace.projectId}:${workspace.workspaceId}`,
      target: childPath(localRoot, workspace.projectId, SECONDARY_WORKSPACES_DIR, workspace.workspaceId),
      lock: <T>(effect: () => Promise<T>) => withProjectLock(workspace.projectId, effect),
    });
  }

  for (const deploymentId of [...new Set(inventory.staticDeploymentIds)].sort()) {
    assertSafeId(deploymentId, 'deployment');
    effects.push({
      descriptor: {
        key: `static-deployment-snapshot:${deploymentId}`,
        resourceType: 'static_deployment_snapshot',
        resourceId: deploymentId,
      },
      kind: 'static_deployment',
      resourceId: deploymentId,
      target: childPath(deployRoot, deploymentId),
      lock: <T>(effect: () => Promise<T>) => withStaticDeploymentStorageLock(deploymentId, effect),
    });
  }

  const staticArtifactRefs = [...new Set(inventory.staticArtifactRefs)].sort();
  const staticAliasDeploymentIds = [...new Set(inventory.staticAliasDeploymentIds)].sort();

  /*
   * The exact DB keys are validated above even though deleting the per-project
   * checkpoint directory removes them in one locked effect. Re-check each exact
   * key after all effects too, so a malformed/relocated checkpoint can never be
   * hidden by a zero directory count.
   */
  const paths: LocalPathErasureResult[] = [];
  for (const effect of effects) paths.push(await erasePath(effect, options.lease));

  for (const artifactRef of staticArtifactRefs) {
    paths.push(await eraseStaticArtifact(artifactRef, deployRoot, options));
  }

  paths.push(...(await eraseRelevantStaticAliases(deployRoot, staticAliasDeploymentIds, options.lease)));

  for (const [projectId, targets] of snapshotTargets) {
    for (const target of targets) {
      if (await pathExists(target)) {
        paths.push({
          kind: 'checkpoints',
          resourceId: `${projectId}:${relative(objectsRoot, target)}`,
          existedBefore: true,
          entriesBefore: 0,
          remainingAfterPurge: 1,
        });
      }
    }
  }

  const groups = {
    projectTrees: paths.filter((entry) => entry.kind === 'project_tree'),
    archives: paths.filter((entry) => entry.kind === 'archives'),
    checkpoints: paths.filter((entry) => entry.kind === 'checkpoints'),
    workspaceTrees: paths.filter((entry) => entry.kind === 'workspace_tree'),
    staticDeployments: paths.filter((entry) => entry.kind === 'static_deployment'),
    staticArtifacts: paths.filter((entry) => entry.kind === 'static_artifact' && !entry.retainedByOtherProject),
    sharedStaticArtifacts: paths.filter((entry) => entry.kind === 'static_artifact' && entry.retainedByOtherProject),
    staticAliases: paths.filter((entry) => entry.kind === 'static_alias'),
  };
  const classes = [
    classReport('local_project_storage', 'ProjectTrees', groups.projectTrees),
    classReport('local_project_archives', 'ArchiveDirectories', groups.archives),
    classReport('local_project_checkpoints', 'CheckpointDirectories', groups.checkpoints),
    classReport('local_workspace_storage', 'WorkspaceTrees', groups.workspaceTrees),
    classReport('static_deployment_snapshots', 'DeploymentSnapshots', groups.staticDeployments),
    classReport('static_release_artifacts', 'ReleaseArtifacts', groups.staticArtifacts),
    classReport('static_routing_aliases', 'RoutingAliases', groups.staticAliases),
    ...(groups.sharedStaticArtifacts.length > 0 ? [retainedArtifactClassReport(groups.sharedStaticArtifacts)] : []),
  ];

  return {
    paths,
    classes,
    verified: classes.every((entry) => entry.action === 'retained' || entry.remainingAfterPurge === 0),
  };
}
