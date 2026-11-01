import { createHash } from 'node:crypto';
import { MockLanguageModelV1, simulateReadableStream } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retrieveSkillsForAgentContext } from './project-skills';
import { streamText } from './stream-text';
import { apiRequest } from '~/lib/enterprise-api.server';

const boundary = vi.hoisted(() => ({ model: vi.fn(), fetch: vi.fn(), selectedModel: 'configured-model' }));
const catalog = vi.hoisted(() => [{ name: 'configured-model', provider: 'Google', maxTokenAllowed: 8192 }]);
vi.mock('~/lib/enterprise-api.server', () => ({ apiRequest: vi.fn() }));
vi.mock('./managed-provider-keys', () => ({ applyManagedProviderKeys: async (env: unknown) => env }));
vi.mock('./provider-credentials', () => ({
  resolveUsableProvider: () => ({
    provider: { name: 'Google', getModelInstance: boundary.model, staticModels: catalog },
    model: boundary.selectedModel,
  }),
}));
vi.mock('./provider-fallback', () => ({
  ensureProviderProbed: async () => undefined,
  resolveRuntimeProvider: (input: unknown) => input,
}));
vi.mock('~/lib/modules/llm/manager', () => ({
  LLMManager: {
    getInstance: () => ({
      getAllProviders: () => [{ name: 'Google', staticModels: catalog, config: {} }],
      getDefaultProvider: () => ({ name: 'Google', staticModels: catalog, config: {} }),
      getStaticModelListFromProvider: () => catalog,
      getModelListFromProvider: async () => catalog,
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  boundary.selectedModel = 'configured-model';
  boundary.fetch.mockImplementation(() => {
    throw new Error('Network forbidden');
  });
  vi.stubGlobal('fetch', boundary.fetch);
});
afterEach(() => vi.unstubAllGlobals());

/** Real context retrieval/composition and SDK preparation; only registry and provider boundaries are fixtures. */
describe('Skills reach the prepared model request without invoking a provider', () => {
  it.each(['build', 'discuss'] as const)(
    'includes enabled skills and removes disabled skills in %s mode',
    async (chatMode) => {
      let enabled = true;
      vi.mocked(apiRequest).mockImplementation(async (_request, path) => {
        if (path.endsWith('/skills')) {
          return {
            skills: [
              {
                id: 'synthetic-capability',
                name: 'Synthetic capability',
                description: 'SYNTHETIC_BUILTIN_GUIDANCE',
                category: 'quality',
                source: 'builtin',
                enabled,
              },
            ],
          };
        }

        if (path.endsWith('scope=project')) {
          return {
            skills: [
              {
                ownerRepo: 'fixture/synthetic',
                name: 'UI',
                description: 'Interface guidance.',
                instructions: 'SYNTHETIC_INSTALLED_INSTRUCTIONS',
                resources: [
                  {
                    path: 'references/proof.txt',
                    kind: 'reference',
                    bytes: Buffer.byteLength('SYNTHETIC_REFERENCE_CONTENT'),
                    content: 'SYNTHETIC_REFERENCE_CONTENT',
                    contentHash: createHash('sha256').update('SYNTHETIC_REFERENCE_CONTENT').digest('hex'),
                  },
                ],
                enabled,
                scope: 'project',
              },
            ],
          };
        }

        if (path.endsWith('scope=workspace')) {
          // The enabled workspace copy must not resurrect a disabled project override.
          return {
            skills: [
              {
                ownerRepo: 'fixture/synthetic',
                name: 'UI',
                description: 'Interface guidance.',
                instructions: 'SYNTHETIC_WORKSPACE_FALLBACK',
                enabled: true,
                scope: 'workspace',
              },
            ],
          };
        }

        throw new Error(`Unexpected registry fixture path: ${path}`);
      });

      const preparedCalls: Array<Parameters<MockLanguageModelV1['doStream']>[0]> = [];
      boundary.model.mockReturnValue(
        new MockLanguageModelV1({
          doStream: async (options) => {
            preparedCalls.push(options);
            return {
              stream: simulateReadableStream({
                chunks: [{ type: 'finish', finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0 } }],
              }),
              rawCall: { rawPrompt: options.prompt, rawSettings: {} },
            };
          },
        }),
      );

      async function prepare() {
        const context = await retrieveSkillsForAgentContext(new Request('http://localhost/api/chat'), {
          projectId: 'synthetic-project',
          userPrompt: 'Utilise UI pour cette page',
        });

        const result = await streamText({
          messages: [{ role: 'user', content: 'Utilise UI pour cette page' }],
          chatMode,
          skillsContext: context?.context,
          options: { maxRetries: 0 },
        });
        await result.consumeStream();

        return context;
      }

      const first = await prepare();
      expect(first?.triggeredSkills).toEqual(['fixture/synthetic']);
      expect(preparedCalls).toHaveLength(1);

      const enabledSystem = preparedCalls[0].prompt
        .filter((message) => message.role === 'system')
        .map((message) => message.content)
        .join('\n');
      expect(enabledSystem).toContain('SYNTHETIC_BUILTIN_GUIDANCE');
      expect(enabledSystem).toContain('SYNTHETIC_INSTALLED_INSTRUCTIONS');
      expect(enabledSystem).toContain('SYNTHETIC_REFERENCE_CONTENT');
      expect(first?.disclosureTrace.some((entry) => entry.level === 3)).toBe(true);
      expect(enabledSystem).not.toContain('SYNTHETIC_WORKSPACE_FALLBACK');

      enabled = false;
      expect(await prepare()).toBeUndefined();
      expect(preparedCalls).toHaveLength(2);

      const disabledSystem = preparedCalls[1].prompt
        .filter((message) => message.role === 'system')
        .map((message) => message.content)
        .join('\n');
      expect(disabledSystem).not.toContain('SYNTHETIC_BUILTIN_GUIDANCE');
      expect(disabledSystem).not.toContain('SYNTHETIC_INSTALLED_INSTRUCTIONS');
      expect(disabledSystem).not.toContain('SYNTHETIC_REFERENCE_CONTENT');
      expect(disabledSystem).not.toContain('SYNTHETIC_WORKSPACE_FALLBACK');
      expect(boundary.fetch).not.toHaveBeenCalled();
    },
  );
});
