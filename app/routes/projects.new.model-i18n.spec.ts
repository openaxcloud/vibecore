/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchAdminEnabledProvidersMock, firstOrganizationMock, llmManagerMock } = vi.hoisted(() => {
  const modelList = [
    {
      name: 'claude-model-id',
      label: 'Claude Brand Model (Best for Coding)',
      provider: 'Anthropic',
      maxTokenAllowed: 200_000,
    },
  ];
  const providers = [
    {
      name: 'Ollama',
      config: {},
      staticModels: [
        {
          name: 'qwen-model-id',
          label: 'Qwen Brand Model (Dynamic)',
          provider: 'Ollama',
          maxTokenAllowed: 128_000,
        },
      ],
      getApiKeyLink: 'https://ollama.com/download',
      labelForGetApiKey: 'Download Ollama',
      icon: 'ollama',
    },
    {
      name: 'LMStudio',
      config: {},
      staticModels: [
        {
          name: 'lmstudio-model-id',
          label: 'LM Studio Brand Model (Dynamic)',
          provider: 'LMStudio',
          maxTokenAllowed: 64_000,
        },
      ],
      getApiKeyLink: 'https://lmstudio.ai',
      labelForGetApiKey: 'Get LMStudio',
      icon: 'lmstudio',
    },
  ];

  return {
    fetchAdminEnabledProvidersMock: vi.fn(),
    firstOrganizationMock: vi.fn(),
    llmManagerMock: {
      getAllProviders: vi.fn(() => providers),
      getDefaultProvider: vi.fn(() => providers[0]),
      getStaticModelList: vi.fn(() => modelList),
    },
  };
});

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return { ...actual, firstOrganization: firstOrganizationMock };
});

vi.mock('~/lib/modules/llm/manager', () => ({
  LLMManager: { getInstance: () => llmManagerMock },
}));

vi.mock('~/lib/modules/llm/provider-visibility.server', () => ({
  fetchAdminEnabledProviders: fetchAdminEnabledProvidersMock,
}));

type LoaderPayload = {
  modelList: Array<{ name: string; label: string; provider: string }>;
  providers: Array<{
    name: string;
    labelForGetApiKey?: string;
    staticModels: Array<{ name: string; label: string; provider: string }>;
  }>;
  defaultProvider: {
    name: string;
    labelForGetApiKey?: string;
    staticModels: Array<{ name: string; label: string; provider: string }>;
  };
};

describe('projects/new model catalog localization', () => {
  beforeEach(() => {
    firstOrganizationMock.mockReset();
    firstOrganizationMock.mockResolvedValue({ id: 'org-1' });
    fetchAdminEnabledProvidersMock.mockReset();
    fetchAdminEnabledProvidersMock.mockResolvedValue(null);
  });

  it('localizes E-Code descriptors in the French SSR payload while preserving technical identities', async () => {
    const { loader } = await import('./projects.new');

    const result = await loader({
      request: new Request('https://e-code.ai/projects/new', {
        headers: { Cookie: 'vibecore-lang=fr', 'Accept-Language': 'en-US,en;q=0.9' },
      }),
      context: { cloudflare: { env: {} } },
      params: {},
    } as never);

    const payload = (result as unknown as { data: LoaderPayload }).data;

    expect(payload.modelList[0]).toMatchObject({
      name: 'claude-model-id',
      provider: 'Anthropic',
      label: 'Claude Brand Model (Idéal pour le code)',
    });
    expect(payload.providers[0]).toMatchObject({
      name: 'Ollama',
      labelForGetApiKey: 'Télécharger Ollama',
    });
    expect(payload.providers[0].staticModels[0]).toMatchObject({
      name: 'qwen-model-id',
      provider: 'Ollama',
      label: 'Qwen Brand Model (Dynamique)',
    });
    expect(payload.providers[1]).toMatchObject({
      name: 'LMStudio',
      labelForGetApiKey: 'Obtenir LM Studio',
    });
    expect(payload.defaultProvider.name).toBe('Ollama');
    expect(payload.defaultProvider.staticModels[0].name).toBe('qwen-model-id');
  });
});
