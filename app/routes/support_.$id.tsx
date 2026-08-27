import { ArrowLeft, LifeBuoy, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  useRevalidator,
  useRouteError,
  type MetaFunction,
} from 'react-router';

import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { RelativeTime } from '~/components/ui/RelativeTime';
import {
  apiRequest,
  firstOrganization,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  formatSupportTicketDetailCharacterCount,
  formatSupportTicketDetailMessageCount,
  getSupportTicketDetailCopy,
  resolveSupportTicketDetailLanguage,
  supportTicketDetailActionError,
  supportTicketDetailAuthorLabel,
  supportTicketDetailCategoryLabel,
  supportTicketDetailLoadError,
  supportTicketDetailStatusLabel,
  type SupportTicketDetailActionErrorCode,
  type SupportTicketDetailCopy,
  type SupportTicketDetailLanguage,
  type SupportTicketDetailLoadErrorCode,
} from '~/lib/i18n/catalogs/support-ticket-detail';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect } from '~/lib/route-reauth';

const MAX_MESSAGE_LENGTH = 10_000;

type Ticket = {
  id: string;
  subject: string;
  status: string;
  category?: string;
  createdAt?: string;
};

type TicketMessage = {
  id: string;
  authorType: string;
  body: string;
  createdAt: string;
};

type SupportTicketDetailPayload = {
  ticket?: unknown;
  messages?: unknown;
};

const STATUS_BADGE_VARIANT: Record<string, 'success' | 'warning' | 'secondary'> = {
  OPEN: 'warning',
  PENDING: 'warning',
  RESOLVED: 'success',
  CLOSED: 'secondary',
};

function localeForRequest(request: Request) {
  const requestLocale = resolveRequestLocale(request);
  const language = resolveSupportTicketDetailLanguage(requestLocale.language);
  const headers = localeResponseHeaders(request, { ...requestLocale, language });

  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');

  return { language, headers };
}

function normalizedTicket(value: unknown): Ticket | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.id !== 'string' ||
    candidate.id.trim() === '' ||
    typeof candidate.subject !== 'string' ||
    typeof candidate.status !== 'string'
  ) {
    return null;
  }

  return {
    id: candidate.id,
    subject: candidate.subject,
    status: candidate.status,
    ...(typeof candidate.category === 'string' ? { category: candidate.category } : {}),
    ...(typeof candidate.createdAt === 'string' ? { createdAt: candidate.createdAt } : {}),
  };
}

function normalizedMessages(value: unknown): TicketMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((message) => {
    if (!message || typeof message !== 'object') {
      return [];
    }

    const candidate = message as Record<string, unknown>;

    if (
      typeof candidate.id !== 'string' ||
      candidate.id.trim() === '' ||
      typeof candidate.authorType !== 'string' ||
      typeof candidate.body !== 'string' ||
      typeof candidate.createdAt !== 'string'
    ) {
      return [];
    }

    return [
      {
        id: candidate.id,
        authorType: candidate.authorType,
        body: candidate.body,
        createdAt: candidate.createdAt,
      },
    ];
  });
}

function responseStatus(error: unknown): number | undefined {
  if (error instanceof Response) {
    return error.status;
  }

  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
    return error.status;
  }

  return undefined;
}

function loadErrorCode(error: unknown): SupportTicketDetailLoadErrorCode {
  const status = responseStatus(error);

  if (status === 404) {
    return 'notFound';
  }

  if (status === 403) {
    return 'forbidden';
  }

  return status === 429 ? 'rateLimited' : 'unavailable';
}

function loadErrorStatus(code: SupportTicketDetailLoadErrorCode): number {
  if (code === 'notFound') {
    return 404;
  }

  if (code === 'forbidden') {
    return 403;
  }

  return code === 'rateLimited' ? 429 : 502;
}

function actionErrorCode(error: unknown): SupportTicketDetailActionErrorCode {
  if (!(error instanceof Response)) {
    return 'unavailable';
  }

  if (error.status === 404) {
    return 'notFound';
  }

  if (error.status === 403) {
    return 'forbidden';
  }

  if (error.status === 409) {
    return 'ticketClosed';
  }

  if (error.status === 429) {
    return 'rateLimited';
  }

  return error.status >= 500 ? 'unavailable' : 'rejected';
}

function actionErrorStatus(code: SupportTicketDetailActionErrorCode): number {
  if (code === 'notFound') {
    return 404;
  }

  if (code === 'forbidden') {
    return 403;
  }

  if (code === 'ticketClosed') {
    return 409;
  }

  if (code === 'rateLimited') {
    return 429;
  }

  return code === 'unavailable' ? 503 : 400;
}

function ticketPath(ticketId: string, language: SupportTicketDetailLanguage): string {
  const path = `/support/${encodeURIComponent(ticketId)}`;

  return language === 'fr' ? `${path}?lang=fr` : path;
}

function supportPath(language: SupportTicketDetailLanguage): string {
  return language === 'fr' ? '/support?lang=fr' : '/support';
}

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const copy = getSupportTicketDetailCopy(data?.language ?? rootData?.language);
  const title = copy['supportTicketDetail.meta.title'];
  const description = copy['supportTicketDetail.meta.description'];

  return [
    { title },
    { name: 'description', content: description },
    { name: 'robots', content: 'noindex,nofollow,noarchive,nosnippet,noimageindex' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
  ];
};

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const { language, headers } = localeForRequest(request);
  const ticketId = params.id;

  if (!ticketId || ticketId.trim() === '') {
    return json(
      {
        language,
        loadState: 'error' as const,
        ticket: null as Ticket | null,
        messages: [] as TicketMessage[],
        loadErrorCode: 'notFound' as const,
      },
      { status: 404, headers },
    );
  }

  try {
    const organization = await firstOrganization(request);

    const detail = await apiRequest<SupportTicketDetailPayload>(
      request,
      `/support/${encodeURIComponent(organization.id)}/tickets/${encodeURIComponent(ticketId)}`,
    );

    const ticket = normalizedTicket(detail?.ticket);

    if (!ticket) {
      return json(
        {
          language,
          loadState: 'error' as const,
          ticket: null as Ticket | null,
          messages: [] as TicketMessage[],
          loadErrorCode: 'unavailable' as const,
        },
        { status: 502, headers },
      );
    }

    return json(
      {
        language,
        loadState: 'ready' as const,
        ticket,
        messages: normalizedMessages(detail.messages),
        loadErrorCode: null as SupportTicketDetailLoadErrorCode | null,
      },
      { headers },
    );
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    const code = loadErrorCode(error);

    return json(
      {
        language,
        loadState: 'error' as const,
        ticket: null as Ticket | null,
        messages: [] as TicketMessage[],
        loadErrorCode: code,
      },
      { status: loadErrorStatus(code), headers },
    );
  }
}

export async function action({ request, params }: EnterpriseActionArgs) {
  const { language, headers } = localeForRequest(request);
  const ticketId = params.id;

  if (!ticketId || ticketId.trim() === '') {
    return json({ errorCode: 'notFound' as const }, { status: 404, headers });
  }

  let organization: Awaited<ReturnType<typeof firstOrganization>>;

  try {
    organization = await firstOrganization(request);
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    const code = actionErrorCode(error);

    return json({ errorCode: code }, { status: actionErrorStatus(code), headers });
  }

  let body: string;

  try {
    const form = await request.formData();
    const bodyEntry = form.get('body');
    body = typeof bodyEntry === 'string' ? bodyEntry : '';
  } catch {
    return json({ errorCode: 'rejected' as const }, { status: 400, headers });
  }

  if (body.trim() === '') {
    return json({ errorCode: 'messageRequired' as const }, { status: 400, headers });
  }

  if (body.length > MAX_MESSAGE_LENGTH) {
    return json({ errorCode: 'messageTooLong' as const }, { status: 400, headers });
  }

  try {
    await apiRequest(
      request,
      `/orgs/${encodeURIComponent(organization.id)}/support/tickets/${encodeURIComponent(ticketId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({ body }),
      },
    );
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    const code = actionErrorCode(error);

    if (code === 'rateLimited' && error instanceof Response) {
      const retryAfter = error.headers.get('Retry-After');

      if (retryAfter) {
        headers.set('Retry-After', retryAfter);
      }
    }

    return json({ errorCode: code }, { status: actionErrorStatus(code), headers });
  }

  return redirect(ticketPath(ticketId, language), { headers });
}

function MessageBubble({ message, language }: { message: TicketMessage; language: SupportTicketDetailLanguage }) {
  const mine = message.authorType.trim().toUpperCase() === 'USER';
  const author = supportTicketDetailAuthorLabel(message.authorType, language);

  return (
    <li className={`flex min-w-0 flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
      <article
        className={`max-w-full min-w-0 rounded-lg border border-bolt-elements-borderColor p-3 text-sm sm:max-w-[85%] ${
          mine ? 'bg-bolt-elements-background-depth-3' : 'bg-bolt-elements-background-depth-2'
        }`}
        aria-label={author}
      >
        <p className="mb-1 break-words text-xs font-medium text-bolt-elements-textSecondary [overflow-wrap:anywhere]">
          {author}
        </p>
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]" dir="auto">
          {message.body}
        </p>
      </article>
      <RelativeTime value={message.createdAt} className="break-words text-xs text-bolt-elements-textTertiary" />
    </li>
  );
}

function TicketConversation({
  ticket,
  messages,
  copy,
  language,
  actionError,
}: {
  ticket: Ticket;
  messages: TicketMessage[];
  copy: SupportTicketDetailCopy;
  language: SupportTicketDetailLanguage;
  actionError?: string;
}) {
  const navigation = useNavigation();
  const [messageLength, setMessageLength] = useState(0);
  const normalizedStatus = ticket.status.trim().toUpperCase();
  const closed = normalizedStatus === 'CLOSED';
  const sending = navigation.state !== 'idle' && navigation.formMethod?.toLowerCase() === 'post';
  const fieldError = Boolean(actionError);

  return (
    <div className="mx-auto grid min-w-0 max-w-3xl gap-5">
      <section
        className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm sm:p-5"
        aria-labelledby="support-ticket-subject"
      >
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
              <LifeBuoy className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2
                id="support-ticket-subject"
                className="break-words text-base font-semibold [overflow-wrap:anywhere]"
                dir="auto"
              >
                {ticket.subject}
              </h2>
              <p className="mt-1 break-words text-sm text-bolt-elements-textSecondary [overflow-wrap:anywhere]">
                {supportTicketDetailCategoryLabel(ticket.category, language)} ·{' '}
                {ticket.createdAt ? (
                  <RelativeTime value={ticket.createdAt} prefix={copy['supportTicketDetail.ticket.openedPrefix']} />
                ) : (
                  copy['supportTicketDetail.ticket.recorded']
                )}
              </p>
            </div>
          </div>
          <Badge
            variant={STATUS_BADGE_VARIANT[normalizedStatus] ?? 'secondary'}
            size="md"
            className="max-w-full self-start whitespace-normal text-left"
          >
            {supportTicketDetailStatusLabel(ticket.status, language)}
          </Badge>
        </div>
      </section>

      <section
        className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 sm:p-5"
        aria-labelledby="support-ticket-conversation"
      >
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
          <h2 id="support-ticket-conversation" className="break-words text-sm font-semibold">
            {copy['supportTicketDetail.conversation.title']}
          </h2>
          <span className="break-words text-xs text-bolt-elements-textTertiary">
            {formatSupportTicketDetailMessageCount(messages.length, language)}
          </span>
        </div>

        {messages.length > 0 ? (
          <ul className="mt-5 flex min-w-0 flex-col gap-4" aria-label={copy['supportTicketDetail.conversation.title']}>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} language={language} />
            ))}
          </ul>
        ) : (
          <div className="mt-5 flex min-w-0 items-start gap-3 rounded-lg bg-bolt-elements-background-depth-2 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
              <MessageSquare className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="break-words text-sm font-medium">
                {copy['supportTicketDetail.conversation.empty.title']}
              </h3>
              <p className="mt-1 break-words text-sm text-bolt-elements-textSecondary [overflow-wrap:anywhere]">
                {copy['supportTicketDetail.conversation.empty.description']}
              </p>
            </div>
          </div>
        )}
      </section>

      {actionError ? (
        <div
          id="support-ticket-reply-error"
          className="break-words rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4 text-sm text-[var(--status-error-text)] [overflow-wrap:anywhere]"
          role="alert"
          aria-live="assertive"
        >
          {actionError}
        </div>
      ) : null}

      {closed ? (
        <section className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-5">
          <h2 className="break-words text-sm font-semibold">{copy['supportTicketDetail.reply.closed.title']}</h2>
          <p className="mt-1 break-words text-sm text-bolt-elements-textSecondary [overflow-wrap:anywhere]">
            {copy['supportTicketDetail.reply.closed.description']}
          </p>
          <Link
            to={supportPath(language)}
            className="mt-4 inline-flex min-h-[44px] w-full max-w-full items-center justify-center whitespace-normal rounded-md bg-bolt-elements-button-primary-background px-4 py-2 text-center text-sm font-medium text-bolt-elements-button-primary-text transition-colors hover:bg-bolt-elements-button-primary-backgroundHover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)] sm:w-auto"
          >
            {copy['supportTicketDetail.reply.closed.action']}
          </Link>
        </section>
      ) : (
        <Form
          method="post"
          className="grid min-w-0 gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-5"
        >
          <label htmlFor="ticket-reply" className="break-words text-sm font-medium">
            {copy['supportTicketDetail.reply.label']}
          </label>
          <textarea
            id="ticket-reply"
            name="body"
            rows={5}
            required
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={copy['supportTicketDetail.reply.placeholder']}
            aria-describedby={`support-ticket-reply-count${actionError ? ' support-ticket-reply-error' : ''}`}
            aria-invalid={fieldError || undefined}
            onChange={(event) => setMessageLength(event.currentTarget.value.length)}
            className="min-h-28 w-full min-w-0 resize-y rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 text-sm outline-none placeholder:text-bolt-elements-textTertiary focus:border-bolt-elements-focus focus:ring-2 focus:ring-bolt-elements-borderColorActive"
          />
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p
              id="support-ticket-reply-count"
              className="break-words text-xs text-bolt-elements-textTertiary"
              aria-live="polite"
            >
              {formatSupportTicketDetailCharacterCount(messageLength, MAX_MESSAGE_LENGTH, language)}
            </p>
            <Button
              type="submit"
              disabled={sending}
              aria-busy={sending}
              className="min-h-[44px] w-full whitespace-normal px-4 py-2 sm:w-auto"
            >
              {sending ? copy['supportTicketDetail.reply.submitting'] : copy['supportTicketDetail.reply.submit']}
            </Button>
          </div>
        </Form>
      )}
    </div>
  );
}

export default function SupportTicketPage() {
  const { ticket, messages, loadState, loadErrorCode, language: loaderLanguage } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { errorCode?: SupportTicketDetailActionErrorCode } | undefined;
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const { i18n } = useTranslation();
  const language = resolveSupportTicketDetailLanguage(i18n.resolvedLanguage ?? i18n.language ?? loaderLanguage);
  const copy = getSupportTicketDetailCopy(language);
  const loading = revalidator.state !== 'idle' || navigation.state === 'loading';
  const actionError = supportTicketDetailActionError(actionData?.errorCode, language, MAX_MESSAGE_LENGTH);
  const descriptor = supportTicketDetailLoadError(loadErrorCode ?? 'unavailable', language);

  return (
    <AppShell
      title={copy['supportTicketDetail.shell.title']}
      description={copy['supportTicketDetail.shell.description']}
    >
      <Link
        to={supportPath(language)}
        className="mb-5 inline-flex min-h-[44px] max-w-full items-center gap-2 break-words rounded-md px-2 text-sm text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)] [overflow-wrap:anywhere]"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        {copy['supportTicketDetail.back']}
      </Link>

      {loading ? (
        <AsyncPanelSkeleton label={copy['supportTicketDetail.load.loading']} rows={4} className="mx-auto max-w-3xl" />
      ) : loadState === 'error' || !ticket ? (
        <AsyncPanelError
          title={descriptor.title}
          description={descriptor.description}
          onRetry={descriptor.retryable ? revalidator.revalidate : undefined}
          retryLabel={copy['supportTicketDetail.load.retry']}
          tone={loadErrorCode === 'unavailable' ? 'error' : 'warning'}
          className="mx-auto max-w-3xl"
        />
      ) : (
        <TicketConversation
          ticket={ticket}
          messages={messages}
          copy={copy}
          language={language}
          actionError={actionError}
        />
      )}
    </AppShell>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const { i18n } = useTranslation();
  const language = resolveSupportTicketDetailLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getSupportTicketDetailCopy(language);
  const code = loadErrorCode(error);
  const descriptor = supportTicketDetailLoadError(code, language);

  return (
    <AppShell
      title={copy['supportTicketDetail.shell.title']}
      description={copy['supportTicketDetail.shell.description']}
    >
      <Link
        to={supportPath(language)}
        className="mb-5 inline-flex min-h-[44px] max-w-full items-center gap-2 break-words rounded-md px-2 text-sm text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)] [overflow-wrap:anywhere]"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        {copy['supportTicketDetail.back']}
      </Link>
      <AsyncPanelError
        title={descriptor.title}
        description={descriptor.description}
        onRetry={
          descriptor.retryable
            ? () => {
                globalThis.location.reload();
              }
            : undefined
        }
        retryLabel={copy['supportTicketDetail.load.retry']}
        tone={code === 'unavailable' ? 'error' : 'warning'}
        className="mx-auto max-w-3xl"
      />
    </AppShell>
  );
}
