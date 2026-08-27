import { describe, expect, it } from 'vitest';

import { assertStateMachineNotPurged } from '../account-purge-state-machine-fence.js';
import { appPublicEnglish } from '../app-public-copy.js';

describe('account purge state-machine marker', () => {
  it.each([
    ['ACCOUNT_PURGE_COMPLETED', undefined],
    [undefined, 'ACCOUNT_PURGE_COMPLETED'],
    [undefined, appPublicEnglish('ACCOUNT_PURGE_COMPLETED')],
  ])('keeps legacy and localized persisted failures fenced', (errorCode, error) => {
    expect(() => assertStateMachineNotPurged(errorCode, error)).toThrowError(
      expect.objectContaining({ code: 'ACCOUNT_PURGE_COMPLETED', statusCode: 409 }),
    );
  });

  it('does not reject unrelated failures', () => {
    expect(() => assertStateMachineNotPurged(undefined, appPublicEnglish('GENERIC_REQUEST_FAILED'))).not.toThrow();
  });
});
