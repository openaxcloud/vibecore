import { describe, expect, it } from 'vitest';
import { includeSubmitterValue } from './git-form-data';

describe('includeSubmitterValue', () => {
  it('preserves the clicked commit intent in a manually reconstructed FormData', () => {
    const formData = new FormData();
    formData.set('message', 'Protect this work');

    includeSubmitterValue(formData, { name: 'intent', value: 'commit' } as unknown as EventTarget);

    expect(Object.fromEntries(formData.entries())).toEqual({
      message: 'Protect this work',
      intent: 'commit',
    });
  });

  it('distinguishes commit-and-push from commit', () => {
    const formData = new FormData();

    includeSubmitterValue(formData, { name: 'intent', value: 'commit-push' } as unknown as EventTarget);

    expect(formData.get('intent')).toBe('commit-push');
  });

  it('ignores a submitter without a named value', () => {
    const formData = new FormData();
    formData.set('intent', 'existing');

    expect(includeSubmitterValue(formData, { name: '', value: 'commit' } as unknown as EventTarget)).toBe(formData);
    expect(formData.get('intent')).toBe('existing');
  });
});
