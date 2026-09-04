import { describe, expect, it } from 'vitest';
import { decodeAgentSkillAuditEventCursor, encodeAgentSkillAuditEventCursor } from './agent-skill-audit-pagination.js';

describe('Agent Skill audit event cursors', () => {
  it('round-trips the deterministic createdAt/id keyset', () => {
    const cursor = {
      createdAt: '2026-07-15T10:11:12.123Z',
      id: 'event_01JZZZZZZZZZZZZZZZZZZZZZZZ',
    };

    expect(decodeAgentSkillAuditEventCursor(encodeAgentSkillAuditEventCursor(cursor))).toEqual(cursor);
  });

  it.each([
    '',
    'not+base64url',
    Buffer.from('not-json').toString('base64url'),
    Buffer.from(JSON.stringify({ v: 2, createdAt: '2026-07-15T00:00:00.000Z', id: 'event_1' })).toString('base64url'),
    Buffer.from(JSON.stringify({ v: 1, createdAt: 'invalid', id: 'event_1' })).toString('base64url'),
    Buffer.from(
      JSON.stringify({ v: 1, createdAt: '2026-07-15T00:00:00.000Z', id: 'event_1', projectId: 'other' }),
    ).toString('base64url'),
  ])('rejects malformed, non-canonical, or unsupported cursors (%s)', (value) => {
    expect(() => decodeAgentSkillAuditEventCursor(value)).toThrow(
      expect.objectContaining({ code: 'AGENT_SKILL_AUDIT_CURSOR_INVALID', statusCode: 400 }),
    );
  });
});
