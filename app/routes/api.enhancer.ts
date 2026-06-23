import { type ActionFunctionArgs } from 'react-router';
import { streamText } from '~/lib/.server/llm/stream-text';
import { requireWebSession } from '~/lib/.server/require-session';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import type { ProviderInfo } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';
import { stripIndents } from '~/utils/stripIndent';

export async function action(args: ActionFunctionArgs) {
  return enhancerAction(args);
}

const logger = createScopedLogger('api.enhancher');

async function enhancerAction({ context, request }: ActionFunctionArgs) {
  // Gate the platform's managed provider keys behind a valid session.
  await requireWebSession(request);

  let body: {
    message: string;
    model: string;
    provider: ProviderInfo;
    apiKeys?: Record<string, string>;
  };

  try {
    body = await request.json();
  } catch {
    throw new Response('Invalid JSON body', {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  const { message, model, provider } = body;

  // validate 'model' and 'provider' fields
  if (!model || typeof model !== 'string') {
    throw new Response('Invalid or missing model', {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  /*
   * `provider` may be absent or not an object; reading provider.name on a
   * non-object would throw a TypeError before validation, escaping as a 500.
   */
  if (!provider || typeof provider !== 'object') {
    throw new Response('Invalid or missing provider', {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  const { name: providerName } = provider;

  if (!providerName || typeof providerName !== 'string') {
    throw new Response('Invalid or missing provider', {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  const cookieHeader = request.headers.get('Cookie');

  let apiKeys: Record<string, string>;
  let providerSettings: Record<string, any>;

  try {
    apiKeys = getApiKeysFromCookie(cookieHeader);
    providerSettings = getProviderSettingsFromCookie(cookieHeader);
  } catch {
    /*
     * Malformed apiKeys/providers cookie — JSON.parse inside the helpers would
     * otherwise throw here, before the try block below, as an unhandled 500.
     */
    apiKeys = {};
    providerSettings = {};
  }

  try {
    const result = await streamText({
      messages: [
        {
          role: 'user',
          content:
            `[Model: ${model}]\n\n[Provider: ${providerName}]\n\n` +
            stripIndents`
            You are a professional prompt engineer specializing in crafting precise, effective prompts.
            Your task is to enhance prompts by making them more specific, actionable, and effective.

            I want you to improve the user prompt that is wrapped in \`<original_prompt>\` tags.

            For valid prompts:
            - Make instructions explicit and unambiguous
            - Add relevant context and constraints
            - Remove redundant information
            - Maintain the core intent
            - Ensure the prompt is self-contained
            - Use professional language

            For invalid or unclear prompts:
            - Respond with clear, professional guidance
            - Keep responses concise and actionable
            - Maintain a helpful, constructive tone
            - Focus on what the user should provide
            - Use a standard template for consistency

            IMPORTANT: Your response must ONLY contain the enhanced prompt text.
            Do not include any explanations, metadata, or wrapper tags.

            <original_prompt>
              ${message}
            </original_prompt>
          `,
        },
      ],
      env: context.cloudflare?.env as any,
      apiKeys,
      providerSettings,

      /*
       * Thread the request's abort signal into the generation so that when the
       * browser disconnects mid-enhance (tab close / navigation), the upstream
       * LLM provider stops generating instead of running the completion to
       * completion and billing tokens against the platform's managed key.
       */
      abortSignal: request.signal,
      options: {
        system:
          'You are a senior software principal architect, you should help the user analyse the user query and enrich it with the necessary context and constraints to make it more specific, actionable, and effective. You should also ensure that the prompt is self-contained and uses professional language. Your response should ONLY contain the enhanced prompt text. Do not include any explanations, metadata, or wrapper tags.',

        /*
         * onError: (event) => {
         *   throw new Response(null, {
         *     status: 500,
         *     statusText: 'Internal Server Error',
         *   });
         * }
         */
      },
    });

    // Handle streaming errors in a non-blocking way
    (async () => {
      try {
        for await (const part of result.fullStream) {
          if (part.type === 'error') {
            const error: any = part.error;
            logger.error('Streaming error:', error);
            break;
          }
        }
      } catch (error) {
        logger.error('Error processing stream:', error);
      }
    })();

    // Return the text stream directly since it's already text data
    return new Response(result.textStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: unknown) {
    console.log(error);

    if (error instanceof Error && error.message?.includes('API key')) {
      throw new Response('Invalid or missing API key', {
        status: 401,
        statusText: 'Unauthorized',
      });
    }

    throw new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
}
