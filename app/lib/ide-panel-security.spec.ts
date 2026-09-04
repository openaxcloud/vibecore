import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  extractGrepMatchLines,
  isGrepMatchLine,
  isSecurityScheduleDue,
  vulnerabilitiesFromSecretScan,
} from './ide-panel-security';

/*
 * BUG-SEC-SCANNER-PHANTOM-FINDING: BusyBox grep rejecting an option prints this
 * to stderr, which the runtime merges into the captured scan output. None of it
 * may ever become a security finding.
 */
const BUSYBOX_GREP_NOISE = [
  'grep: unrecognized option: exclude-dir=node_modules',
  'BusyBox v1.36.1 (2026-01-05 12:00:00 UTC) multi-call binary.',
  'Usage: grep [-HhnlLoqvsrRiwFE] [-m N] [-A/B/C N] PATTERN/-e PATTERN.../-f FILE [FILE]...',
  '',
  'Search for PATTERN in FILEs (or stdin)',
  '',
  "\t-H\tAdd 'filename:' prefix",
  '\t-h\tDo not add prefix',
  '\t-n\tAdd line numbers',
  '\t-l\tShow only names of files that match',
  '\t-q\tQuiet. Return 0 if PATTERN is found, 1 otherwise',
  '\t-E\tPATTERN is an extended regexp',
  'sh: some-tool: not found',
  'Binary file ./assets/logo.png matches',
].join('\n');

describe('grep scan output filtering (BUG-SEC-SCANNER-PHANTOM-FINDING)', () => {
  it('recognizes real grep match lines and rejects tool noise', () => {
    expect(isGrepMatchLine('./src/config.ts:12:API_KEY=abc')).toBe(true);
    expect(isGrepMatchLine('src/app/main.tsx:3:eval(userInput)')).toBe(true);

    expect(isGrepMatchLine('Usage: grep [-HhnlLoqvsrRiwFE] [-m N] PATTERN')).toBe(false);
    expect(isGrepMatchLine('grep: unrecognized option: exclude-dir=node_modules')).toBe(false);
    expect(isGrepMatchLine('sh: grep: not found')).toBe(false);
    expect(isGrepMatchLine('Binary file ./assets/logo.png matches')).toBe(false);
  });

  it('drops the entire BusyBox usage/error output', () => {
    expect(extractGrepMatchLines(BUSYBOX_GREP_NOISE)).toEqual([]);
  });

  it('keeps only match-format lines from mixed output', () => {
    const output = `${BUSYBOX_GREP_NOISE}\n./src/a.ts:7:password=hunter2\n./src/b.ts:9:token=abc`;

    expect(extractGrepMatchLines(output)).toEqual(['./src/a.ts:7:password=hunter2', './src/b.ts:9:token=abc']);
  });

  it('produces zero secret findings from a grep usage/error dump', () => {
    expect(vulnerabilitiesFromSecretScan(BUSYBOX_GREP_NOISE, '2026-01-01T00:00:00.000Z')).toEqual([]);
  });

  it('still reports real matches when noise and matches are interleaved', () => {
    const output = `grep: warning: something\n./src/config.ts:12:API_KEY=sk-live-x\nUsage: grep [-HhnlLoqvsrRiwFE] [-m N]`;
    const findings = vulnerabilitiesFromSecretScan(output, '2026-01-01T00:00:00.000Z');

    expect(findings).toHaveLength(1);
    expect(findings[0].details).toBe('./src/config.ts:12:API_KEY=***');
  });
});

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
