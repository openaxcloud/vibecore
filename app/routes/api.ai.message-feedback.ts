import { apiRequest, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

/*
 * Browser-accessible proxy for the assistant-message 👍/👎 buttons
 * (AssistantMessageFooter). The vote lives on the API service
 * (`POST /api/ai/message-feedback`); this resource route forwards the session
 * so the chat UI can fire-and-forget a plain `fetch()`. A `vote` of null
 * retracts a previously recorded vote (the thumb toggled off).
 */
export async function action({ request }: EnterpriseActionArgs) {
  if (request.method !== 'POST') {
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405);
  }

  const payload = (await request.json().catch(() => null)) as {
    messageId?: unknown;
    vote?: unknown;
    chatId?: unknown;
  } | null;

  const messageId = typeof payload?.messageId === 'string' ? payload.messageId.trim() : '';

  const vote = payload?.vote === 'up' || payload?.vote === 'down' || payload?.vote === null ? payload.vote : undefined;

  const chatId = typeof payload?.chatId === 'string' && payload.chatId.trim() ? payload.chatId.trim() : undefined;

  if (!messageId || vote === undefined) {
    return remainingApiErrorResponse(request, 'FEEDBACK_INVALID', 400);
  }

  try {
    const result = await apiRequest(request, '/api/ai/message-feedback', {
      method: 'POST',
      body: JSON.stringify({ messageId, vote, ...(chatId ? { chatId } : {}) }),
    });

    return Response.json(result);
  } catch (error) {
    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    return remainingApiErrorResponse(request, 'FEEDBACK_FAILED', status);
  }
}
