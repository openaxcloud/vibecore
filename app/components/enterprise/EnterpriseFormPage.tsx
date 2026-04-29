import type React from 'react';

interface EnterpriseFormPageProps {
  title: string;
  description: string;
  children: React.ReactNode;
  status?: string;
  error?: string;
}

export function EnterpriseFormPage({ title, description, children, status, error }: EnterpriseFormPageProps) {
  return (
    <main className="min-h-screen bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-normal">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm text-bolt-elements-textSecondary">{description}</p>
        </div>
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6 shadow-sm">
          {status ? (
            <p className="mb-4 rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm text-bolt-elements-textSecondary">
              {status}
            </p>
          ) : null}
          {error ? (
            <p className="mb-4 rounded-md border border-red-500/40 px-3 py-2 text-sm text-red-500">{error}</p>
          ) : null}
          {children}
        </div>
      </section>
    </main>
  );
}

export function TextField(props: {
  label: string;
  type?: string;
  name: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium">
      {props.label}
      <input
        className="mt-2 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm outline-none focus:border-bolt-elements-focus"
        name={props.name}
        placeholder={props.placeholder}
        type={props.type ?? 'text'}
        defaultValue={props.defaultValue}
        required={props.required}
      />
    </label>
  );
}

export function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-md bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-medium text-bolt-elements-button-primary-text disabled:cursor-not-allowed disabled:opacity-60"
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
        className="mt-2 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm outline-none focus:border-bolt-elements-focus"
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
