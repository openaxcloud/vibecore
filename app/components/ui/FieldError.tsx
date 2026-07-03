/**
 * Single form-error pattern (design handoff E30).
 *
 * Usage:
 *   <input id="billingEmail" {...fieldErrorProps('billingEmail', error)} className={error ? '… border-[var(--vc-ide-accent-error)]' : '…'} />
 *   <FieldError fieldId="billingEmail" error={error} />
 *
 * The errored input should also get an error border — `var(--vc-ide-accent-error)`
 * on app/IDE/admin surfaces, the matching `--ecode-*` token on marketing surfaces.
 * When a form accumulates 3+ field errors, render <FormErrorSummary /> at the top
 * so keyboard/screen-reader users get one announced list with jump links.
 */

/** Stable id for a field's error message element: `${fieldId}-error`. */
export function fieldErrorId(fieldId: string): string {
  return `${fieldId}-error`;
}

/**
 * Spread onto the form control to tie it to its <FieldError />.
 * Returns {} when there is no error so the attributes are fully removed.
 */
export function fieldErrorProps(
  fieldId: string,
  error?: string | null,
): { 'aria-invalid'?: boolean; 'aria-describedby'?: string } {
  if (!error) {
    return {};
  }

  return { 'aria-invalid': true, 'aria-describedby': fieldErrorId(fieldId) };
}

/** Inline 12px error message rendered under the field it describes. */
export function FieldError({ fieldId, error }: { fieldId: string; error?: string | null }) {
  if (!error) {
    return null;
  }

  return (
    <p id={fieldErrorId(fieldId)} className="mt-1 text-xs text-[var(--status-error-text)]">
      {error}
    </p>
  );
}

/** Below this many field errors, inline messages alone are enough — no summary. */
const SUMMARY_THRESHOLD = 3;

/**
 * Top-of-form summary listing every field error with a `#field-id` jump link.
 * Renders nothing until the form has at least 3 field errors.
 */
export function FormErrorSummary({
  errors,
  title = 'Please fix the following errors:',
}: {
  errors: Array<{ fieldId: string; message: string }>;
  title?: string;
}) {
  if (errors.length < SUMMARY_THRESHOLD) {
    return null;
  }

  return (
    <div
      role="alert"
      className="mb-4 rounded-md border border-[var(--vc-ide-accent-error)] px-3 py-2 text-sm text-[var(--status-error-text)]"
    >
      <p className="font-medium">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {errors.map(({ fieldId, message }) => (
          <li key={fieldId}>
            <a className="underline underline-offset-2 hover:opacity-80" href={`#${fieldId}`}>
              {message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
