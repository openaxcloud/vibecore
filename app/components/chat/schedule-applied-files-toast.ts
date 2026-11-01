import { toast } from 'react-toastify';
import { AGENT_APPLIED_TOAST_ID, showCoalescedAppliedToast } from './AppliedFilesToast';
import { AppliedFilesToastBuffer } from './applied-files-toast-buffer';
import { constatDeGenerationStore } from '~/lib/stores/constat-de-generation';
import { workbenchStore } from '~/lib/stores/workbench';

// One batch for initial application and both recovery surfaces (chat and Studio).
const buffer = new AppliedFilesToastBuffer();
const reverting = new Set<string>();

let timer: ReturnType<typeof setTimeout> | undefined;
let open = false;
let closing = false;
let generation = 0;

function cancelFlush() {
  if (timer) {
    clearTimeout(timer);
  }

  timer = undefined;
}

function closeToast() {
  open = false;

  if (closing) {
    return;
  }

  const element = typeof document === 'undefined' ? null : document.getElementById(String(AGENT_APPLIED_TOAST_ID));

  if (element) {
    closing = true;

    /*
     * Toastify emits "removed" before its exit animation removes the DOM node.
     * Wait for actual removal before reusing the id, without a guessed delay.
     */
    const observer = new MutationObserver(() => {
      if (element.isConnected) {
        return;
      }

      observer.disconnect();
      closing = false;

      if (!buffer.isEmpty()) {
        flush();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  toast.dismiss(AGENT_APPLIED_TOAST_ID);
}

function flush() {
  cancelFlush();

  if (closing) {
    return;
  }

  const { files, proposalIds: displayedIds } = buffer.snapshot();

  if (!displayedIds.length) {
    return;
  }

  const renderedGeneration = generation;
  open = true;
  showCoalescedAppliedToast(
    files,
    {
      onUndoAll: () => {
        if (generation !== renderedGeneration) {
          return;
        }

        // Consume all confirmed writes atomically, including arrivals before this flush.
        const { proposalIds } = buffer.snapshot();
        buffer.reset();
        cancelFlush();

        const consumedGeneration = ++generation;

        for (const id of proposalIds) {
          reverting.add(id);
        }

        /*
         * Keep the existing toast mounted while reverting: a new batch can update it
         * without racing React Toastify's asynchronous dismissal of the same toast id.
         */
        void Promise.allSettled(
          proposalIds.map(async (id) => {
            try {
              await workbenchStore.revertAgentPatchProposal(id);
            } finally {
              reverting.delete(id);
            }
          }),
        ).then(() => {
          if (generation === consumedGeneration && buffer.isEmpty()) {
            closeToast();
          }
        });
      },
      onDismissAll: () => {
        if (generation !== renderedGeneration) {
          return;
        }

        const pending = buffer.snapshot();
        buffer.reset();
        cancelFlush();
        generation++;

        // Closing what was displayed must not discard a newly confirmed, unseen file.
        pending.proposalIds.forEach((id, index) => {
          if (!displayedIds.includes(id)) {
            buffer.add(pending.files[index], id);
          }
        });

        if (buffer.isEmpty()) {
          closeToast();
        } else {
          flush();
        }
      },
    },
    constatDeGenerationStore.get(),
  );
}

export function scheduleAppliedFilesToast(filePath: string, proposalId: string) {
  if (reverting.has(proposalId)) {
    return;
  }

  // Clear the previous closed batch BEFORE adding the new confirmed write.
  if (open && !toast.isActive(AGENT_APPLIED_TOAST_ID)) {
    open = false;
    buffer.reset();
    generation++;
  }

  buffer.add(filePath, proposalId);
  cancelFlush();
  timer = setTimeout(flush, 80);
}
