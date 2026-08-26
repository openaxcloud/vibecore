import {
  ConnectorProviderError,
  type ConnectorApiKeyTestResult,
  type ConnectorProvider,
  type ConnectorUserInfo,
} from './types.js';

const FIGMA_ME_URL = 'https://api.figma.com/v1/me';

type FigmaMeResponse = {
  id?: string;
  email?: string;
  handle?: string;
};

async function callFigmaMe(accessToken: string, fetchImpl?: typeof fetch): Promise<Response> {
  const impl = fetchImpl ?? fetch;

  return impl(FIGMA_ME_URL, {
    method: 'GET',
    headers: {
      'x-figma-token': accessToken,
      accept: 'application/json',
      'user-agent': 'e-code-connector-proxy',
    },
  });
}

function parseFigmaUser(payload: FigmaMeResponse): ConnectorUserInfo | null {
  if (!payload.id) {
    return null;
  }

  return {
    externalAccountId: payload.id,
    externalAccountLabel: payload.handle ?? payload.email ?? payload.id,
  };
}

export const figmaConnector: ConnectorProvider = {
  provider: 'figma',
  authType: 'api_key',

  async fetchUserInfo({ accessToken, fetchImpl }) {
    const response = await callFigmaMe(accessToken, fetchImpl);

    if (!response.ok) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_USER_INFO_FAILED',
        httpStatus: response.status,
      });
    }

    let payload: FigmaMeResponse;

    try {
      payload = (await response.json()) as FigmaMeResponse;
    } catch {
      throw new ConnectorProviderError({ code: 'PROVIDER_RESPONSE_MALFORMED' });
    }

    const userInfo = parseFigmaUser(payload);

    if (!userInfo) {
      throw new ConnectorProviderError({ code: 'PROVIDER_RESPONSE_MALFORMED' });
    }

    return userInfo;
  },

  async testApiKey({ apiKey, fetchImpl }): Promise<ConnectorApiKeyTestResult> {
    let response: Response;

    try {
      response = await callFigmaMe(apiKey, fetchImpl);
    } catch {
      return { ok: false, code: 'PROVIDER_UNREACHABLE' };
    }

    if (response.status === 401 || response.status === 403) {
      return { ok: false, code: 'API_KEY_INVALID' };
    }

    if (!response.ok) {
      return { ok: false, code: 'PROVIDER_UNREACHABLE' };
    }

    let payload: FigmaMeResponse;

    try {
      payload = (await response.json()) as FigmaMeResponse;
    } catch {
      return { ok: false, code: 'PROVIDER_RESPONSE_MALFORMED' };
    }

    const userInfo = parseFigmaUser(payload);

    return userInfo ? { ok: true, userInfo } : { ok: false, code: 'PROVIDER_RESPONSE_MALFORMED' };
  },
};
