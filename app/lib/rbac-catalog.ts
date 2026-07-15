import { humanizeTechnicalIdentifier } from './user-facing-labels';

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
export const PERMISSION_CATALOG: Array<{
  group: string;
  permissions: Array<{ key: PermissionKey; label: string; description: string }>;
}> = [
  {
    group: 'Organization',
    permissions: [
      { key: 'org:read', label: 'Read organization', description: 'View organization settings and details.' },
      { key: 'org:update', label: 'Update organization', description: 'Edit organization name and settings.' },
      { key: 'members:manage', label: 'Manage members', description: 'Invite, remove and re-role members.' },
      { key: 'roles:manage', label: 'Manage roles', description: 'Create and edit custom roles.' },
    ],
  },
  {
    group: 'Projects & workspaces',
    permissions: [
      { key: 'projects:read', label: 'Read projects', description: 'View projects in the organization.' },
      { key: 'projects:write', label: 'Write projects', description: 'Create and edit projects.' },
      { key: 'workspaces:read', label: 'Read workspaces', description: 'View running workspaces.' },
      { key: 'workspaces:write', label: 'Write workspaces', description: 'Create and control workspaces.' },
    ],
  },
  {
    group: 'Billing & usage',
    permissions: [
      { key: 'billing:read', label: 'Read billing', description: 'View invoices and billing details.' },
      { key: 'billing:manage', label: 'Manage billing', description: 'Change plan and payment methods.' },
      { key: 'usage:read', label: 'Read usage', description: 'View usage and quota metrics.' },
    ],
  },
  {
    group: 'Security & compliance',
    permissions: [
      { key: 'security:manage', label: 'Manage security', description: 'Configure SSO, SAML and security policy.' },
      { key: 'scim:manage', label: 'Manage SCIM', description: 'Issue and rotate SCIM provisioning tokens.' },
      { key: 'audit:export', label: 'Export audit logs', description: 'Export security-relevant audit events.' },
    ],
  },
  {
    group: 'Administration',
    permissions: [
      { key: 'admin:read', label: 'Admin read', description: 'View administrative console data.' },
      { key: 'admin:write', label: 'Admin write', description: 'Perform administrative actions.' },
      { key: 'enterprise:read', label: 'Enterprise read', description: 'View enterprise configuration.' },
      { key: 'enterprise:write', label: 'Enterprise write', description: 'Edit enterprise configuration.' },
      { key: 'support:write', label: 'Contact support', description: 'Open and reply to support requests.' },
    ],
  },
];

export const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_CATALOG.flatMap((g) => g.permissions.map((p) => p.key));

const PERMISSION_LABELS: Record<PermissionKey, string> = Object.fromEntries(
  PERMISSION_CATALOG.flatMap((g) => g.permissions.map((p) => [p.key, p.label] as const)),
) as Record<PermissionKey, string>;

export function permissionLabel(key: string): string {
  return PERMISSION_LABELS[key as PermissionKey] ?? humanizeTechnicalIdentifier(key, 'Unknown permission');
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

export const BUILTIN_ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  editor: 'Editor',
  viewer: 'Viewer',
};

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
