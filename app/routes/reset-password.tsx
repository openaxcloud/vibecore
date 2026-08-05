import { KeyRound, Lock } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useNavigation, useSearchParams } from 'react-router';
import { AuthField, AuthScreen, AuthSubmit } from '~/components/auth/AuthScreen';
import { PASSWORD_MIN_LENGTH, PasswordStrengthMeter } from '~/components/auth/PasswordStrength';
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
    { title: translateServerMessage(language, 'auth.reset.metaTitle') },
    { name: 'description', content: translateServerMessage(language, 'auth.reset.metaDescription') },
  ];
};

type ResetFeedbackCode =
  | 'AUTH_PASSWORD_TOO_SHORT'
  | 'AUTH_PASSWORD_MISMATCH'
  | 'AUTH_RESET_COMPLETE'
  | 'AUTH_INVALID_RESET_TOKEN'
  | 'AUTH_RESET_FAILED'
  | 'AUTH_RESET_UNAVAILABLE';

const RESET_FEEDBACK_KEYS = {
  AUTH_PASSWORD_TOO_SHORT: 'auth.feedback.passwordTooShort',
  AUTH_PASSWORD_MISMATCH: 'auth.feedback.passwordsMismatch',
  AUTH_RESET_COMPLETE: 'auth.feedback.resetComplete',
  AUTH_INVALID_RESET_TOKEN: 'auth.feedback.invalidResetToken',
  AUTH_RESET_FAILED: 'auth.feedback.resetFailed',
  AUTH_RESET_UNAVAILABLE: 'auth.feedback.resetUnavailable',
} as const satisfies Record<ResetFeedbackCode, TranslationKey>;

export function loader({ request }: EnterpriseLoaderArgs) {
  return json({ language: resolveRequestLocale(request).language });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData());
  const token = typeof body.token === 'string' ? body.token : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

  if (password.length < PASSWORD_MIN_LENGTH) {
    return json(
      { errorCode: 'AUTH_PASSWORD_TOO_SHORT' as const, errorParams: { count: PASSWORD_MIN_LENGTH } },
      { status: 400 },
    );
  }

  if (password !== confirmPassword) {
    return json({ errorCode: 'AUTH_PASSWORD_MISMATCH' as const }, { status: 400 });
  }

  try {
    await apiRequest(request, '/auth/password-reset/confirm', {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify({ token, password }),
    });

    return json({ statusCode: 'AUTH_RESET_COMPLETE' as const });
  } catch (error) {
    if (error instanceof Response) {
      let errorCode: ResetFeedbackCode = 'AUTH_RESET_FAILED';

      try {
        const payload = (await error.json()) as { code?: string };

        if (payload.code === 'AUTH_INVALID_RESET_TOKEN') {
          errorCode = 'AUTH_INVALID_RESET_TOKEN';
        }
      } catch {
        // Never expose transport or API prose; the client translates a stable code.
      }

      return json({ errorCode }, { status: error.status });
    }

    return json({ errorCode: 'AUTH_RESET_UNAVAILABLE' as const }, { status: 503 });
  }
}

export default function ResetPasswordPage() {
  const { t } = useTranslation();

  const actionData = useActionData<typeof action>() as
    | {
        statusCode?: ResetFeedbackCode;
        errorCode?: ResetFeedbackCode;
        errorParams?: { count: number };
      }
    | undefined;

  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const status = actionData?.statusCode ? t(RESET_FEEDBACK_KEYS[actionData.statusCode]) : undefined;

  const error = actionData?.errorCode
    ? t(RESET_FEEDBACK_KEYS[actionData.errorCode], actionData.errorParams)
    : undefined;

  return (
    <AuthScreen
      eyebrow={t('auth.reset.eyebrow')}
      title={t('auth.reset.title')}
      description={t('auth.reset.description')}
      status={status}
      error={error}
      heroEyebrow={t('auth.reset.heroEyebrow')}
      heroTitle={t('auth.reset.heroTitle')}
      heroBody={t('auth.reset.heroBody')}
      footer={
        <>
          {t('auth.reset.footerPrompt')}{' '}
          <Link to="/login" className="vc-auth-link font-semibold hover:underline">
            {t('auth.reset.signInNewPassword')}
          </Link>
        </>
      }
    >
      <Form method="post" className="space-y-4 sm:space-y-5">
        <AuthField
          label={t('auth.common.resetToken')}
          name="token"
          required
          minLength={16}
          defaultValue={tokenFromUrl}
          placeholder={t('auth.common.resetTokenPlaceholder')}
          autoComplete="one-time-code"
          icon={<KeyRound className="h-4 w-4" />}
        />
        <AuthField
          label={t('auth.common.newPassword')}
          name="password"
          type="password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          placeholder={t('auth.common.passwordMinCharacters', { count: PASSWORD_MIN_LENGTH })}
          autoComplete="new-password"
          icon={<Lock className="h-4 w-4" />}
          inputProps={{ value: password, onChange: (event) => setPassword(event.currentTarget.value) }}
        />
        <PasswordStrengthMeter password={password} className="-mt-2" />
        <AuthField
          label={t('auth.common.confirmNewPassword')}
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          placeholder={t('auth.common.samePasswordPlaceholder')}
          autoComplete="new-password"
          icon={<Lock className="h-4 w-4" />}
        />
        <AuthSubmit
          label={t('auth.reset.submit')}
          loadingLabel={t('auth.reset.submitting')}
          isSubmitting={isSubmitting}
        />
      </Form>
    </AuthScreen>
  );
}
