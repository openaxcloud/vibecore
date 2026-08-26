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

export const rolePermissions: Record<string, PermissionKey[]> = {
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
  // A guest exists only through an explicit resource grant or GUEST
  // membership. It cannot enumerate the organization or mutate a project.
  guest: ['projects:read', 'workspaces:read'],
};

export function hasPermission(roleKey: string, permission: PermissionKey) {
  return rolePermissions[roleKey]?.includes(permission) ?? false;
}

export function requirePermission(roleKey: string, permission: PermissionKey) {
  if (!hasPermission(roleKey, permission)) {
    const error = new Error(`Missing permission: ${permission}`);
    Object.assign(error, { statusCode: 403, code: 'RBAC_FORBIDDEN' });
    throw error;
  }
}
