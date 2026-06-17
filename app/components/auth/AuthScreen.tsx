import { Link } from '@remix-run/react';
import { ChevronLeft, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { EcodeBrandMark } from '~/components/brand/EcodeBrandMark';

const heroImage = 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=2070&auto=format&fit=crop';

interface AuthScreenProps {
  /*
   * The orange "eyebrow" chip at the top of the form. Short marketing
   * phrase ("Secure workspace access", "Reset your password", …).
   */
  eyebrow: string;
  title: string;
  description: string;

  /*
   * Optional success banner (green/neutral) shown above the form — used
   * by flows that have a positive intermediate state, e.g. "Password
   * reset instructions were sent if the account exists.".
   */
  status?: string;
  error?: string;

  /*
   * The form body itself. The shell only renders the chrome: branding,
   * card, banners and footer. Pages provide their own `<Form>` / inputs.
   */
  children: ReactNode;

  /*
   * Footer slot shown at the bottom of the card — typically a link back
   * to /login or /register.
   */
  footer?: ReactNode;

  /*
   * Right-hand marketing panel, identical across all auth screens. Pages
   * can override this if they need a screen-specific message, but the
   * default keeps the visual rhythm tight.
   */
  heroEyebrow?: string;
  heroTitle?: string;
  heroBody?: string;
  heroAside?: ReactNode;
  belowCard?: ReactNode;
  backTo?: string;
  backLabel?: string;
}

export function AuthScreen({
  eyebrow,
  title,
  description,
  status,
  error,
  children,
  footer,
  heroEyebrow = 'Enterprise-grade security',
  heroTitle = 'Build production apps with Vibecore',
  heroBody = 'Provision workspaces, share live previews and ship to your own infrastructure from a single browser tab.',
  heroAside,
  belowCard,
  backTo = '/login',
  backLabel = 'Back to sign in',
}: AuthScreenProps) {
  return (
    <main className="vc-auth-page min-h-dvh overflow-x-hidden lg:grid lg:grid-cols-[minmax(0,0.96fr)_minmax(420px,1.04fr)]">
      <section className="relative flex min-h-dvh items-start justify-center overflow-y-auto px-4 py-5 sm:px-6 sm:py-8 md:px-10 lg:items-center lg:px-12 lg:py-10 xl:px-20">
        <div className="vc-auth-left-glow absolute inset-0" />
        <div className="vc-auth-left-shade pointer-events-none absolute inset-x-0 top-0 h-28 sm:h-36" />
        <div className="relative z-10 flex min-h-[calc(100dvh-40px)] w-full max-w-[520px] flex-col justify-center sm:min-h-[calc(100dvh-64px)] lg:min-h-0 lg:max-w-[460px] xl:max-w-[500px]">
          <Link
            to={backTo}
            className="vc-auth-back-link mb-5 inline-flex w-fit items-center gap-2 rounded-md px-1 py-1 text-[12px] font-medium transition-colors sm:mb-7 sm:text-[13px]"
          >
            <ChevronLeft className="h-4 w-4" />
            {backLabel}
          </Link>

          <div className="mb-6 flex items-center gap-3 sm:mb-8">
            <EcodeBrandMark size="md" showText={false} gradientId="ecode-auth-logo" />
            <div>
              <p className="vc-auth-brand-title text-[15px] font-semibold leading-none">E-Code</p>
              <p className="vc-auth-brand-subtitle mt-1 text-[12px]">AI development workspace</p>
            </div>
          </div>

          <div className="mb-5 sm:mb-7">
            <div className="vc-auth-eyebrow mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.4px] sm:mb-4 sm:text-[11px]">
              <Sparkles className="h-3.5 w-3.5" />
              {eyebrow}
            </div>
            <h1 className="vc-auth-title max-w-[12ch] text-[clamp(2rem,9vw,2.75rem)] font-bold leading-[1.02] tracking-normal sm:max-w-none">
              {title}
            </h1>
            <p className="vc-auth-description mt-3 max-w-[36rem] text-[13px] leading-6 sm:text-[14px] lg:max-w-sm">
              {description}
            </p>
          </div>

          <div className="vc-auth-card rounded-xl p-4 backdrop-blur-xl sm:p-6 md:p-7 lg:p-6">
            {status ? (
              <div
                role="status"
                aria-live="polite"
                className="vc-auth-alert vc-auth-alert-success mb-4 rounded-md px-3 py-2 text-[12px]"
              >
                {status}
              </div>
            ) : null}
            {error ? (
              <div role="alert" className="vc-auth-alert vc-auth-alert-error mb-4 rounded-md px-3 py-2 text-[12px]">
                {error}
              </div>
            ) : null}

            {children}

            {footer ? (
              <div className="vc-auth-card-footer mt-5 border-t pt-5 text-center text-[13px]">{footer}</div>
            ) : null}
          </div>

          {belowCard}
        </div>
      </section>

      <section className="relative hidden min-h-dvh overflow-hidden lg:block">
        <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(242,98,7,0.92),rgba(249,157,37,0.84))]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.22),transparent_26%),radial-gradient(circle_at_80%_86%,rgba(10,15,28,0.36),transparent_30%)]" />
        <div className="relative z-10 flex min-h-dvh items-center justify-center p-8 xl:p-12">
          <div className="max-w-[28rem] text-white xl:max-w-md">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/18 px-4 py-2 text-[13px] font-semibold backdrop-blur-md">
              <Sparkles className="h-4 w-4" />
              {heroEyebrow}
            </div>
            <h2 className="text-[clamp(2.25rem,4vw,3.25rem)] font-bold leading-[1.03] tracking-normal">{heroTitle}</h2>
            <p className="mt-5 text-[15px] leading-7 text-white/88">{heroBody}</p>
            {heroAside}
          </div>
        </div>
      </section>
    </main>
  );
}

interface AuthFieldProps {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
  inputMode?: 'numeric' | 'text' | 'email' | 'tel' | 'url' | 'search' | 'none' | 'decimal';
  minLength?: number;
  maxLength?: number;
  icon?: ReactNode;
}

export function AuthField({
  label,
  name,
  type = 'text',
  required,
  defaultValue,
  placeholder,
  autoComplete,
  hint,
  inputMode,
  minLength,
  maxLength,
  icon,
}: AuthFieldProps) {
  return (
    <label className="block">
      <span className="vc-auth-label text-[13px] font-medium">{label}</span>
      <span className="relative mt-2 block">
        {icon ? (
          <span className="vc-auth-field-icon pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            {icon}
          </span>
        ) : null}
        <input
          name={name}
          type={type}
          required={required}
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          minLength={minLength}
          maxLength={maxLength}
          className={`vc-auth-input h-12 w-full rounded-md border ${
            icon ? 'px-10' : 'px-3'
          } text-[16px] outline-none transition-colors sm:h-11 sm:text-[13px]`}
        />
      </span>
      {hint ? <span className="vc-auth-hint mt-2 block text-[11px] leading-5">{hint}</span> : null}
    </label>
  );
}

interface AuthSubmitProps {
  label: string;
  loadingLabel?: string;
  isSubmitting?: boolean;
}

export function AuthSubmit({ label, loadingLabel, isSubmitting }: AuthSubmitProps) {
  return (
    <button
      type="submit"
      disabled={isSubmitting}
      className="vc-auth-submit inline-flex h-12 w-full items-center justify-center gap-2 rounded-md px-4 text-[14px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:text-[13px]"
    >
      {isSubmitting ? (loadingLabel ?? `${label}...`) : label}
    </button>
  );
}
