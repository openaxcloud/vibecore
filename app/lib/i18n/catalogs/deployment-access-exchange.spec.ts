import { describe, expect, it } from 'vitest';

import { deploymentAccessExchangeCopy } from './deployment-access-exchange';

describe('deployment access exchange copy', () => {
  it('keeps the complete English and French contract in parity', () => {
    expect(Object.keys(deploymentAccessExchangeCopy.fr).sort()).toEqual(
      Object.keys(deploymentAccessExchangeCopy.en).sort(),
    );
    expect(deploymentAccessExchangeCopy.fr.exchangeUnavailable).toContain('indisponible');
    expect(Object.values(deploymentAccessExchangeCopy.fr).join(' ')).not.toMatch(
      /\b(?:opening|deployment|continue|invalid)\b/iu,
    );
  });
});
