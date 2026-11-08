import { useEffect, useRef, type FormEventHandler } from 'react';
import { useTranslation } from 'react-i18next';
import { useIdeSettingsFormDraft } from './IdeSettingsDraftState';
import { PanelButton, PanelInput } from '~/components/project-ide/PanelPrimitives';

export interface SnapshotReceipt {
  id: string;
  label?: string;
}
export interface SnapshotCreateFormProps {
  projectId?: string;
  paneId?: string;
  snapshots: readonly SnapshotReceipt[];
  onSubmit: FormEventHandler<HTMLFormElement>;
  busy: boolean;
}
export function SnapshotCreateForm({ projectId, paneId, snapshots, onSubmit, busy }: SnapshotCreateFormProps) {
  const { t } = useTranslation();
  const draft = useIdeSettingsFormDraft(projectId ?? '', paneId, { 'snapshots.label': '' });

  /*
   * A replaced surface cannot safely attribute a receipt to its old submission.
   * Keep the shared text in that case; never auto-resubmit or clear an uncertain draft.
   */
  const pending = useRef<{
    scope: string;
    label: string;
    existingIds: Set<string>;
    acknowledge: () => void;
  }>();

  const scope = JSON.stringify([projectId, paneId]);
  useEffect(() => {
    const submission = pending.current;

    if (!submission) {
      return;
    }

    if (submission.scope !== scope) {
      pending.current = undefined;
      return;
    }

    if (snapshots.some((snapshot) => snapshot.label === submission.label && !submission.existingIds.has(snapshot.id))) {
      submission.acknowledge();
      pending.current = undefined;
    }
  }, [scope, snapshots]);

  const submit: FormEventHandler<HTMLFormElement> = (event) => {
    pending.current = {
      scope,
      label: draft.values['snapshots.label'] ?? '',
      existingIds: new Set(snapshots.map((snapshot) => snapshot.id)),
      acknowledge: draft.captureSubmission('snapshots.label'),
    };
    onSubmit(event);
  };

  return (
    <form onSubmit={submit} className="bolt-project-snapshots-create">
      <input name="intent" value="create" type="hidden" />
      <PanelInput
        name="label"
        value={draft.values['snapshots.label'] ?? ''}
        onChange={(event) => draft.setField('snapshots.label', event.target.value)}
        placeholder={t('chat.copy.manualCheckpoint_b29f671a')}
      />
      <PanelButton disabled={busy}>{t('chat.copy.newCheckpoint_3480863c')}</PanelButton>
    </form>
  );
}
