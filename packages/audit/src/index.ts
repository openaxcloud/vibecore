export interface AuditEvent {
  organizationId?: string;
  actorUserId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export interface AuditSink {
  record(event: AuditEvent): Promise<void>;
}

export const criticalAuditActions = new Set([
  'auth.login',
  'auth.logout',
  'org.create',
  'org.update',
  'member.add',
  'member.updateRole',
  'project.create',
  'project.update',
  'workspace.create',
  'workspace.stop',
  'snapshot.create',
  'billing.update',
  'admin.update',
  'apikey.create',
]);

export function redactAuditMetadata(metadata: Record<string, unknown> = {}) {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    redacted[key] = /secret|token|password|key/i.test(key) ? '[redacted]' : value;
  }

  return redacted;
}
