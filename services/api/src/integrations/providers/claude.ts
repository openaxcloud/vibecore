import { createHash } from 'node:crypto';

import {
  ConnectorProviderError,
  type ConnectorApiKeyTestResult,
  type ConnectorProvider,
  type ConnectorUserInfo,
} from './types.js';

const CLAUDE_MODELS_URL = 'https://api.anthropic.com/v1/models?limit=1';

type ClaudeModelsResponse = {
  data?: Array<{ id?: string; display_name?: string }>;
};

async function callClaudeModels(accessToken: string, fetchImpl?: typeof fetch): Promise<Response> {
  const impl = fetchImpl ?? fetch;

  return impl(CLAUDE_MODELS_URL, {
    method: 'GET',
    headers: {
      'x-api-key': accessToken,
      'anthropic-version': '2023-06-01',
      accept: 'application/json',
      'user-agent': 'e-code-connector-proxy',
    },
  });
}

function parseClaudeAccess(payload: ClaudeModelsResponse, accessToken: string): ConnectorUserInfo | null {
  const firstModel = payload.data?.find((model) => typeof model.id === 'string' && model.id.length > 0);

  if (!firstModel?.id) {
    return null;
  }

  /*
   * Anthropic's API-key API does not expose the owning account identity. A
   * one-way digest gives repeated configuration of the same key a stable
   * UserConnection identity without persisting or returning any key fragment.
   */
  const credentialDigest = createHash('sha256').update(accessToken).digest('hex').slice(0, 32);

  return {
    externalAccountId: `anthropic-key-${credentialDigest}`,
    externalAccountLabel: firstModel.display_name ?? firstModel.id,
  };
}

export const claudeConnector: ConnectorProvider = {
  provider: 'claude',
  authType: 'api_key',

  async fetchUserInfo({ accessToken, fetchImpl }) {
    const response = await callClaudeModels(accessToken, fetchImpl);

    if (!response.ok) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_USER_INFO_FAILED',
        httpStatus: response.status,
      });
    }

    let payload: ClaudeModelsResponse;

    try {
      payload = (await response.json()) as ClaudeModelsResponse;
    } catch {
      throw new ConnectorProviderError({ code: 'PROVIDER_RESPONSE_MALFORMED' });
    }

    const userInfo = parseClaudeAccess(payload, accessToken);

    if (!userInfo) {
      throw new ConnectorProviderError({ code: 'PROVIDER_RESPONSE_MALFORMED' });
    }

    return userInfo;
  },

  async testApiKey({ apiKey, fetchImpl }): Promise<ConnectorApiKeyTestResult> {
    let response: Response;

    try {
      response = await callClaudeModels(apiKey, fetchImpl);
    } catch {
      return { ok: false, code: 'PROVIDER_UNREACHABLE' };
    }

    if (response.status === 401) {
      return { ok: false, code: 'API_KEY_INVALID' };
    }

    if (response.status === 403) {
      return { ok: false, code: 'API_KEY_INSUFFICIENT_SCOPE' };
    }

    if (!response.ok) {
      return { ok: false, code: 'PROVIDER_UNREACHABLE' };
    }

    let payload: ClaudeModelsResponse;

    try {
      payload = (await response.json()) as ClaudeModelsResponse;
    } catch {
      return { ok: false, code: 'PROVIDER_RESPONSE_MALFORMED' };
    }

    const userInfo = parseClaudeAccess(payload, apiKey);

    return userInfo ? { ok: true, userInfo } : { ok: false, code: 'PROVIDER_RESPONSE_MALFORMED' };
  },
};
