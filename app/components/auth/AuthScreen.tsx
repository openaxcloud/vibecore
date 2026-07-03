import { ChevronLeft, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';
import { EcodeBrandMark } from '~/components/brand/EcodeBrandMark';
import { RevealButton } from '~/components/ui/RevealButton';

/*
 * The right-hand hero panel is a pure token-gradient treatment (brand orange,
 * identical in both themes) with an existing product screenshot from the
 * Press/marketing asset set — no third-party stock-image dependency.
 */
const heroScreenshot = '/ecode-static/assets/product/ide.png';

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
  heroTitle = 'Build production apps with E-Code',
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
        <div className="absolute inset-0 bg-[linear-gradient(135deg,var(--ecode-orange),#f99d25)]" />
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
            <div className="mt-10 overflow-hidden rounded-xl border border-white/25 bg-[rgba(10,15,28,0.24)] shadow-[0_24px_64px_rgba(10,15,28,0.35)]">
              <img src={heroScreenshot} alt="" aria-hidden="true" loading="lazy" className="block w-full" />
            </div>
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

  /*
   * Extra attributes spread onto the <input> itself — used by the login
   * page's field-error wiring (`fieldErrorProps`: id / aria-invalid /
   * aria-describedby) without AuthField knowing about that pattern.
   */
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
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
  inputProps,
}: AuthFieldProps) {
  const isPassword = type === 'password';
  const inputRef = useRef<HTMLInputElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  /*
   * Swapping type password<->text can drop the caret in some browsers, so
   * capture the selection and restore it right after the re-render — the
   * toggle itself never takes focus (RevealButton prevents mousedown).
   */
  const toggleRevealed = () => {
    const input = inputRef.current;
    const selection = input ? ([input.selectionStart, input.selectionEnd] as const) : null;

    setRevealed((current) => !current);

    requestAnimationFrame(() => {
      if (input && selection && document.activeElement === input) {
        input.setSelectionRange(selection[0], selection[1]);
      }
    });
  };

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
          ref={inputRef}
          name={name}
          type={isPassword && revealed ? 'text' : type}
          required={required}
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          minLength={minLength}
          maxLength={maxLength}
          onKeyUp={isPassword ? (event) => setCapsLockOn(event.getModifierState('CapsLock')) : undefined}
          onBlur={isPassword ? () => setCapsLockOn(false) : undefined}
          className={`vc-auth-input h-12 w-full rounded-md border ${
            icon ? 'pl-10' : 'pl-3'
          } ${isPassword ? 'pr-11' : icon ? 'pr-10' : 'pr-3'} text-[16px] outline-none transition-colors sm:h-11 sm:text-[13px]`}
          {...inputProps}
        />
        {isPassword ? (
          <RevealButton
            revealed={revealed}
            onToggle={toggleRevealed}
            className="absolute right-1.5 top-1/2 -translate-y-1/2"
          />
        ) : null}
      </span>
      {isPassword && capsLockOn ? (
        <span className="mt-2 block text-[12px] leading-5" style={{ color: 'var(--status-warning-text)' }}>
          Caps Lock is on
        </span>
      ) : null}
      {hint ? <span className="vc-auth-hint mt-2 block text-[11px] leading-5">{hint}</span> : null}
    </label>
  );
}

interface AuthSubmitProps {
  label: string;
  loadingLabel?: string;
  isSubmitting?: boolean;

  /*
   * Extra disable condition beyond the form's own submission — e.g. an OAuth
   * redirect in flight, or the register password below the server minimum.
   * Combined with `isSubmitting`, never replacing it.
   */
  disabled?: boolean;
}

export function AuthSubmit({ label, loadingLabel, isSubmitting, disabled }: AuthSubmitProps) {
  return (
    <button
      type="submit"
      disabled={isSubmitting || disabled}
      className="vc-auth-submit inline-flex h-12 w-full items-center justify-center gap-2 rounded-md px-4 text-[14px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:text-[13px]"
    >
      {isSubmitting ? (loadingLabel ?? `${label}...`) : label}
    </button>
  );
}

/*
 * Shared pending-state for the social sign-in buttons on the login and
 * register pages. Clicking an OAuth button marks its provider as pending
 * (spinner + every auth CTA disabled) while the browser navigates to
 * `/auth/oauth/<provider>`. If the redirect never completes — popup/redirect
 * blocked, or the user navigated back via bfcache — a ~10s safety timeout
 * re-enables the buttons so the page is never stuck disabled.
 */
export function useAuthOauthPending() {
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startOAuth = useCallback((provider: string) => {
    setPendingProvider(provider);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setPendingProvider(null);
    }, 10_000);
  }, []);

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  return { pendingProvider, startOAuth };
}

interface AuthOauthButtonProps {
  /* Provider slug — must match the `/auth/oauth/<provider>` route param. */
  provider: string;
  label: string;
  icon: ReactNode;
  pendingProvider: string | null;
  onStart: (provider: string) => void;

  /* Extra disable condition, e.g. the email/password form is submitting. */
  disabled?: boolean;
}

/*
 * Social sign-in button used by both the login and register pages. It is a
 * real link (the OAuth flow is a full-page navigation to the provider), so
 * "disabled" is expressed with aria-disabled + preventDefault rather than a
 * `disabled` attribute.
 */
export function AuthOauthButton({ provider, label, icon, pendingProvider, onStart, disabled }: AuthOauthButtonProps) {
  const isPending = pendingProvider === provider;
  const isDisabled = disabled || (pendingProvider !== null && !isPending);

  return (
    <Link
      to={`/auth/oauth/${provider}`}
      aria-disabled={isDisabled || isPending || undefined}
      aria-busy={isPending || undefined}
      onClick={(event) => {
        if (isDisabled || isPending) {
          event.preventDefault();
          return;
        }

        // Set pending state, then let the default navigation proceed.
        onStart(provider);
      }}
      className={`vc-auth-secondary-action inline-flex h-11 items-center justify-center gap-2 rounded-md border px-3 text-[13px] font-semibold transition-colors ${
        isDisabled || isPending ? 'cursor-not-allowed opacity-60' : ''
      }`}
    >
      {isPending ? <span className="i-svg-spinners:90-ring-with-bg h-4 w-4" aria-hidden="true" /> : icon}
      {label}
    </Link>
  );
}
