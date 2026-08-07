import { describe, expect, it } from 'vitest';

import { formatDiskInfoCopy, getDiskInfoCopy } from './disk-info';

describe('disk information copy', () => {
  it('falls back to English and resolves French variants', () => {
    expect(getDiskInfoCopy('de').unknownFilesystem).toBe('Unknown');
    expect(getDiskInfoCopy('fr-FR').unknownFilesystem).toBe('Inconnu');
    expect(getDiskInfoCopy('fr').genericError).toContain('Impossible');
  });

  it('interpolates only known values', () => {
    expect(formatDiskInfoCopy(getDiskInfoCopy('fr').unsupportedPlatform, { platform: 'aix' })).toContain('aix');
  });
});
