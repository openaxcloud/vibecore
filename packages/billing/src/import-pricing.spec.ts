import { describe, expect, it } from 'vitest';
import { BUILTIN_IMPORT_PRICING, estimateImportCreditCents } from './import-pricing.js';

describe('import pricing (D4 phase 1)', () => {
  it('built-in card charges nothing — no measured price yet, mechanism only', () => {
    expect(BUILTIN_IMPORT_PRICING.baseCents).toBe(0);
    expect(BUILTIN_IMPORT_PRICING.perFileCents).toBe(0);
    expect(estimateImportCreditCents({ fileCount: 5_000 })).toBe(0);
  });

  it('prices base + per-file against an explicit card, ceil to whole cents', () => {
    const pricing = { version: 2, baseCents: 10, perFileCents: 0.5 };

    expect(estimateImportCreditCents({ fileCount: 0 }, pricing)).toBe(10);
    expect(estimateImportCreditCents({ fileCount: 3 }, pricing)).toBe(12); // 11.5 → 12
  });

  it('never returns negative and tolerates garbage file counts', () => {
    const pricing = { version: 2, baseCents: 5, perFileCents: 1 };

    expect(estimateImportCreditCents({ fileCount: -10 }, pricing)).toBe(5);
    expect(estimateImportCreditCents({ fileCount: Number.NaN }, pricing)).toBe(5);
    expect(estimateImportCreditCents({ fileCount: 2.9 }, pricing)).toBe(7); // floor(2.9)=2 files
  });
});
