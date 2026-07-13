import { useEffect, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { data as json } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { Button } from '~/components/ui/Button';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { TimezoneSelector } from '~/components/ui/TimezoneSelector';
import {
  apiErrorMessage,
  apiRequest,
  formObject,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { shouldRethrowActionError } from '~/lib/route-reauth';
import { isValidIanaTimeZone } from '~/lib/time-zones';
import { useUnsavedChangesGuard } from '~/lib/use-unsaved-guard';

export const meta: MetaFunction = () => [{ title: 'Account settings - E-Code' }];

interface CurrentUser {
  name?: string;
  email?: string;
  timezone?: string;
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  const { user } = await apiRequest<{ user?: CurrentUser }>(request, '/auth/me');

  return json({
    user: { name: user?.name ?? '', email: user?.email ?? '', timezone: user?.timezone ?? '' },
  });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as { name?: string; email?: string; timezone?: string };
  const timezone = body.timezone?.trim();

  if (timezone && !isValidIanaTimeZone(timezone)) {
    return json({ error: 'Choose a valid IANA time zone.' }, { status: 400 });
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
    return json({ error: 'Enter at least one value to update.' });
  }

  try {
    await apiRequest(request, '/auth/me', { method: 'PATCH', body: JSON.stringify(payload) });
  } catch (error) {
    if (shouldRethrowActionError(error)) {
      throw error;
    }

    return json({ error: await apiErrorMessage(error, 'Could not save account settings.') });
  }

  return json({ status: 'Account settings saved.' });
}

const PROFILE_FIELDS = [
  { label: 'Name', name: 'name', type: 'text', placeholder: 'Ada Lovelace' },
  { label: 'Email', name: 'email', type: 'email', placeholder: 'ada@example.com' },
] as const;

type FieldName = 'name' | 'email' | 'timezone';

export default function AccountSettingsIndex() {
  const { user } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle';

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
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
        {actionData?.status ? (
          <p className="mb-4 rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm text-bolt-elements-textSecondary">
            {actionData.status}
          </p>
        ) : null}
        {actionData?.error ? (
          <p
            className="mb-4 rounded-md border border-bolt-elements-icon-error px-3 py-2 text-sm text-bolt-elements-icon-error"
            role="alert"
          >
            {actionData.error}
          </p>
        ) : null}
        <Form className="grid gap-4" method="post">
          {PROFILE_FIELDS.map((field) => (
            <label key={field.name} className="grid gap-2 text-sm font-medium">
              {field.label}
              <input
                className="h-[44px] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
                name={field.name}
                type={field.type}
                placeholder={field.placeholder}
                value={values[field.name]}
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
            <Button type="submit" className="min-h-[44px]" disabled={!dirty || submitting}>
              {submitting ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </Form>
      </div>
      <ConfirmationDialog
        isOpen={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        title="Discard changes?"
        description="You have unsaved account changes. If you leave now they will be lost."
        confirmLabel="Discard"
        variant="destructive"
      />
    </>
  );
}
