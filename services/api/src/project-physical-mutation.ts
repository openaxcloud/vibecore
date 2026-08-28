import { appPublicEnglish } from './app-public-copy.js';

const SAFE_PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/** Shared advisory-lock identity for physical writers and tenant transfer. */
export function projectPhysicalMutationLockKey(projectId: string): string {
  if (!SAFE_PROJECT_ID.test(projectId)) {
    throw Object.assign(new Error(appPublicEnglish('INVALID_PROJECT_PATH')), {
      code: 'INVALID_PROJECT_PATH',
      statusCode: 400,
    });
  }

  return `project-physical-mutation:${projectId}`;
}

export function projectOrganizationChangedError() {
  return Object.assign(new Error(appPublicEnglish('PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION')), {
    code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
    statusCode: 409,
  });
}
