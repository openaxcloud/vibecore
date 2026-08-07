import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  formObject,
  isApiResponse,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { getInvitationsCopy, interpolateInvitationsCopy, invitationRoleLabel } from '~/lib/i18n/catalogs/invitations';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect } from '~/lib/route-reauth';

/*
 * The trailing underscore in this route filename is intentional: it keeps the
 * public acceptance form at /invitations/accept without nesting it below the
 * authenticated /invitations loader, which redirects anonymous recipients.
 */
const ACCEPT_INVITATION_CANONICAL_URL = 'https://e-code.ai/invitations/accept';

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getInvitationsCopy(language);
  const title = copy['invitations.accept.meta.title'];
  const description = copy['invitations.accept.meta.description'];
  const french = language === 'fr';

  return [
    { title },
    { name: 'description', content: description },
    { name: 'robots', content: 'noindex, nofollow' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: ACCEPT_INVITATION_CANONICAL_URL },
    { property: 'og:locale', content: french ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: french ? 'en_US' : 'fr_FR' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { tagName: 'link', rel: 'canonical', href: ACCEPT_INVITATION_CANONICAL_URL },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${ACCEPT_INVITATION_CANONICAL_URL}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${ACCEPT_INVITATION_CANONICAL_URL}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: ACCEPT_INVITATION_CANONICAL_URL },
  ];
};

type AcceptInvitationErrorCode = 'tokenRequired' | 'invalid' | 'rateLimited' | 'unavailable';
type AcceptInvitationActionData = {
  feedbackCode?: 'accepted';
  roleKey?: string;
  errorCode?: AcceptInvitationErrorCode;
};

export async function loader({ request }: EnterpriseLoaderArgs) {
  const localeResolution = resolveRequestLocale(request);
  const token = new URL(request.url).searchParams.get('token') ?? '';

  return json(
    { language: localeResolution.language, token },
    { headers: localeResponseHeaders(request, localeResolution) },
  );
}

export async function action({ request }: EnterpriseActionArgs) {
  const localeResolution = resolveRequestLocale(request);

  const actionData = (data: AcceptInvitationActionData, status = 200) =>
    json(data, { status, headers: localeResponseHeaders(request, localeResolution) });

  const body = formObject(await request.formData()) as { token?: string };

  if (!body.token) {
    return actionData({ errorCode: 'tokenRequired' }, 400);
  }

  try {
    const result = await apiRequest<{ organizationId: string; roleKey: string }>(request, '/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: body.token }),
    });

    return actionData({ feedbackCode: 'accepted', roleKey: result.roleKey });
  } catch (error) {
    /*
     * `/invitations/accept` is a page navigation, not an `/api/` call, so
     * `apiRequest` honours `redirectOn401` and throws a framework `redirect()`
     * Response (302 to /login, or /mfa-setup for a platform-admin MFA gate) on
     * an expired session. Re-throw those so the framework performs the re-auth
     * redirect — `isApiResponse` matches any Response (including 3xx), so it
     * would otherwise swallow the redirect into a generic inline error.
     */
    if (isReauthRedirect(error) || (error instanceof Response && error.status === 401)) {
      throw error;
    }

    if (isApiResponse(error, 400) || isApiResponse(error, 404) || isApiResponse(error, 409)) {
      return actionData({ errorCode: 'invalid' }, error.status);
    }

    if (isApiResponse(error, 429)) {
      return actionData({ errorCode: 'rateLimited' }, error.status);
    }

    return actionData({ errorCode: 'unavailable' }, error instanceof Response ? error.status : 500);
  }
}

export default function AcceptInvitationPage() {
  const { token } = useLoaderData<typeof loader>();
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getInvitationsCopy(language);
  const actionData = useActionData<typeof action>() as AcceptInvitationActionData | undefined;
  const navigation = useNavigation();
  const submitting = navigation.state === 'submitting';

  const knownRole =
    actionData?.roleKey && ['viewer', 'member', 'editor', 'admin', 'owner'].includes(actionData.roleKey);
  const roleLabel = knownRole
    ? invitationRoleLabel(actionData.roleKey ?? '', [], language)
    : copy['invitations.accept.role.fallback'];
  const feedback = actionData?.feedbackCode
    ? interpolateInvitationsCopy(copy['invitations.accept.feedback.accepted'], { role: roleLabel })
    : undefined;

  const actionError = actionData?.errorCode ? copy[`invitations.accept.error.${actionData.errorCode}`] : undefined;

  return (
    <EnterpriseFormPage
      title={copy['invitations.accept.page.title']}
      description={copy['invitations.accept.page.description']}
      status={feedback}
      error={actionError}
    >
      <Form method="post" className="space-y-4">
        <TextField
          label={copy['invitations.accept.form.token']}
          name="token"
          defaultValue={token}
          required
          autoComplete="off"
        />
        <PrimaryButton type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? copy['invitations.accept.form.submitting'] : copy['invitations.accept.form.submit']}
        </PrimaryButton>
      </Form>
    </EnterpriseFormPage>
  );
}
