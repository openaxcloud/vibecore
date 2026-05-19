import { Link } from '@remix-run/react';
import { ChevronLeft, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

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
  heroTitle = 'Build production apps with an AI co-pilot',
  heroBody = 'Provision workspaces, share live previews and ship to your own infrastructure — all from a single browser tab.',
}: AuthScreenProps) {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#0A0F1C] text-[#F5F9FC] lg:grid lg:grid-cols-[minmax(0,0.96fr)_minmax(420px,1.04fr)]">
      <section className="relative flex min-h-dvh items-start justify-center overflow-y-auto px-4 py-5 sm:px-6 sm:py-8 md:px-10 lg:items-center lg:px-12 lg:py-10 xl:px-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(0,153,255,0.14),transparent_28%),radial-gradient(circle_at_84%_86%,rgba(123,97,255,0.16),transparent_32%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,rgba(14,21,37,0.72),transparent)] sm:h-36" />
        <div className="relative z-10 flex min-h-[calc(100dvh-40px)] w-full max-w-[520px] flex-col justify-center sm:min-h-[calc(100dvh-64px)] lg:min-h-0 lg:max-w-[460px] xl:max-w-[500px]">
          <Link
            to="/login"
            className="mb-5 inline-flex w-fit items-center gap-2 rounded-md px-1 py-1 text-[12px] font-medium text-[#6E7681] transition-colors hover:text-[#F5F9FC] focus:outline-none focus:ring-2 focus:ring-[#0099FF] focus:ring-offset-2 focus:ring-offset-[#0A0F1C] sm:mb-7 sm:text-[13px]"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to sign in
          </Link>

          <div className="mb-6 flex items-center gap-3 sm:mb-8">
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-[#2B3245] bg-[#0E1525] shadow-[0_12px_32px_rgba(0,4,20,0.45)] sm:h-11 sm:w-11">
              <img src="/logo.png" alt="E-code" className="h-6 w-6 rounded object-contain sm:h-7 sm:w-7" />
            </div>
            <div>
              <p className="text-[15px] font-semibold leading-none text-white">E-code</p>
              <p className="mt-1 text-[12px] text-[#6E7681]">Enterprise Development Platform</p>
            </div>
          </div>

          <div className="mb-5 sm:mb-7">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#2B3245] bg-[#1A2030] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.4px] text-[#C2C8CC] sm:mb-4 sm:text-[11px]">
              <Sparkles className="h-3.5 w-3.5 text-[#F26207]" />
              {eyebrow}
            </div>
            <h1 className="max-w-[12ch] text-[clamp(2rem,9vw,2.75rem)] font-bold leading-[1.02] tracking-normal text-white sm:max-w-none">
              {title}
            </h1>
            <p className="mt-3 max-w-[36rem] text-[13px] leading-6 text-[#C2C8CC] sm:text-[14px] lg:max-w-sm">
              {description}
            </p>
          </div>

          <div className="rounded-xl border border-[#2B3245] bg-[rgba(14,21,37,0.88)] p-4 shadow-[0_24px_64px_rgba(0,4,20,0.62)] backdrop-blur-xl sm:p-6 md:p-7 lg:p-6">
            {status ? (
              <div className="mb-4 rounded-md border border-[#2EA043]/40 bg-[#2EA043]/10 px-3 py-2 text-[12px] text-[#86EFAC]">
                {status}
              </div>
            ) : null}
            {error ? (
              <div className="mb-4 rounded-md border border-[#F85149]/40 bg-[#F85149]/10 px-3 py-2 text-[12px] text-[#FCA5A5]">
                {error}
              </div>
            ) : null}

            {children}

            {footer ? (
              <div className="mt-5 border-t border-[#1A2030] pt-5 text-center text-[13px] text-[#6E7681]">{footer}</div>
            ) : null}
          </div>
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
  icon,
}: AuthFieldProps) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-[#F5F9FC]">{label}</span>
      <span className="relative mt-2 block">
        {icon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6E7681]">{icon}</span>
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
          className={`h-12 w-full rounded-md border border-[#2B3245] bg-[#0A0F1C] ${
            icon ? 'px-10' : 'px-3'
          } text-[16px] text-white outline-none transition-colors placeholder:text-[#6E7681] focus:border-[#0099FF] focus:ring-2 focus:ring-[#0099FF]/20 sm:h-11 sm:text-[13px]`}
        />
      </span>
      {hint ? <span className="mt-2 block text-[11px] leading-5 text-[#6E7681]">{hint}</span> : null}
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
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-[#F26207] to-[#F99D25] px-4 text-[14px] font-bold text-white shadow-[0_12px_32px_rgba(242,98,7,0.26)] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#0099FF] focus:ring-offset-2 focus:ring-offset-[#0E1525] disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:text-[13px]"
    >
      {isSubmitting ? (loadingLabel ?? `${label}...`) : label}
    </button>
  );
}
