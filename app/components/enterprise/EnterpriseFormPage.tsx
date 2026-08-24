import type React from 'react';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { FieldError, fieldErrorProps } from '~/components/ui/FieldError';

interface EnterpriseFormPageProps {
  title: string;
  description: string;
  children: React.ReactNode;
  status?: string;
  error?: string;
}

/*
 * Every enterprise/account form page (session-security, recovery-codes, invoices,
 * payment-method, audit-logs, org security/siem/domains, scim-token, …) renders
 * through this component. It used to render its own bare <main> with NO app nav,
 * so those routes trapped the user with no header/hamburger/back. It now renders
 * inside the shared AppShell (mobile header + hamburger + drawer + active-item
 * highlight). AppShell owns the title header, so this only supplies the form card,
 * anchored to the top (the previous `justify-center` produced a large empty gap
 * above short forms — e.g. recovery-codes).
 */
export function EnterpriseFormPage({ title, description, children, status, error }: EnterpriseFormPageProps) {
  return (
    <AppShell title={title} description={description} serverSync={false}>
      <div className="w-full max-w-3xl">
        <div className="w-full max-w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm sm:p-6">
          {status ? (
            <p
              role="status"
              className="mb-4 rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm text-bolt-elements-textSecondary"
            >
              {status}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mb-4 rounded-md border border-red-500/40 px-3 py-2 text-sm text-red-500">
              {error}
            </p>
          ) : null}
          {children}
        </div>
      </div>
    </AppShell>
  );
}

export function TextField(props: {
  label: string;
  type?: string;
  name: string;

  /** Stable DOM id — required for `error` so FieldError/summary anchors can target the input. */
  id?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  autoComplete?: string;
  error?: string | null;
}) {
  const error = props.id ? props.error : undefined;

  return (
    <label className="block text-sm font-medium">
      {props.label}
      <input
        className={`mt-2 w-full rounded-md border ${
          error ? 'border-[var(--vc-ide-accent-error)]' : 'border-bolt-elements-borderColor'
        } min-h-[44px] bg-bolt-elements-background-depth-1 px-3 py-2 text-sm outline-none focus:border-bolt-elements-focus`}
        id={props.id}
        name={props.name}
        placeholder={props.placeholder}
        type={props.type ?? 'text'}
        defaultValue={props.defaultValue}
        required={props.required}
        autoComplete={props.autoComplete}
        {...(props.id ? fieldErrorProps(props.id, error) : {})}
      />
      {props.id ? <FieldError fieldId={props.id} error={error} /> : null}
    </label>
  );
}

export function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="min-h-[44px] rounded-md bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-medium text-bolt-elements-button-primary-text disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function SelectField(props: {
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block text-sm font-medium">
      {props.label}
      <select
        className="mt-2 min-h-[44px] w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm outline-none focus:border-bolt-elements-focus"
        name={props.name}
        defaultValue={props.defaultValue}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
