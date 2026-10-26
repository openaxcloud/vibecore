import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { requiredSpecs, summarizeCiTestReport, validateCiDatabaseTarget } from './database-restore-ci.js';

const service = 'postgresql://vibecore:vibecore@127.0.0.1:55432/vibecore';

describe('restore PostgreSQL CI preflight (no database connection)', () => {
  it('accepts only the explicitly configured CI service', () => {
    expect(validateCiDatabaseTarget({ CI: 'true', DATABASE_URL: service }).port).toBe('55432');
  });

  it.each([
    undefined,
    '',
    service.replace('127.0.0.1', 'localhost'),
    service.replace('127.0.0.1', '127.1'),
    service.replace('127.0.0.1', 'database.example.com'),
    service.replace('55432', '55439'),
    service.replace('55432', '5432'),
    service.replace(/\/vibecore$/, '/customer'),
    service.replace(':vibecore@', ':other@'),
    service.replace('vibecore:', 'admin:'),
    `${service}?host=database.example.com`,
    `${service}?sslmode=require`,
    `${service}#ignored`,
    ` ${service}`,
    'not-a-database-url',
  ])('refuses unexpected endpoints or connection options before any client exists (%#)', (url) => {
    expect(() => validateCiDatabaseTarget({ CI: 'true', DATABASE_URL: url })).toThrow(
      'RESTORE_CI_SERVICE_CONFIGURATION_REFUSED',
    );
  });

  it.each([undefined, 'false', '1'])('requires the explicit CI mode (%#)', (ci) => {
    expect(() => validateCiDatabaseTarget({ CI: ci, DATABASE_URL: service })).toThrow(
      'RESTORE_CI_SERVICE_CONFIGURATION_REFUSED',
    );
  });
});

function completeReport() {
  return {
    success: true,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    numTotalTests: Number(requiredSpecs.length),
    numPassedTests: Number(requiredSpecs.length),
    testResults: requiredSpecs.map((file) => ({
      name: resolve('services/api', file),
      status: 'passed',
      assertionResults: [{ fullName: `real PostgreSQL ${file}`, status: 'passed' }],
    })),
  };
}

describe('restore CI report completeness (report parsing only)', () => {
  it('requires the consumer registry PostgreSQL suite', () => {
    expect(requiredSpecs).toContain('src/tests/database-restore-consumer-registry.spec.ts');
  });

  it.each(['absent', 'skipped', 'pending', 'failed', 'todo'])(
    'rejects a consumer registry suite that is %s',
    (status) => {
      const report = completeReport();
      const index = requiredSpecs.indexOf('src/tests/database-restore-consumer-registry.spec.ts');
      expect(index).toBeGreaterThanOrEqual(0);

      if (status === 'absent') {
        report.testResults.splice(index, 1);
        report.numTotalTests--;
        report.numPassedTests--;
      } else {
        report.testResults[index].assertionResults[0].status = status;
      }

      expect(summarizeCiTestReport(report).valid).toBe(false);
    },
  );

  it('accepts the complete set of successful assertions', () => {
    expect(summarizeCiTestReport(completeReport()).valid).toBe(true);
  });

  it.each(['skipped', 'pending', 'todo', 'failed'])(
    'rejects a %s assertion even if Vitest exits successfully',
    (status) => {
      const report = completeReport();
      report.testResults[0].assertionResults[0].status = status;
      const summary = summarizeCiTestReport(report);
      expect(summary.valid).toBe(false);
      expect(summary.files[0].failedTests).toEqual([{ name: `real PostgreSQL ${requiredSpecs[0]}`, status }]);
    },
  );

  it('rejects an absent required file', () => {
    const report = completeReport();
    report.testResults.pop();
    expect(summarizeCiTestReport(report).valid).toBe(false);
  });

  it('rejects duplicate results and an empty required file', () => {
    const duplicated = completeReport();
    duplicated.testResults[1] = duplicated.testResults[0];
    expect(summarizeCiTestReport(duplicated).valid).toBe(false);
    const empty = completeReport();
    empty.testResults[1].assertionResults = [];
    expect(summarizeCiTestReport(empty).valid).toBe(false);
  });

  it('rejects suite hooks failing despite successful assertions', () => {
    const report = completeReport();
    report.testResults[0].status = 'failed';
    report.numFailedTestSuites = 1;
    expect(summarizeCiTestReport(report).valid).toBe(false);
  });

  it('rejects missing or inconsistent global counters', () => {
    const report = completeReport();
    report.numPassedTests = 1;
    expect(summarizeCiTestReport(report).valid).toBe(false);
    expect(summarizeCiTestReport({ testResults: completeReport().testResults }).valid).toBe(false);
    expect(summarizeCiTestReport(null).valid).toBe(false);
  });

  it('prints test names and statuses without raw exception data or dynamic credentials', () => {
    const report = completeReport();
    report.testResults[0].assertionResults[0] = { fullName: `connection ${service}`, status: 'failed' };
    const summary = summarizeCiTestReport({
      ...report,
      rawError: service,
      testResults: report.testResults.map((result) => ({ ...result, message: service })),
    });
    expect(summary.files[0].failedTests[0].name).toBe('(test name redacted)');
    expect(JSON.stringify(summary)).not.toContain(service);
  });
});
