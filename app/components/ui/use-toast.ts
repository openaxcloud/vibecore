import { useCallback } from 'react';
import { toast as toastify, type Id, type UpdateOptions } from 'react-toastify';
import { themeStore } from '~/lib/stores/theme';

// Configure standard toast settings
export const configuredToast = {
  success: (message: string, options = {}) => toastify.success(message, { autoClose: 3000, ...options }),
  error: (message: string, options = {}) => toastify.error(message, { autoClose: 3000, ...options }),
  info: (message: string, options = {}) => toastify.info(message, { autoClose: 3000, ...options }),
  warning: (message: string, options = {}) => toastify.warning(message, { autoClose: 3000, ...options }),

  /*
   * A loading toast must stay up until the work resolves — resolve it with
   * `resolveToast` below. (react-toastify already forces autoClose off while
   * `isLoading` is true; the explicit `false` documents the contract instead
   * of pretending a 3000ms auto-close applies.)
   */
  loading: (message: string, options = {}) => toastify.loading(message, { autoClose: false, ...options }),
};

/**
 * Resolve a loading toast in place to its final success/error state.
 *
 * `toast.update` merges the loading toast's props, and `toast.loading` had set
 * `isLoading: true` plus disabled autoClose/closeButton/closeOnClick/draggable —
 * so all of those are explicitly restored here to the standard toast behavior.
 */
export function resolveToast(id: Id, ok: boolean, message: string, options: UpdateOptions = {}) {
  toastify.update(id, {
    render: message,
    type: ok ? 'success' : 'error',
    isLoading: false,
    autoClose: 3000,
    closeButton: true,
    closeOnClick: true,
    draggable: 'touch',
    ...options,
  });
}

// Export the original toast for cases where specific configuration is needed
export { toastify as toast };

interface ToastOptions {
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

export function useToast() {
  const toast = useCallback((message: string, options: ToastOptions = {}) => {
    const { type = 'info', duration = 3000 } = options;

    // No hard-coded `position`: inherit it from the global <ToastContainer> in root.tsx (top-right).
    toastify[type](message, {
      autoClose: duration,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: themeStore.get(),
    });
  }, []);

  const success = useCallback(
    (message: string, options: Omit<ToastOptions, 'type'> = {}) => {
      toast(message, { ...options, type: 'success' });
    },
    [toast],
  );

  const error = useCallback(
    (message: string, options: Omit<ToastOptions, 'type'> = {}) => {
      toast(message, { ...options, type: 'error' });
    },
    [toast],
  );

  const info = useCallback(
    (message: string, options: Omit<ToastOptions, 'type'> = {}) => {
      toast(message, { ...options, type: 'info' });
    },
    [toast],
  );

  const warning = useCallback(
    (message: string, options: Omit<ToastOptions, 'type'> = {}) => {
      toast(message, { ...options, type: 'warning' });
    },
    [toast],
  );

  return { toast, success, error, info, warning };
}
