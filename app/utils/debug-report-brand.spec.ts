import { describe, expect, it } from 'vitest';
import { debugReportFilename, debugReportSummaryHeader, DEBUG_REPORT_BRAND } from './debug-report-brand';

describe('debug report brand', () => {
  it('builds an E-Code-branded filename and never leaks the upstream codename', () => {
    const filename = debugReportFilename(new Date('2026-06-24T08:30:00.000Z'));
    expect(filename).toBe('ecode-debug-2026-06-24.txt');
    expect(filename.toLowerCase()).not.toContain('bolt');
  });

  it('builds an E-Code-branded summary header and never leaks the upstream codename', () => {
    const header = debugReportSummaryHeader('en');
    expect(header).toBe('=== E-CODE DEBUG LOG SUMMARY ===');
    expect(header.toLowerCase()).not.toContain('bolt');
  });

  it('localizes the summary header without translating the E-Code brand', () => {
    expect(debugReportSummaryHeader('fr')).toBe('=== SYNTHÈSE DU JOURNAL DE DIAGNOSTIC E-CODE ===');
  });

  it('exposes the product brand as a single constant', () => {
    expect(DEBUG_REPORT_BRAND).toBe('E-Code');
  });
});
