import { describe, expect, it } from 'vitest';
import {
  buildConnectorContextPrompt,
  createConnectionRequestDataPart,
  DEFAULT_CONNECTOR_KEYWORD_CATALOG,
  detectConnectorNeeds,
  type ConnectorContextInput,
} from './connector-prompt';
import { isConnectorDataPart } from '~/lib/chat/connector-messages';

describe('detectConnectorNeeds', () => {
  it('matches whole-word keywords in the user prompt', () => {
    const result = detectConnectorNeeds({ prompt: 'Open a pull request on the repo for me' });

    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe('github');
    expect(result[0].matchedFrom).toBe('prompt');
    expect(result[0].matchedTokens).toContain('pull request');
  });

  it('matches code patterns in recent generated code', () => {
    const result = detectConnectorNeeds({
      recentCode: `import { Octokit } from "@octokit/rest";\nawait fetch('https://api.github.com/user');`,
    });

    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe('github');
    expect(result[0].matchedFrom).toBe('code');
    expect(result[0].matchedTokens).toEqual(expect.arrayContaining(['@octokit', 'api.github.com']));
  });

  it('reports `both` when prompt and code both reference the connector', () => {
    const result = detectConnectorNeeds({
      prompt: 'create a github issue',
      recentCode: `fetch('https://api.github.com/repos')`,
    });

    expect(result).toHaveLength(1);
    expect(result[0].matchedFrom).toBe('both');
  });

  it('returns an empty array when the prompt is unrelated', () => {
    const result = detectConnectorNeeds({ prompt: 'Render a chart with the sales data.' });
    expect(result).toEqual([]);
  });

  it('ignores keyword substrings outside word boundaries', () => {
    const result = detectConnectorNeeds({ prompt: 'researching repointment options' });
    expect(result).toEqual([]);
  });

  it('accepts a custom catalog so the test suite is decoupled from the seed', () => {
    const result = detectConnectorNeeds({
      prompt: 'send a slack message',
      catalog: [
        {
          provider: 'slack',
          displayName: 'Slack',
          logoUrl: '/integrations/logos/slack.svg',
          defaultScopes: [{ scope: 'chat:write', label: 'Post messages' }],
          keywords: ['slack', 'send message'],
        },
      ],
    });

    expect(result.map((row) => row.provider)).toEqual(['slack']);
  });
});

describe('buildConnectorContextPrompt', () => {
  const baseInput: ConnectorContextInput = {
    linkedToProject: [
      {
        provider: 'github',
        displayName: 'GitHub',
        linkedToProject: true,
        externalAccountLabel: 'octocat',
        scopes: ['repo', 'read:user'],
      },
    ],
    availableOnAccount: [
      {
        provider: 'notion',
        displayName: 'Notion',
        linkedToProject: false,
        accountConnectionId: 'uconn_notion_1',
        externalAccountLabel: 'workspace-7',
        scopes: ['read'],
      },
    ],
    notConnected: [
      {
        provider: 'slack',
        displayName: 'Slack',
        linkedToProject: false,
        scopes: [],
      },
    ],
  };

  it('lists each section with the right header and emits an instruction line', () => {
    const prompt = buildConnectorContextPrompt(baseInput);

    expect(prompt).toContain('## Available connectors');
    expect(prompt).toContain('Linked to this project:');
    expect(prompt).toContain('GitHub (github) — connected as octocat');
    expect(prompt).toContain('Connected on the user account but not linked to this project:');
    expect(prompt).toContain('Notion (notion) — connected as workspace-7');
    expect(prompt).toContain('uconn_notion_1');
    expect(prompt).toContain('Not connected yet:');
    expect(prompt).toContain('Slack (slack) — emit a connection_request');
    expect(prompt).toContain('Never reference raw tokens');
  });

  it('omits sections that have no entries', () => {
    const prompt = buildConnectorContextPrompt({
      linkedToProject: baseInput.linkedToProject,
      availableOnAccount: [],
      notConnected: [],
    });

    expect(prompt).not.toContain('Connected on the user account');
    expect(prompt).not.toContain('Not connected yet:');
  });
});

describe('createConnectionRequestDataPart', () => {
  it('produces a data part the chat type guard accepts', () => {
    const dataPart = createConnectionRequestDataPart({
      messageId: 'msg_1',
      provider: 'github',
      reason: 'Needed to create the repo you asked for.',
      resumeToken: 'resume_abc',
    });

    expect(isConnectorDataPart(dataPart)).toBe(true);
    expect(dataPart.payload.kind).toBe('connection_request');

    if (dataPart.payload.kind === 'connection_request') {
      expect(dataPart.payload.provider).toBe('github');
      expect(dataPart.payload.providerDisplayName).toBe('GitHub');
      expect(dataPart.payload.providerLogoUrl).toBe('/integrations/logos/github.svg');
      expect(dataPart.payload.scopes.map((scope) => scope.scope)).toEqual([
        'repo',
        'read:org',
        'read:user',
        'user:email',
      ]);
    }
  });

  it('overrides default scopes when caller passes them explicitly', () => {
    const dataPart = createConnectionRequestDataPart({
      messageId: 'msg_2',
      provider: 'github',
      reason: 'reason',
      resumeToken: 'resume_xyz',
      scopes: [{ scope: 'repo', label: 'Just repo' }],
    });

    if (dataPart.payload.kind === 'connection_request') {
      expect(dataPart.payload.scopes).toEqual([{ scope: 'repo', label: 'Just repo' }]);
    }
  });

  it('forwards existingAccountConnections so the chat can show "Use existing connection"', () => {
    const dataPart = createConnectionRequestDataPart({
      messageId: 'msg_3',
      provider: 'github',
      reason: 'reason',
      resumeToken: 'resume_xyz',
      existingAccountConnections: [
        { userConnectionId: 'uconn_x', accountLabel: 'octocat', scopes: ['repo'], scopesMatch: true },
      ],
    });

    if (dataPart.payload.kind === 'connection_request') {
      expect(dataPart.payload.existingAccountConnections).toHaveLength(1);
      expect(dataPart.payload.existingAccountConnections?.[0].accountLabel).toBe('octocat');
    }
  });

  it('throws on an unknown provider rather than emitting a malformed card', () => {
    expect(() =>
      createConnectionRequestDataPart({
        messageId: 'msg_4',
        provider: 'not_a_real_provider',
        reason: 'reason',
        resumeToken: 'resume_x',
      }),
    ).toThrow(/Unknown provider/);
  });

  it('DEFAULT_CONNECTOR_KEYWORD_CATALOG covers at least the github connector', () => {
    expect(DEFAULT_CONNECTOR_KEYWORD_CATALOG.find((row) => row.provider === 'github')).toBeTruthy();
  });
});
