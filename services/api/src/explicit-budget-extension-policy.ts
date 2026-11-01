/** This administrative mechanism is limited to this one approved QA envelope. No grant runs on deployment. */
export const EXPLICIT_EXTENSION_POLICY = Object.freeze({
  projectId: 'cmvrzkkmo008z0nemon1zdd3k',
  organizationSlug: 'org-dzj1djmz',
  approvalId: 'aster-recipe-20261101-30520000',
});
export function matchesExplicitExtensionPolicy(input: {
  projectId: string;
  expectedOrganizationSlug: string;
  approvalId: string;
}): boolean {
  return (
    input.projectId === EXPLICIT_EXTENSION_POLICY.projectId &&
    input.expectedOrganizationSlug === EXPLICIT_EXTENSION_POLICY.organizationSlug &&
    input.approvalId === EXPLICIT_EXTENSION_POLICY.approvalId
  );
}
