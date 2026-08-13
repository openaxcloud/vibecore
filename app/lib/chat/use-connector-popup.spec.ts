import { describe, expect, it } from 'vitest';
import { shouldHandleConnectorMessage } from './use-connector-popup';

const resolvedGithub = {
  type: 'e-code.connector.connection.resolved',
  provider: 'github',
  userConnectionId: 'uc_1',
  accountLabel: 'octocat',
};

const failedGitlab = {
  type: 'e-code.connector.connection.failed',
  provider: 'gitlab',
  errorCode: 'OAUTH_DENIED',
};

describe('shouldHandleConnectorMessage', () => {
  it('ignores connector messages when the instance never launched (expectedProvider is null)', () => {
    /*
     * Regression: an idle instance must NOT react to another card's OAuth
     * completion. Previously a null expectedProvider short-circuited the guard
     * and let the message through.
     */
    expect(shouldHandleConnectorMessage(resolvedGithub, null)).toBe(false);
    expect(shouldHandleConnectorMessage(failedGitlab, null)).toBe(false);
  });

  it('handles a message that matches the launched provider', () => {
    expect(shouldHandleConnectorMessage(resolvedGithub, 'github')).toBe(true);
    expect(shouldHandleConnectorMessage(failedGitlab, 'gitlab')).toBe(true);
  });

  it('ignores a message for a different provider than the one launched', () => {
    expect(shouldHandleConnectorMessage(resolvedGithub, 'gitlab')).toBe(false);
    expect(shouldHandleConnectorMessage(failedGitlab, 'github')).toBe(false);
  });

  it('ignores messages that are not well-formed connector messages', () => {
    expect(shouldHandleConnectorMessage(null, 'github')).toBe(false);
    expect(shouldHandleConnectorMessage({ type: 'something.else', provider: 'github' }, 'github')).toBe(false);
    expect(shouldHandleConnectorMessage({ type: 'e-code.connector.connection.resolved' }, 'github')).toBe(false);
    expect(shouldHandleConnectorMessage({ type: 'e-code.connector.connection.resolved', provider: 42 }, 'github')).toBe(
      false,
    );
    expect(shouldHandleConnectorMessage('not-an-object', 'github')).toBe(false);
  });

  it('two concurrent instances for different providers do not cross-talk', () => {
    /*
     * A github card and a gitlab card both launched. A github resolution must
     * be consumed only by the github instance.
     */
    expect(shouldHandleConnectorMessage(resolvedGithub, 'github')).toBe(true);
    expect(shouldHandleConnectorMessage(resolvedGithub, 'gitlab')).toBe(false);
  });
});
