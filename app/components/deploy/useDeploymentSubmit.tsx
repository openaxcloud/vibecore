import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { getProjectDeploymentsCopy } from '~/lib/i18n/catalogs/project-user-area';

/** One confirmation and mutation gate for Overview, history and the publish forms. */
export function useDeploymentSubmit(
  onSubmit: (form: FormData) => void | Promise<void>,
  busy: boolean,
  language: string,
  scopeKey: string,
) {
  const pending = useRef<{ form: FormData; scopeKey: string }>();
  const submitting = useRef(false);
  const generation = useRef(0);
  const [intent, setIntent] = useState<'cancel' | 'rollback'>();
  const copy = getProjectDeploymentsCopy(language);

  useEffect(() => {
    generation.current += 1;
    pending.current = undefined;
    submitting.current = false;
    setIntent(undefined);

    return () => {
      generation.current += 1;
      pending.current = undefined;
    };
  }, [scopeKey]);

  useEffect(() => {
    if (!busy) {
      submitting.current = false;
    }
  }, [busy]);

  const send = useCallback(
    async (form: FormData) => {
      if (busy || submitting.current) {
        return;
      }

      submitting.current = true;

      const requestGeneration = generation.current;

      try {
        await onSubmit(form);
      } finally {
        if (requestGeneration === generation.current) {
          submitting.current = false;
        }
      }
    },
    [busy, onSubmit],
  );

  const submit = useCallback(
    async (input: FormData | React.FormEvent<HTMLFormElement>) => {
      if (!(input instanceof FormData)) {
        input.preventDefault();
      }

      if (busy || submitting.current || pending.current) {
        return;
      }

      const form = input instanceof FormData ? input : new FormData(input.currentTarget);
      const action = form.get('intent');

      if (action === 'cancel' || action === 'rollback') {
        pending.current = { form, scopeKey };
        setIntent(action);
      } else {
        await send(form);
      }
    },
    [busy, send, scopeKey],
  );

  const dismiss = () => {
    pending.current = undefined;
    setIntent(undefined);
  };

  const labels = copy.confirmations[intent ?? 'cancel'];

  const confirmation = (
    <ConfirmationDialog
      isOpen={Boolean(intent)}
      onClose={dismiss}
      onConfirm={() => {
        const confirmation = pending.current;
        dismiss();

        if (confirmation?.scopeKey === scopeKey) {
          send(confirmation.form);
        }
      }}
      title={labels.title}
      description={labels.description}
      confirmLabel={labels.confirm}
      variant={intent === 'cancel' ? 'destructive' : 'default'}
    />
  );

  return { submit, confirmation };
}
