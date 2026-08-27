import { data as json, type LoaderFunctionArgs } from 'react-router';

import { getApiAiFeaturesCopy } from '~/lib/i18n/catalogs/api-ai-features';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

export async function loader({ request }: LoaderFunctionArgs) {
  const resolution = resolveRequestLocale(request);
  const language = resolution.language === 'fr' ? 'fr' : 'en';
  const copy = getApiAiFeaturesCopy(language);
  const headers = localeResponseHeaders(request, { ...resolution, language });

  headers.set('Cache-Control', 'no-store');

  return json(
    {
      features: {
        autonomous: {
          title: copy['apiAiFeatures.features.autonomous.title'],
          description: copy['apiAiFeatures.features.autonomous.description'],
          icon: 'Brain',
          details: [
            copy['apiAiFeatures.features.autonomous.detail0'],
            copy['apiAiFeatures.features.autonomous.detail1'],
            copy['apiAiFeatures.features.autonomous.detail2'],
            copy['apiAiFeatures.features.autonomous.detail3'],
          ],
        },
        multilingual: {
          title: copy['apiAiFeatures.features.multilingual.title'],
          description: copy['apiAiFeatures.features.multilingual.description'],
          icon: 'Languages',
          details: [
            copy['apiAiFeatures.features.multilingual.detail0'],
            copy['apiAiFeatures.features.multilingual.detail1'],
            copy['apiAiFeatures.features.multilingual.detail2'],
            copy['apiAiFeatures.features.multilingual.detail3'],
          ],
        },
        intelligent: {
          title: copy['apiAiFeatures.features.intelligent.title'],
          description: copy['apiAiFeatures.features.intelligent.description'],
          icon: 'Sparkles',
          details: [
            copy['apiAiFeatures.features.intelligent.detail0'],
            copy['apiAiFeatures.features.intelligent.detail1'],
            copy['apiAiFeatures.features.intelligent.detail2'],
            copy['apiAiFeatures.features.intelligent.detail3'],
          ],
        },
        realtime: {
          title: copy['apiAiFeatures.features.realtime.title'],
          description: copy['apiAiFeatures.features.realtime.description'],
          icon: 'Zap',
          details: [
            copy['apiAiFeatures.features.realtime.detail0'],
            copy['apiAiFeatures.features.realtime.detail1'],
            copy['apiAiFeatures.features.realtime.detail2'],
            copy['apiAiFeatures.features.realtime.detail3'],
          ],
        },
      },
      useCases: [
        {
          title: copy['apiAiFeatures.useCases.fullStack.title'],
          description: copy['apiAiFeatures.useCases.fullStack.description'],
          icon: 'Globe',
          example: copy['apiAiFeatures.useCases.fullStack.example'],
        },
        {
          title: copy['apiAiFeatures.useCases.apiDevelopment.title'],
          description: copy['apiAiFeatures.useCases.apiDevelopment.description'],
          icon: 'Code2',
          example: copy['apiAiFeatures.useCases.apiDevelopment.example'],
        },
        {
          title: copy['apiAiFeatures.useCases.testing.title'],
          description: copy['apiAiFeatures.useCases.testing.description'],
          icon: 'Shield',
          example: copy['apiAiFeatures.useCases.testing.example'],
        },
        {
          title: copy['apiAiFeatures.useCases.review.title'],
          description: copy['apiAiFeatures.useCases.review.description'],
          icon: 'Search',
          example: copy['apiAiFeatures.useCases.review.example'],
        },
      ],
      aiTools: [
        {
          name: copy['apiAiFeatures.tools.autonomous.name'],
          icon: 'Brain',
          description: copy['apiAiFeatures.tools.autonomous.description'],
        },
        {
          name: copy['apiAiFeatures.tools.completion.name'],
          icon: 'Code2',
          description: copy['apiAiFeatures.tools.completion.description'],
        },
        {
          name: copy['apiAiFeatures.tools.inlineActions.name'],
          icon: 'Zap',
          description: copy['apiAiFeatures.tools.inlineActions.description'],
        },
        {
          name: copy['apiAiFeatures.tools.voice.name'],
          icon: 'Mic',
          description: copy['apiAiFeatures.tools.voice.description'],
        },
        {
          name: copy['apiAiFeatures.tools.memory.name'],
          icon: 'Database',
          description: copy['apiAiFeatures.tools.memory.description'],
        },
        {
          name: copy['apiAiFeatures.tools.checkpoint.name'],
          icon: 'History',
          description: copy['apiAiFeatures.tools.checkpoint.description'],
        },
      ],

      /*
       * Supported providers for the public marketing page. `available` must NOT be
       * derived from platform API-key presence: this endpoint is unauthenticated,
       * so doing so leaked which provider credentials are configured in prod (an
       * infra-config oracle). List the platform-supported set instead.
       */
      providers: [
        { name: 'OpenAI', models: ['GPT-4o', 'GPT-4o Mini', 'o1', 'o3'], available: true },
        {
          name: 'Anthropic',
          models: ['Claude 3 Opus', 'Claude 3.5 Sonnet', 'Claude 3.5 Haiku'],
          available: true,
        },
        {
          name: 'Google Gemini',
          models: ['Gemini 3.5 Flash', 'Gemini 2.5 Pro', 'Gemini 2.5 Flash'],
          available: true,
        },
        { name: 'xAI', models: ['Grok 2'], available: true },
        { name: 'Moonshot (Kimi)', models: ['Kimi K2 Thinking', 'Kimi K2 Turbo'], available: true },
      ],
    },
    { headers },
  );
}
