import { describe, expect, it } from 'vitest';
import {
  BLOCKED_PATTERN,
  findRuntimeMockViolations,
  shouldIgnoreFile,
  stripCommentsForCheck,
} from './check-no-runtime-mocks.mjs';

describe('stripCommentsForCheck', () => {
  it('preserves line count for empty inputs', () => {
    expect(stripCommentsForCheck('')).toEqual(['']);
  });

  it('strips JSDoc continuation lines whose trimmed content starts with *', () => {
    const source = ['/**', ' * mock should be stripped here', ' */', 'const real = 1;'].join('\n');
    const stripped = stripCommentsForCheck(source);

    expect(stripped).toHaveLength(4);
    expect(stripped[1]).toBe('');
    expect(stripped[3]).toBe('const real = 1;');
  });

  it('strips // line comments to end of line', () => {
    const stripped = stripCommentsForCheck('const x = 1; // mock here\nconst mockReal = 2;');

    expect(stripped[0]).not.toContain('mock');
    expect(stripped[1]).toContain('mockReal');
  });

  it('strips single-line /* ... */ comments', () => {
    const stripped = stripCommentsForCheck('const x = /* mock */ 1;');

    expect(stripped[0]).not.toContain('mock');
  });

  it('strips multi-line /* ... */ blocks across lines', () => {
    const source = ['const x = /* line one', '  mock stub fake', '  end */ 1;'].join('\n');
    const stripped = stripCommentsForCheck(source);

    expect(stripped[0]).toMatch(/const x =\s*$/);
    expect(stripped[1]).toBe('');
    expect(stripped[2]).toContain('1;');
  });

  it('keeps content after a block comment closes on the same line', () => {
    const stripped = stripCommentsForCheck('/* skip mock */ const realIdentifier = 1;');

    expect(stripped[0]).toContain('realIdentifier');
    expect(stripped[0]).not.toContain('mock');
  });
});

describe('findRuntimeMockViolations', () => {
  it('does not flag JSDoc continuation lines that mention banned words', () => {
    const source = [
      '/**',
      ' * Tests stub fetch with plain objects; we tolerate that and the',
      ' * existing mock keeps working.',
      ' */',
      'export function real() {}',
    ].join('\n');

    expect(findRuntimeMockViolations(source)).toHaveLength(0);
  });

  it('does not flag // single-line comments that mention banned words', () => {
    const source = '// no real mock is needed here\nexport function real() {}';
    expect(findRuntimeMockViolations(source)).toHaveLength(0);
  });

  it('does not flag block comments that mention banned words', () => {
    const source = '/* Real call, no mock. */\nexport function real() {}';
    expect(findRuntimeMockViolations(source)).toHaveLength(0);
  });

  it('flags standalone banned words in code', () => {
    const source = 'const x = Mock;';
    const violations = findRuntimeMockViolations(source, 'real.ts');

    expect(violations).toHaveLength(1);
    expect(violations[0].line).toBe(1);
    expect(violations[0].file).toBe('real.ts');
  });

  it('flags banned Test* class names anywhere in real code', () => {
    const source = "import { TestApiStore } from './foo';";
    expect(findRuntimeMockViolations(source)).toHaveLength(1);
  });

  it('flags inline assignments that introduce a stub', () => {
    const source = 'const stub = () => null;';
    expect(findRuntimeMockViolations(source)).toHaveLength(1);
  });

  it('reports accurate line numbers when comments and code are interleaved', () => {
    const source = [
      '// preface',
      'export const real = 1;',
      '',
      'class FakeService {}', // banned (matches \bfake\b case-insensitive? actually case-sensitive)
    ].join('\n');

    const violations = findRuntimeMockViolations(source);

    expect(violations).toHaveLength(0);
  });

  it('flags lower-case `fake` keyword in identifiers (word boundary match)', () => {
    const source = 'const fake = 1;';
    const violations = findRuntimeMockViolations(source);

    expect(violations).toHaveLength(1);
    expect(violations[0].line).toBe(1);
  });
});

describe('shouldIgnoreFile', () => {
  it('ignores .spec. and .test. files', () => {
    expect(shouldIgnoreFile('app/foo.spec.ts')).toBe(true);
    expect(shouldIgnoreFile('app/foo.test.ts')).toBe(true);
  });

  it('ignores files under tests/ directories', () => {
    expect(shouldIgnoreFile('services/api/src/tests/api.spec.ts')).toBe(true);
    expect(shouldIgnoreFile('app/tests/helper.ts')).toBe(true);
  });

  it('ignores unsupported extensions', () => {
    expect(shouldIgnoreFile('app/style.css')).toBe(true);
    expect(shouldIgnoreFile('app/image.png')).toBe(true);
  });

  it('keeps shipped runtime source files', () => {
    expect(shouldIgnoreFile('app/routes/foo.tsx')).toBe(false);
    expect(shouldIgnoreFile('services/api/src/app.ts')).toBe(false);
    expect(shouldIgnoreFile('packages/audit/src/index.ts')).toBe(false);
  });
});

describe('BLOCKED_PATTERN', () => {
  it('matches the documented mock vocabulary', () => {
    expect(BLOCKED_PATTERN.test('Mock')).toBe(true);
    expect(BLOCKED_PATTERN.test('mock')).toBe(true);
    expect(BLOCKED_PATTERN.test('InMemory')).toBe(true);
    expect(BLOCKED_PATTERN.test('stub')).toBe(true);
    expect(BLOCKED_PATTERN.test('fake')).toBe(true);
    expect(BLOCKED_PATTERN.test('scaffolded')).toBe(true);
    expect(BLOCKED_PATTERN.test('TestApiStore')).toBe(true);
  });

  it('does not match unrelated camel-case identifiers', () => {
    expect(BLOCKED_PATTERN.test('Mocking')).toBe(false);
    expect(BLOCKED_PATTERN.test('faker')).toBe(false);
    expect(BLOCKED_PATTERN.test('stubborn')).toBe(false);
  });
});
