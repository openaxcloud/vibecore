import { Check, X } from 'lucide-react';

/*
 * Mirrors the API's `registerSchema` (services/api/src/app.ts):
 * `password: z.string().min(8).max(128)`. The submit hard-block must never
 * be stricter than what the server actually enforces — everything beyond
 * 8 characters is presented as a *recommended* strength criterion, not a
 * requirement.
 */
export const PASSWORD_MIN_LENGTH = 8;

/** Recommended (not enforced) length for a "Strong" rating. */
const PASSWORD_STRONG_LENGTH = 12;

interface PasswordCriteria {
  minLength: boolean;
  longLength: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
  hasMixedCase: boolean;
}

export interface PasswordStrength {
  /** 0 = empty, 1 = weak … 4 = strong. */
  score: 0 | 1 | 2 | 3 | 4;
  criteria: PasswordCriteria;
}

/*
 * Score 0–4 from real criteria: length tiers (8 / 12), number, symbol and
 * mixed case. Anything under the server minimum is pinned to "Weak", and a
 * password can only reach "Strong" once it clears the recommended 12-char
 * tier — a short password stuffed with symbols shouldn't read as strong.
 */
export function evaluatePassword(password: string): PasswordStrength {
  const criteria: PasswordCriteria = {
    minLength: password.length >= PASSWORD_MIN_LENGTH,
    longLength: password.length >= PASSWORD_STRONG_LENGTH,
    hasNumber: /\d/.test(password),
    hasSymbol: /[^A-Za-z0-9]/.test(password),
    hasMixedCase: /[a-z]/.test(password) && /[A-Z]/.test(password),
  };

  if (password.length === 0) {
    return { score: 0, criteria };
  }

  if (!criteria.minLength) {
    return { score: 1, criteria };
  }

  const points = Object.values(criteria).filter(Boolean).length;
  const cap = criteria.longLength ? 4 : 3;

  return { score: Math.max(1, Math.min(points, cap)) as PasswordStrength['score'], criteria };
}

/*
 * Status tokens only (design accent policy: orange stays reserved for
 * brand CTAs; state colors come from the shared status palette).
 */
const SCORE_META: Record<1 | 2 | 3 | 4, { label: string; color: string }> = {
  1: { label: 'Weak', color: 'var(--status-error-text)' },
  2: { label: 'Fair', color: 'var(--status-warning-text)' },
  3: { label: 'Good', color: 'var(--status-warning-text)' },
  4: { label: 'Strong', color: 'var(--status-success-text)' },
};

const CHECKLIST: Array<{ key: keyof PasswordCriteria; label: string; required?: boolean }> = [
  { key: 'minLength', label: `At least ${PASSWORD_MIN_LENGTH} characters (required)`, required: true },
  { key: 'longLength', label: `${PASSWORD_STRONG_LENGTH}+ characters` },
  { key: 'hasNumber', label: 'At least one number' },
  { key: 'hasSymbol', label: 'At least one symbol' },
];

/**
 * Live password feedback for the register form: a 4-segment strength gauge
 * plus a per-criterion checklist. Rendered right under the password input;
 * announcements go through a polite live region so screen readers hear
 * criteria flip as the user types without being interrupted mid-keystroke.
 */
export function PasswordStrengthMeter({ password, className }: { password: string; className?: string }) {
  const { score, criteria } = evaluatePassword(password);
  const meta = score === 0 ? null : SCORE_META[score];

  return (
    <div className={className} aria-live="polite">
      <div className="flex items-center gap-2">
        <div
          role="meter"
          aria-label="Password strength"
          aria-valuemin={0}
          aria-valuemax={4}
          aria-valuenow={score}
          aria-valuetext={meta ? meta.label : 'Empty'}
          className="grid flex-1 grid-cols-4 gap-1"
        >
          {[1, 2, 3, 4].map((segment) => (
            <span
              key={segment}
              className="h-1 rounded-full transition-colors"
              style={{
                background: meta && segment <= score ? meta.color : 'var(--vc-auth-border-subtle)',
              }}
            />
          ))}
        </div>
        <span
          className="min-w-[3.5rem] text-right text-[11px] font-semibold"
          style={{ color: meta?.color ?? 'var(--vc-auth-muted)' }}
        >
          {meta ? meta.label : ' '}
        </span>
      </div>

      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {CHECKLIST.map(({ key, label, required }) => {
          const met = criteria[key];

          const color = met
            ? 'var(--status-success-text)'
            : required && password.length > 0
              ? 'var(--status-error-text)'
              : 'var(--vc-auth-muted)';

          return (
            <li key={key} className="flex items-center gap-1.5 text-[11px] leading-5" style={{ color }}>
              {met ? (
                <Check className="h-3 w-3 shrink-0" aria-hidden />
              ) : (
                <X className="h-3 w-3 shrink-0" aria-hidden />
              )}
              <span>
                {label}
                <span className="sr-only">{met ? ' — met' : ' — not met'}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
