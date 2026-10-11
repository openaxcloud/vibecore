import { beforeEach, describe, expect, it } from 'vitest';

import { consumeDeployPanelView, requestDeployPanelView, requestedDeployPanelView } from './deploy-panel-view';

describe('deploy panel view request', () => {
  beforeEach(() => {
    requestedDeployPanelView.set(undefined);
  });

  it('hands the requested tab to the next reader', () => {
    requestDeployPanelView('domains');
    expect(consumeDeployPanelView()).toBe('domains');
  });

  /**
   * The one-shot contract is the whole point. If the request survived being
   * read, the Deployments panel would snap back to Domains every time it
   * re-rendered and the user could never leave that tab.
   */
  it('is consumed exactly once', () => {
    requestDeployPanelView('domains');

    expect(consumeDeployPanelView()).toBe('domains');
    expect(consumeDeployPanelView()).toBeUndefined();
    expect(requestedDeployPanelView.get()).toBeUndefined();
  });

  it('reports nothing when no door asked for a tab, so the current one is kept', () => {
    expect(consumeDeployPanelView()).toBeUndefined();
  });

  it('lets a later request supersede one that was never read', () => {
    requestDeployPanelView('domains');
    requestDeployPanelView('manage');

    expect(consumeDeployPanelView()).toBe('manage');
    expect(consumeDeployPanelView()).toBeUndefined();
  });
});
