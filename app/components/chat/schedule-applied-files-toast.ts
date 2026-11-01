import { toast } from 'react-toastify';
import { AGENT_APPLIED_TOAST_ID, showCoalescedAppliedToast } from './AppliedFilesToast';
import { AppliedFilesToastBuffer } from './applied-files-toast-buffer';
import { constatDeGenerationStore } from '~/lib/stores/constat-de-generation';
import { workbenchStore } from '~/lib/stores/workbench';

// One batch for initial application and both recovery surfaces (chat and Studio).
const buffer = new AppliedFilesToastBuffer();

let timer: ReturnType<typeof setTimeout> | undefined;
let open = false;

function dismiss() {
  if (timer) {
    clearTimeout(timer);
  }

  timer = undefined;
  open = false;
  buffer.reset();
  toast.dismiss(AGENT_APPLIED_TOAST_ID);
}

export function scheduleAppliedFilesToast(filePath: string, proposalId: string) {
  // Clear the previous closed batch BEFORE adding the new confirmed write.
  if (open && !toast.isActive(AGENT_APPLIED_TOAST_ID)) {
    open = false;
    buffer.reset();
  }

  buffer.add(filePath, proposalId);

  if (timer) {
    clearTimeout(timer);
  }

  timer = setTimeout(() => {
    timer = undefined;

    const { files, proposalIds } = buffer.snapshot();
    open = true;
    showCoalescedAppliedToast(
      files,
      {
        onUndoAll: () => {
          for (const id of proposalIds) {
            void workbenchStore.revertAgentPatchProposal(id);
          }
          dismiss();
        },
        onDismissAll: dismiss,
      },
      constatDeGenerationStore.get(),
    );
  }, 80);
}
