import { apiRequest, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

/*
 * Browser-accessible proxy for the assistant-message 👍/👎 buttons
 * (AssistantMessageFooter). The vote lives on the API service
 * (`POST /api/ai/message-feedback`); this resource route forwards the session
 * so the chat UI can fire-and-forget a plain `fetch()`. A `vote` of null
 * retracts a previously recorded vote (the thumb toggled off).
 */
export async function action({ request }: EnterpriseActionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
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
    return Response.json({ error: 'messageId and a vote of "up", "down", or null are required.' }, { status: 400 });
  }

  try {
    const result = await apiRequest(request, '/api/ai/message-feedback', {
      method: 'POST',
      body: JSON.stringify({ messageId, vote, ...(chatId ? { chatId } : {}) }),
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to record message feedback.' },
      { status: 502 },
    );
  }
}
