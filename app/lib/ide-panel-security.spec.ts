import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isSecurityScheduleDue, vulnerabilitiesFromSecretScan } from './ide-panel-security';

describe('vulnerabilitiesFromSecretScan', () => {
  it('redacts the raw secret value in details', () => {
    const grepLine = 'src/config.ts:12:API_KEY=sk-live-super-secret-value';
    const [finding] = vulnerabilitiesFromSecretScan(grepLine, '2026-01-01T00:00:00.000Z');

    expect(finding.details).toBe('src/config.ts:12:API_KEY=***');
    expect(finding.details).not.toContain('sk-live-super-secret-value');
  });

  it('redacts colon-delimited secret values (YAML/JSON form)', () => {
    const grepLine = 'config/app.yml:5:api_secret: sk-live-colon-secret-value';
    const [finding] = vulnerabilitiesFromSecretScan(grepLine, '2026-01-01T00:00:00.000Z');

    expect(finding.details).toBe('config/app.yml:5:api_secret: ***');
    expect(finding.details).not.toContain('sk-live-colon-secret-value');
  });

  it('redacts JSON quoted colon-delimited secrets without leaking the value', () => {
    const grepLine = 'src/secrets.json:3:    "token": "ghp_abcdef1234567890"';
    const [finding] = vulnerabilitiesFromSecretScan(grepLine, '2026-01-01T00:00:00.000Z');

    expect(finding.details).not.toContain('ghp_abcdef1234567890');
    expect(finding.details.startsWith('src/secrets.json:3:    "token": ')).toBe(true);
    expect(finding.details.endsWith('***')).toBe(true);
  });

  it('never embeds the raw matched line in the finding id', () => {
    const secret = 'sk-live-super-secret-value';
    const grepLine = `src/config.ts:12:API_KEY=${secret}`;
    const [finding] = vulnerabilitiesFromSecretScan(grepLine, '2026-01-01T00:00:00.000Z');

    // The id must not leak the secret (or any portion of the matched value).
    expect(finding.id).not.toContain(secret);
    expect(finding.id).not.toContain('sk-live');
    expect(finding.id).not.toContain('API_KEY');

    // It should be a stable index + sha1-derived id.
    const expectedHash = createHash('sha1').update(grepLine).digest('hex').slice(0, 16);
    expect(finding.id).toBe(`secret:0:${expectedHash}`);
  });

  it('produces stable ids for the same line and distinct ids for different lines', () => {
    const line = 'src/a.ts:1:token=abc123';
    const a = vulnerabilitiesFromSecretScan(line, 't')[0];
    const b = vulnerabilitiesFromSecretScan(line, 't')[0];
    expect(a.id).toBe(b.id);

    const [, second] = vulnerabilitiesFromSecretScan(`${line}\nsrc/b.ts:2:secret=zzz`, 't');
    expect(second.id).not.toBe(a.id);
  });

  it('caps findings at 50 lines', () => {
    const output = Array.from({ length: 60 }, (_, i) => `f${i}.ts:1:password=p${i}`).join('\n');
    expect(vulnerabilitiesFromSecretScan(output, 't')).toHaveLength(50);
  });
});

describe('isSecurityScheduleDue', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');

  it('is false when schedule is disabled', () => {
    expect(
      isSecurityScheduleDue({ settings: { schedule: { enabled: false, nextRunAt: '2020-01-01T00:00:00.000Z' } } }, now),
    ).toBe(false);
  });

  it('is false when nextRunAt is missing', () => {
    expect(isSecurityScheduleDue({ settings: { schedule: { enabled: true, nextRunAt: null } } }, now)).toBe(false);
  });

  it('is false when nextRunAt is in the future', () => {
    expect(
      isSecurityScheduleDue({ settings: { schedule: { enabled: true, nextRunAt: '2026-06-02T00:00:00.000Z' } } }, now),
    ).toBe(false);
  });

  it('is true when an enabled scan is past due', () => {
    expect(
      isSecurityScheduleDue({ settings: { schedule: { enabled: true, nextRunAt: '2026-05-30T00:00:00.000Z' } } }, now),
    ).toBe(true);
  });

  it('is false for an invalid nextRunAt value', () => {
    expect(isSecurityScheduleDue({ settings: { schedule: { enabled: true, nextRunAt: 'not-a-date' } } }, now)).toBe(
      false,
    );
  });
});
