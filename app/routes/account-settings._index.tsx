import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { data as json } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { Button } from '~/components/ui/Button';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { TimezoneSelector } from '~/components/ui/TimezoneSelector';
import {
  apiRequest,
  formObject,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { getAccountProfileCopy, type AccountProfileCopy } from '~/lib/i18n/catalogs/account-data';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect } from '~/lib/route-reauth';
import { isValidIanaTimeZone } from '~/lib/time-zones';
import { useUnsavedChangesGuard } from '~/lib/use-unsaved-guard';

const ACCOUNT_SETTINGS_CANONICAL_URL = 'https://e-code.ai/account-settings';

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getAccountProfileCopy(language).seo;
  const french = language === 'fr';

  return [
    { title: copy.title },
    { name: 'description', content: copy.description },
    { property: 'og:title', content: copy.title },
    { property: 'og:description', content: copy.description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: ACCOUNT_SETTINGS_CANONICAL_URL },
    { property: 'og:locale', content: french ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: french ? 'en_US' : 'fr_FR' },
    { name: 'twitter:title', content: copy.title },
    { name: 'twitter:description', content: copy.description },
    { tagName: 'link', rel: 'canonical', href: ACCOUNT_SETTINGS_CANONICAL_URL },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${ACCOUNT_SETTINGS_CANONICAL_URL}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${ACCOUNT_SETTINGS_CANONICAL_URL}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: ACCOUNT_SETTINGS_CANONICAL_URL },
  ];
};

interface CurrentUser {
  name?: string;
  email?: string;
  timezone?: string;
}

type AccountProfileErrorCode = 'invalidTimezone' | 'valueRequired' | 'saveFailed';
type AccountProfileActionData = { feedbackCode?: 'saved'; errorCode?: AccountProfileErrorCode };

export async function loader({ request }: EnterpriseLoaderArgs) {
  const localeResolution = resolveRequestLocale(request);
  const { user } = await apiRequest<{ user?: CurrentUser }>(request, '/auth/me');

  return json(
    {
      language: localeResolution.language,
      user: { name: user?.name ?? '', email: user?.email ?? '', timezone: user?.timezone ?? '' },
    },
    { headers: localeResponseHeaders(request, localeResolution) },
  );
}

export async function action({ request }: EnterpriseActionArgs) {
  const localeResolution = resolveRequestLocale(request);

  const actionData = (data: AccountProfileActionData, status = 200) =>
    json(data, { status, headers: localeResponseHeaders(request, localeResolution) });

  const body = formObject(await request.formData()) as { name?: string; email?: string; timezone?: string };
  const timezone = body.timezone?.trim();

  if (timezone && !isValidIanaTimeZone(timezone)) {
    return actionData({ errorCode: 'invalidTimezone' }, 400);
  }

  /*
   * Only send fields the user actually filled in. The API's userProfileSchema
   * treats each field as `.optional()` but rejects empty strings, so submitting
   * a blank field previously 400'd and bubbled to the route error boundary.
   */
  const payload: Record<string, string> = {};

  for (const key of ['name', 'email', 'timezone'] as const) {
    const value = body[key]?.trim();

    if (value) {
      payload[key] = value;
    }
  }

  if (Object.keys(payload).length === 0) {
    return actionData({ errorCode: 'valueRequired' }, 400);
  }

  try {
    await apiRequest(request, '/auth/me', { method: 'PATCH', body: JSON.stringify(payload) });
  } catch (error) {
    if (isReauthRedirect(error) || (error instanceof Response && error.status === 401)) {
      throw error;
    }

    return actionData({ errorCode: 'saveFailed' }, error instanceof Response ? error.status : 500);
  }

  return actionData({ feedbackCode: 'saved' });
}

function profileFields(copy: AccountProfileCopy) {
  /*
   * BUG-USR-012: WCAG 1.3.5 — identify input purpose so password managers / browser
   * autofill can fill these (they had no autocomplete, unlike the auth forms).
   * `autoComplete` porte un jeton normalisé, jamais traduit : il s'adresse au
   * navigateur, pas à l'utilisateur.
   */
  return [
    {
      label: copy.fields.name,
      name: 'name',
      type: 'text',
      placeholder: copy.fields.namePlaceholder,
      autoComplete: 'name',
    },
    {
      label: copy.fields.email,
      name: 'email',
      type: 'email',
      placeholder: copy.fields.emailPlaceholder,
      autoComplete: 'email',
    },
  ] as const;
}

type FieldName = 'name' | 'email' | 'timezone';

export default function AccountSettingsIndex() {
  const { user } = useLoaderData<typeof loader>();
  const { i18n } = useTranslation();
  const copy = getAccountProfileCopy(i18n.resolvedLanguage ?? i18n.language);
  const actionData = useActionData<typeof action>() as AccountProfileActionData | undefined;
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle';
  const feedback = actionData?.feedbackCode ? copy.feedback[actionData.feedbackCode] : null;
  const actionError = actionData?.errorCode ? copy.errors[actionData.errorCode] : null;

  const [values, setValues] = useState<Record<FieldName, string>>({
    name: user.name,
    email: user.email,
    timezone: user.timezone,
  });

  useEffect(() => {
    setValues({ name: user.name, email: user.email, timezone: user.timezone });
  }, [user.name, user.email, user.timezone]);

  const dirty = values.name !== user.name || values.email !== user.email || values.timezone !== user.timezone;
  const blocker = useUnsavedChangesGuard(dirty);

  return (
    <>
      <div className="w-full max-w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6">
        {feedback ? (
          <p
            className="mb-4 rounded-md border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-3 py-2 text-sm text-[var(--status-success-text)]"
            role="status"
            aria-live="polite"
          >
            {feedback}
          </p>
        ) : null}
        {actionError ? (
          <p
            className="mb-4 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm text-[var(--status-error-text)]"
            role="alert"
          >
            {actionError}
          </p>
        ) : null}
        <Form className="grid gap-4" method="post">
          {profileFields(copy).map((field) => (
            <label key={field.name} className="grid gap-2 text-sm font-medium">
              {field.label}
              <input
                className="h-[44px] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-[16px] outline-none focus:border-bolt-elements-focus focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] sm:text-sm"
                name={field.name}
                type={field.type}
                autoComplete={field.autoComplete}
                placeholder={field.placeholder}
                value={values[field.name]}
                disabled={submitting}
                onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
              />
            </label>
          ))}
          <TimezoneSelector
            value={values.timezone}
            disabled={submitting}
            onChange={(timezone) => setValues((current) => ({ ...current, timezone }))}
          />
          <div>
            <Button
              type="submit"
              className="min-h-11 w-full whitespace-normal sm:w-auto"
              disabled={!dirty || submitting}
              aria-busy={submitting}
            >
              {submitting ? copy.actions.saving : copy.actions.save}
            </Button>
          </div>
        </Form>
      </div>
      <ConfirmationDialog
        isOpen={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        title={copy.unsaved.title}
        description={copy.unsaved.description}
        confirmLabel={copy.unsaved.confirm}
        variant="destructive"
      />
    </>
  );
}
