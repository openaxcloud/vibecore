import type { AgentSkillAuditEventCursor } from './store.js';

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 1024;
const MAX_EVENT_ID_LENGTH = 256;

interface SerializedAgentSkillAuditEventCursor {
  v: typeof CURSOR_VERSION;
  createdAt: string;
  id: string;
}

function invalidCursor(): Error & { code: string; statusCode: number } {
  return Object.assign(new Error('Invalid Agent Skill audit event cursor.'), {
    code: 'AGENT_SKILL_AUDIT_CURSOR_INVALID',
    statusCode: 400,
  });
}

function normalizedCursor(value: unknown): SerializedAgentSkillAuditEventCursor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidCursor();
  }

  const candidate = value as Partial<SerializedAgentSkillAuditEventCursor>;
  const keys = Object.keys(candidate).sort();

  if (
    keys.length !== 3 ||
    keys[0] !== 'createdAt' ||
    keys[1] !== 'id' ||
    keys[2] !== 'v' ||
    candidate.v !== CURSOR_VERSION ||
    typeof candidate.createdAt !== 'string' ||
    typeof candidate.id !== 'string' ||
    candidate.id.length < 1 ||
    candidate.id.length > MAX_EVENT_ID_LENGTH ||
    candidate.id.trim() !== candidate.id
  ) {
    throw invalidCursor();
  }

  const createdAt = new Date(candidate.createdAt);

  if (Number.isNaN(createdAt.getTime())) {
    throw invalidCursor();
  }

  return {
    v: CURSOR_VERSION,
    createdAt: createdAt.toISOString(),
    id: candidate.id,
  };
}

/** Encode a transport-safe opaque cursor without embedding tenant data. */
export function encodeAgentSkillAuditEventCursor(cursor: AgentSkillAuditEventCursor): string {
  const serialized = normalizedCursor({ v: CURSOR_VERSION, ...cursor });
  return Buffer.from(JSON.stringify(serialized), 'utf8').toString('base64url');
}

/**
 * Decode and validate an untrusted HTTP cursor. The store still applies the
 * project/artifact scope, so a cursor can never broaden the tenant boundary.
 */
export function decodeAgentSkillAuditEventCursor(value: string): AgentSkillAuditEventCursor {
  if (value.length < 1 || value.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw invalidCursor();
  }

  let decoded: Buffer;

  try {
    decoded = Buffer.from(value, 'base64url');
  } catch {
    throw invalidCursor();
  }

  // Node's decoder is intentionally permissive. Re-encoding ensures callers
  // cannot smuggle padded or otherwise non-canonical representations.
  if (decoded.toString('base64url') !== value) {
    throw invalidCursor();
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(decoded.toString('utf8'));
  } catch {
    throw invalidCursor();
  }

  const cursor = normalizedCursor(parsed);
  return { createdAt: cursor.createdAt, id: cursor.id };
}
