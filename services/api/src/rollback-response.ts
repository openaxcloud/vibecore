import { localizeAppPublicMessage } from './app-public-copy.js';
import type { DeploymentRecord } from './store.js';
import type { TransactionalLocale } from './transactional-i18n.js';

export interface RollbackSuccessReceipt {
  responseStatus: 201;
  responseContentLanguage: TransactionalLocale;
  responseBody: Record<string, unknown>;
}

function publicRollbackDeployment(deployment: DeploymentRecord, locale: TransactionalLocale): DeploymentRecord {
  const metadata = deployment.metadata ? { ...deployment.metadata } : undefined;

  if (metadata) {
    for (const key of ['reservedVmCreate', 'reservedVmRedeploy'] as const) {
      const durable = metadata[key];
      if (durable && typeof durable === 'object' && !Array.isArray(durable)) {
        const { encryptedBuildInput: _ciphertext, ...safe } = durable as Record<string, unknown>;
        metadata[key] = safe;
      }
    }

    const serverDeploy = metadata.serverDeploy;
    if (serverDeploy && typeof serverDeploy === 'object' && !Array.isArray(serverDeploy)) {
      const {
        rollbackRuntimeSpec: _runtimeSpec,
        rollbackPromotionEvidence: _promotionEvidence,
        ...safeServerDeploy
      } = serverDeploy as Record<string, unknown>;
      metadata.serverDeploy = safeServerDeploy;
    }
  }

  return {
    ...deployment,
    ...(metadata ? { metadata } : {}),
    logs: deployment.logs.map((log) => {
      const localized = localizeAppPublicMessage(log.message, locale);
      return { ...log, message: localized.matched ? localized.value : log.message };
    }),
  };
}

/** Build the exact JSON receipt from the row committed READY in this transaction. */
export function buildRollbackSuccessReceipt(input: {
  deployment: DeploymentRecord;
  responseContentLanguage: TransactionalLocale;
  restoredFromVersion: number;
  restoredFromDeploymentId: string;
  supersededVersion: number;
  verifiedArtifactDigest: string;
  url: string;
}): RollbackSuccessReceipt {
  const responseBody = {
    deployment: publicRollbackDeployment(input.deployment, input.responseContentLanguage),
    restoredFromVersion: input.restoredFromVersion,
    restoredFromDeploymentId: input.restoredFromDeploymentId,
    supersededVersion: input.supersededVersion,
    verifiedArtifactDigest: input.verifiedArtifactDigest,
    url: input.url,
  };

  // Match Fastify/JSON semantics exactly and exclude every undefined property
  // before Prisma accepts this as durable JSON.
  const serialized = JSON.parse(JSON.stringify(responseBody)) as Record<string, unknown>;

  return {
    responseStatus: 201,
    responseContentLanguage: input.responseContentLanguage,
    responseBody: serialized,
  };
}
