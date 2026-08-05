import { Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useNavigation } from 'react-router';
import { AuthField, AuthScreen, AuthSubmit } from '~/components/auth/AuthScreen';
import {
  apiRequest,
  formObject,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import type { TranslationKey } from '~/lib/i18n/dictionary';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { translateServerMessage } from '~/lib/i18n/server';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const language = data?.language ?? 'en';

  return [
    { title: translateServerMessage(language, 'auth.forgot.metaTitle') },
    { name: 'description', content: translateServerMessage(language, 'auth.forgot.metaDescription') },
  ];
};

type ForgotFeedbackCode = 'AUTH_RESET_REQUESTED' | 'AUTH_RESET_REQUEST_FAILED' | 'AUTH_RESET_REQUEST_UNAVAILABLE';

const FORGOT_FEEDBACK_KEYS = {
  AUTH_RESET_REQUESTED: 'auth.feedback.resetRequested',
  AUTH_RESET_REQUEST_FAILED: 'auth.feedback.resetRequestFailed',
  AUTH_RESET_REQUEST_UNAVAILABLE: 'auth.feedback.resetRequestUnavailable',
} as const satisfies Record<ForgotFeedbackCode, TranslationKey>;

export function loader({ request }: EnterpriseLoaderArgs) {
  return json({ language: resolveRequestLocale(request).language });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData());

  try {
    await apiRequest(request, '/auth/password-reset/request', {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify(body),
    });

    /*
     * Intentionally identical message whether or not the email matches a
     * real account — leaking that information would let attackers
     * enumerate registered emails through this endpoint.
     */
    return json({ statusCode: 'AUTH_RESET_REQUESTED' as const });
  } catch (error) {
    if (error instanceof Response) {
      return json({ errorCode: 'AUTH_RESET_REQUEST_FAILED' as const }, { status: error.status });
    }

    return json({ errorCode: 'AUTH_RESET_REQUEST_UNAVAILABLE' as const }, { status: 503 });
  }
}

export default function ForgotPasswordPage() {
  const { t } = useTranslation();

  const actionData = useActionData<typeof action>() as
    | { statusCode?: ForgotFeedbackCode; errorCode?: ForgotFeedbackCode }
    | undefined;

  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const status = actionData?.statusCode ? t(FORGOT_FEEDBACK_KEYS[actionData.statusCode]) : undefined;
  const error = actionData?.errorCode ? t(FORGOT_FEEDBACK_KEYS[actionData.errorCode]) : undefined;

  return (
    <AuthScreen
      eyebrow={t('auth.forgot.eyebrow')}
      title={t('auth.forgot.title')}
      description={t('auth.forgot.description')}
      status={status}
      error={error}
      heroEyebrow={t('auth.forgot.heroEyebrow')}
      heroTitle={t('auth.forgot.heroTitle')}
      heroBody={t('auth.forgot.heroBody')}
      footer={
        <>
          {t('auth.forgot.footerPrompt')}{' '}
          <Link to="/login" className="vc-auth-link font-semibold hover:underline">
            {t('auth.forgot.backToSignIn')}
          </Link>
        </>
      }
    >
      <Form method="post" className="space-y-4 sm:space-y-5">
        <AuthField
          label={t('auth.common.email')}
          name="email"
          type="email"
          required
          placeholder={t('auth.common.emailPlaceholder')}
          autoComplete="email"
          icon={<Mail className="h-4 w-4" />}
        />
        <AuthSubmit
          label={t('auth.forgot.submit')}
          loadingLabel={t('auth.forgot.submitting')}
          isSubmitting={isSubmitting}
        />
      </Form>
    </AuthScreen>
  );
}
