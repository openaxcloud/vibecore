import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { action } from './api.chat';
import {
  apiChatCatalog,
  formatApiChatCopy,
  getApiChatCopy,
  localizeApiChatAgentResultSummary,
  localizeApiChatConflictDescription,
  localizeApiChatModeError,
  localizeApiChatOrchestrationReason,
  localizeApiChatQuotaError,
  localizeApiChatRole,
  localizeApiChatRoleTitle,
  localizeApiChatStreamError,
  type ApiChatCopy,
} from '~/lib/i18n/catalogs/api-chat';

const interpolationTokens = (value: string) =>
  [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/gu)].map((match) => match[1]).sort();

function invalidChatRequest(headers: HeadersInit = {}): Request {
  return new Request('https://app.e-code.ai/api/chat', {
    method: 'POST',
    headers,
    body: '{',
  });
}

async function invokeInvalidChat(headers: HeadersInit = {}): Promise<Response> {
  return action({
    context: {},
    params: {},
    request: invalidChatRequest(headers),
  } as Parameters<typeof action>[0]);
}

describe('api.chat server i18n', () => {
  it('keeps complete EN/FR key and interpolation parity', () => {
    expect(Object.keys(apiChatCatalog.fr).sort()).toEqual(Object.keys(apiChatCatalog.en).sort());

    for (const key of Object.keys(apiChatCatalog.en) as Array<keyof typeof apiChatCatalog.en>) {
      expect(apiChatCatalog.en[key].trim().length, key).toBeGreaterThan(0);
      expect(apiChatCatalog.fr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(apiChatCatalog.fr[key]), key).toEqual(interpolationTokens(apiChatCatalog.en[key]));
    }
  });

  it('falls back to English when a French entry is absent and never exposes a key', () => {
    const { invalidJsonBody: _missing, ...incompleteFrench } = apiChatCatalog.fr;
    const copy = getApiChatCopy('fr', incompleteFrench satisfies Partial<ApiChatCopy>);

    expect(copy.invalidJsonBody).toBe(apiChatCatalog.en.invalidJsonBody);
    expect(copy.invalidJsonBody).not.toContain('invalidJsonBody');
    expect(getApiChatCopy('de').responseGenerated).toBe(apiChatCatalog.en.responseGenerated);
  });

  it('interpolates connector brands without translating or altering them', () => {
    const reason = formatApiChatCopy('fr', 'connectorReason', { provider: 'GitHub' });

    expect(reason).toContain('GitHub');
    expect(reason.match(/GitHub/gu)).toHaveLength(2);
    expect(reason).toContain('Connectez ce service');
  });

  it('localizes only system-owned agent role copy and preserves additional protocol data', () => {
    const role = {
      id: 'architect' as const,
      title: 'Architect',
      responsibility: 'System responsibility',
      output: 'Architecture notes',
    };

    expect(localizeApiChatRole('fr', role)).toEqual({
      ...role,
      title: 'Architecte',
      responsibility: apiChatCatalog.fr.roleArchitectResponsibility,
    });
    expect(localizeApiChatRoleTitle('fr', 'architect', 'Custom gateway title')).toBe('Architecte');
    expect(localizeApiChatRoleTitle('en', 'architect', 'Custom gateway title')).toBe('Custom gateway title');
  });

  it('masks technical details in French while retaining the English diagnostic contract', () => {
    const rawTechnicalError = 'connect ECONNREFUSED 10.0.0.4:443 secret=provider-key';

    expect(localizeApiChatStreamError('fr', 'UNKNOWN', rawTechnicalError)).toBe(apiChatCatalog.fr.streamUnknown);
    expect(localizeApiChatStreamError('fr', 'UNKNOWN', rawTechnicalError)).not.toContain('provider-key');
    expect(localizeApiChatStreamError('en', 'UNKNOWN', rawTechnicalError)).toBe(rawTechnicalError);
    expect(localizeApiChatModeError('fr', rawTechnicalError)).toBe(apiChatCatalog.fr.modeUnavailable);
    expect(localizeApiChatQuotaError('fr', 'USER_SPEND_LIMIT_REACHED', rawTechnicalError)).toBe(
      apiChatCatalog.fr.spendLimitReached,
    );
    expect(localizeApiChatOrchestrationReason('fr', `${rawTechnicalError} Falling back to single-model lanes.`)).toBe(
      apiChatCatalog.fr.orchestrationFallbackSingle,
    );
    expect(localizeApiChatAgentResultSummary('fr', 'failed', rawTechnicalError)).toBe(
      apiChatCatalog.fr.agentExecutionFailed,
    );
    expect(localizeApiChatAgentResultSummary('fr', 'complete', 'Résumé produit par l’agent')).toBe(
      'Résumé produit par l’agent',
    );
  });

  it('localizes consensus framing without changing file paths, role IDs, or model-authored claims', () => {
    expect(
      localizeApiChatConflictDescription('fr', {
        type: 'file-overlap',
        description: '2 sub-agents claim ownership of src/routes/$user.tsx',
        involvedRoles: ['frontend', 'backend'],
      }),
    ).toContain('src/routes/$user.tsx');
    expect(
      localizeApiChatConflictDescription('fr', {
        type: 'risk-disagreement',
        description: 'Risk "Do not translate USER_TOKEN" raised by 1 role(s) but ignored by 2 other(s)',
        involvedRoles: ['architect', 'backend', 'qa'],
      }),
    ).toContain('Do not translate USER_TOKEN');
    expect(
      localizeApiChatConflictDescription('fr', {
        type: 'role-failure',
        description: 'connect ECONNREFUSED 10.0.0.4:443 secret=provider-key',
        involvedRoles: ['devops'],
      }),
    ).toBe('1 rôle de sous-agent en échec : devops');
  });

  it('returns localized JSON errors with locale headers for Accept-Language detection', async () => {
    const response = await invokeInvalidChat({ 'Accept-Language': 'fr-FR, en;q=0.8' });

    expect(response.status).toBe(400);
    expect(response.headers.get('Content-Language')).toBe('fr');
    expect(response.headers.get('Vary')).toContain('Cookie');
    expect(response.headers.get('Vary')).toContain('Accept-Language');
    expect(response.headers.get('Set-Cookie')).toContain('vibecore-auto-lang=fr');
    expect(await response.json()).toEqual({ error: true, message: apiChatCatalog.fr.invalidJsonBody });
  });

  it('prioritizes the manual locale cookie and keeps English as the default', async () => {
    const french = await invokeInvalidChat({
      'Accept-Language': 'en-US',
      Cookie: 'vibecore-lang=fr',
    });

    const english = await invokeInvalidChat();

    expect(french.headers.get('Content-Language')).toBe('fr');
    expect(french.headers.get('Set-Cookie')).toBeNull();
    expect(await french.json()).toEqual({ error: true, message: apiChatCatalog.fr.invalidJsonBody });
    expect(english.headers.get('Content-Language')).toBe('en');
    expect(await english.json()).toEqual({ error: true, message: apiChatCatalog.en.invalidJsonBody });
  });

  it('leaves no hard-coded-copy scanner finding in the route', async () => {
    const { scanSource } = await import('../../scripts/i18n/source-scanner.mjs');
    const source = readFileSync(new URL('./api.chat.ts', import.meta.url), 'utf8');
    const result = scanSource(source, 'app/routes/api.chat.ts');

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
  });
});
