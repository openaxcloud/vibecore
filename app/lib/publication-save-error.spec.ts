import { describe, expect, it } from 'vitest';
import { PublicationSaveError, type PublicationSaveCode } from './publication-save-error';

describe('publication error translation boundary', () => {
  it.each<PublicationSaveCode>([
    'PUBLICATION_SAVE_WORKSPACE_CHANGED',
    'PUBLICATION_SAVE_SOURCE_MISSING',
    'PUBLICATION_SAVE_LEGACY_TARGET',
    'PUBLICATION_SAVE_SCOPE_CHANGED',
    'PUBLICATION_FILES_NOT_SAVED',
  ])('retains internal %s without presenting it as human-readable copy', (code) => {
    const error = new PublicationSaveError(code);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PublicationSaveError);
    expect(error.code).toBe(code);
    expect(error.message).toBe('');
  });
});
