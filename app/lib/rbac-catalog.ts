import { getOrganizationAccessCopy, type OrganizationAccessKey } from './i18n/catalogs/organization-access';

/*
 * Web-side mirror of the RBAC permission catalog. The canonical source of truth
 * is the workspace package `packages/rbac/src/index.ts` (`@vibecore/rbac`), which
 * the API imports directly (PermissionKey union + rolePermissions map). That
 * package is intentionally NOT a dependency of the web app (it is not linked into
 * the web `node_modules`), so — matching the existing pattern in
 * `app/routes/organization-members.tsx`, which likewise hardcodes its role list
 * rather than pulling in the server package — this module re-declares the same
 * data locally for rendering the permission matrix and computing which
 * permissions the caller may grant.
 *
 * KEEP IN SYNC with `packages/rbac/src/index.ts`. The API is always the ultimate
 * authority: it re-validates every permission and re-enforces the
 * privilege-escalation guard server-side, so a drift here degrades the UI hint
 * (a checkbox shown/hidden or enabled/disabled) but can never let a caller grant
 * a permission the server would reject.
 */

export type PermissionKey =
  | 'org:read'
  | 'org:update'
  | 'members:manage'
  | 'projects:read'
  | 'projects:write'
  | 'workspaces:read'
  | 'workspaces:write'
  | 'billing:read'
  | 'billing:manage'
  | 'admin:read'
  | 'admin:write'
  | 'audit:export'
  | 'enterprise:read'
  | 'enterprise:write'
  | 'roles:manage'
  | 'scim:manage'
  | 'security:manage'
  | 'support:write'
  | 'usage:read';

/*
 * The full permission list, in display order, with human-friendly labels and a
 * grouping so the matrix stays scannable. Order and membership mirror the
 * `PermissionKey` union above.
 */
type PermissionDefinition = {
  key: PermissionKey;
  labelKey: OrganizationAccessKey;
  descriptionKey: OrganizationAccessKey;
};

type PermissionGroupDefinition = {
  groupKey: OrganizationAccessKey;
  permissions: PermissionDefinition[];
};

export type PermissionCatalogGroup = {
  group: string;
  permissions: Array<{ key: PermissionKey; label: string; description: string }>;
};

const PERMISSION_CATALOG_DEFINITION: PermissionGroupDefinition[] = [
  {
    groupKey: 'organizationAccess.group.organization',
    permissions: [
      {
        key: 'org:read',
        labelKey: 'organizationAccess.permission.orgRead.label',
        descriptionKey: 'organizationAccess.permission.orgRead.description',
      },
      {
        key: 'org:update',
        labelKey: 'organizationAccess.permission.orgUpdate.label',
        descriptionKey: 'organizationAccess.permission.orgUpdate.description',
      },
      {
        key: 'members:manage',
        labelKey: 'organizationAccess.permission.membersManage.label',
        descriptionKey: 'organizationAccess.permission.membersManage.description',
      },
      {
        key: 'roles:manage',
        labelKey: 'organizationAccess.permission.rolesManage.label',
        descriptionKey: 'organizationAccess.permission.rolesManage.description',
      },
    ],
  },
  {
    groupKey: 'organizationAccess.group.projectsWorkspaces',
    permissions: [
      {
        key: 'projects:read',
        labelKey: 'organizationAccess.permission.projectsRead.label',
        descriptionKey: 'organizationAccess.permission.projectsRead.description',
      },
      {
        key: 'projects:write',
        labelKey: 'organizationAccess.permission.projectsWrite.label',
        descriptionKey: 'organizationAccess.permission.projectsWrite.description',
      },
      {
        key: 'workspaces:read',
        labelKey: 'organizationAccess.permission.workspacesRead.label',
        descriptionKey: 'organizationAccess.permission.workspacesRead.description',
      },
      {
        key: 'workspaces:write',
        labelKey: 'organizationAccess.permission.workspacesWrite.label',
        descriptionKey: 'organizationAccess.permission.workspacesWrite.description',
      },
    ],
  },
  {
    groupKey: 'organizationAccess.group.billingUsage',
    permissions: [
      {
        key: 'billing:read',
        labelKey: 'organizationAccess.permission.billingRead.label',
        descriptionKey: 'organizationAccess.permission.billingRead.description',
      },
      {
        key: 'billing:manage',
        labelKey: 'organizationAccess.permission.billingManage.label',
        descriptionKey: 'organizationAccess.permission.billingManage.description',
      },
      {
        key: 'usage:read',
        labelKey: 'organizationAccess.permission.usageRead.label',
        descriptionKey: 'organizationAccess.permission.usageRead.description',
      },
    ],
  },
  {
    groupKey: 'organizationAccess.group.securityCompliance',
    permissions: [
      {
        key: 'security:manage',
        labelKey: 'organizationAccess.permission.securityManage.label',
        descriptionKey: 'organizationAccess.permission.securityManage.description',
      },
      {
        key: 'scim:manage',
        labelKey: 'organizationAccess.permission.scimManage.label',
        descriptionKey: 'organizationAccess.permission.scimManage.description',
      },
      {
        key: 'audit:export',
        labelKey: 'organizationAccess.permission.auditExport.label',
        descriptionKey: 'organizationAccess.permission.auditExport.description',
      },
    ],
  },
  {
    groupKey: 'organizationAccess.group.administration',
    permissions: [
      {
        key: 'admin:read',
        labelKey: 'organizationAccess.permission.adminRead.label',
        descriptionKey: 'organizationAccess.permission.adminRead.description',
      },
      {
        key: 'admin:write',
        labelKey: 'organizationAccess.permission.adminWrite.label',
        descriptionKey: 'organizationAccess.permission.adminWrite.description',
      },
      {
        key: 'enterprise:read',
        labelKey: 'organizationAccess.permission.enterpriseRead.label',
        descriptionKey: 'organizationAccess.permission.enterpriseRead.description',
      },
      {
        key: 'enterprise:write',
        labelKey: 'organizationAccess.permission.enterpriseWrite.label',
        descriptionKey: 'organizationAccess.permission.enterpriseWrite.description',
      },
      {
        key: 'support:write',
        labelKey: 'organizationAccess.permission.supportWrite.label',
        descriptionKey: 'organizationAccess.permission.supportWrite.description',
      },
    ],
  },
];

export function getPermissionCatalog(language?: string | null): PermissionCatalogGroup[] {
  const copy = getOrganizationAccessCopy(language);

  return PERMISSION_CATALOG_DEFINITION.map((group) => ({
    group: copy[group.groupKey],
    permissions: group.permissions.map((permission) => ({
      key: permission.key,
      label: copy[permission.labelKey],
      description: copy[permission.descriptionKey],
    })),
  }));
}

export const PERMISSION_CATALOG = getPermissionCatalog('en');

export const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_CATALOG.flatMap((g) => g.permissions.map((p) => p.key));

export function permissionLabel(key: string, language?: string | null): string {
  const copy = getOrganizationAccessCopy(language);

  const labels = Object.fromEntries(
    getPermissionCatalog(language).flatMap((group) =>
      group.permissions.map((permission) => [permission.key, permission.label] as const),
    ),
  ) as Record<PermissionKey, string>;

  return labels[key as PermissionKey] ?? copy['organizationAccess.permission.unknown'];
}

/*
 * Built-in role → permission map. Read-only in the UI (owner/admin/member/
 * editor/viewer). Mirrors `rolePermissions` in `packages/rbac/src/index.ts`.
 */
export const BUILTIN_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  owner: [
    'org:read',
    'org:update',
    'members:manage',
    'projects:read',
    'projects:write',
    'workspaces:read',
    'workspaces:write',
    'billing:read',
    'billing:manage',
    'admin:read',
    'admin:write',
    'audit:export',
    'enterprise:read',
    'enterprise:write',
    'roles:manage',
    'scim:manage',
    'security:manage',
    'support:write',
    'usage:read',
  ],
  admin: [
    'org:read',
    'members:manage',
    'projects:read',
    'projects:write',
    'workspaces:read',
    'workspaces:write',
    'billing:read',
    'audit:export',
    'enterprise:read',
    'enterprise:write',
    'roles:manage',
    'scim:manage',
    'security:manage',
    'support:write',
    'usage:read',
  ],
  member: [
    'org:read',
    'projects:read',
    'projects:write',
    'workspaces:read',
    'workspaces:write',
    'support:write',
    'usage:read',
  ],
  editor: [
    'org:read',
    'projects:read',
    'projects:write',
    'workspaces:read',
    'workspaces:write',
    'support:write',
    'usage:read',
  ],
  viewer: ['org:read', 'projects:read', 'workspaces:read', 'support:write', 'usage:read'],
};

export const BUILTIN_ROLE_ORDER = ['owner', 'admin', 'member', 'editor', 'viewer'] as const;

export function getBuiltinRoleLabels(language?: string | null): Record<string, string> {
  const copy = getOrganizationAccessCopy(language);

  return {
    owner: copy['organizationAccess.role.owner'],
    admin: copy['organizationAccess.role.admin'],
    member: copy['organizationAccess.role.member'],
    editor: copy['organizationAccess.role.editor'],
    viewer: copy['organizationAccess.role.viewer'],
  };
}

export const BUILTIN_ROLE_LABELS: Record<string, string> = getBuiltinRoleLabels('en');

/*
 * Resolve the effective permissions of a role key within an org, given the org's
 * custom roles. Built-in roles come from the static map; a custom role's
 * permissions are its stored list. Unknown keys resolve to no permissions.
 */
export function permissionsForRoleKey(
  roleKey: string,
  customRoles: Array<{ key: string; permissions: string[] }>,
): PermissionKey[] {
  if (BUILTIN_ROLE_PERMISSIONS[roleKey]) {
    return BUILTIN_ROLE_PERMISSIONS[roleKey];
  }

  const custom = customRoles.find((role) => role.key === roleKey);

  return (custom?.permissions ?? []) as PermissionKey[];
}
