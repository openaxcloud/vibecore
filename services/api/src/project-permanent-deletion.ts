import { createHash } from 'node:crypto';

import { objectStorageRequestHash, type ObjectStorageOperationRequestShape } from './object-storage-operation.js';

export interface ProjectPermanentDeletionIdentity {
  projectId: string;
  organizationId: string;
  actorUserId: string;
  expectedProjectName: string;
}

/**
 * Canonical non-secret operation identity shared by the route, Prisma store,
 * replay lookup, and the in-memory contract store. The plaintext project name
 * remains in the immutable deletion receipt but only its digest is written to
 * the generic saga payload.
 */
export function projectPermanentDeletionOperationRequest(
  input: ProjectPermanentDeletionIdentity,
): ObjectStorageOperationRequestShape {
  return {
    kind: 'PROJECT_PERMANENT_DELETE',
    scopes: [
      {
        projectId: input.projectId,
        expectedOrganizationId: input.organizationId,
      },
    ],
    payload: {
      command: 'project-permanent-delete',
      intent: 'IRREVERSIBLE_PROJECT_ERASURE',
      actorUserIdHash: createHash('sha256').update(input.actorUserId).digest('hex'),
      expectedProjectNameHash: createHash('sha256').update(input.expectedProjectName).digest('hex'),
    },
    preconditions: {
      tenantMustMatch: true,
      physicalAbsenceRequired: true,
    },
  };
}

export function projectPermanentDeletionRequestHash(input: ProjectPermanentDeletionIdentity): string {
  return objectStorageRequestHash(projectPermanentDeletionOperationRequest(input));
}
