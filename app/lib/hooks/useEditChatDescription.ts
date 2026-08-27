import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { validateChatDescription } from './validateChatDescription';
import { getSidebarMenuCopy } from '~/lib/i18n/catalogs/sidebar-menu';
import {
  chatId as chatIdStore,
  db,
  description as descriptionStore,
  getMessages,
  updateChatDescription,
} from '~/lib/persistence';

interface EditChatDescriptionOptions {
  initialDescription?: string;
  customChatId?: string;
  syncWithGlobalStore?: boolean;
}

type EditChatDescriptionHook = {
  editing: boolean;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleBlur: () => Promise<void>;
  handleSubmit: (event: React.FormEvent) => Promise<void>;
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => Promise<void>;
  currentDescription: string;
  toggleEditMode: () => void;
};

/**
 * Hook to manage the state and behavior for editing chat descriptions.
 *
 * Offers functions to:
 * - Switch between edit and view modes.
 * - Manage input changes, blur, and form submission events.
 * - Save updates to IndexedDB and optionally to the global application state.
 *
 * @param {Object} options
 * @param {string} options.initialDescription - The current chat description.
 * @param {string} options.customChatId - Optional ID for updating the description via the sidebar.
 * @param {boolean} options.syncWithGlobalStore - Flag to indicate global description store synchronization.
 * @returns {EditChatDescriptionHook} Methods and state for managing description edits.
 */
export function useEditChatDescription({
  initialDescription = '',
  customChatId,
  syncWithGlobalStore,
}: EditChatDescriptionOptions): EditChatDescriptionHook {
  const { i18n } = useTranslation();
  const copy = getSidebarMenuCopy(i18n.resolvedLanguage ?? i18n.language).sidebarMenu.toasts;
  const chatIdFromStore = useStore(chatIdStore);
  const [editing, setEditing] = useState(false);
  const [currentDescription, setCurrentDescription] = useState(initialDescription);

  /**
   * The last description we know to be persisted. Used as the baseline for the
   * "no change" check so that consecutive edits (especially in sidebar rename
   * mode where `syncWithGlobalStore` is false and `initialDescription` never
   * refreshes) are diffed against what was actually saved, not the original
   * pre-first-edit prop value.
   */
  const [lastSavedDescription, setLastSavedDescription] = useState(initialDescription);

  const [chatId, setChatId] = useState<string>();

  useEffect(() => {
    setChatId(customChatId || chatIdFromStore);
  }, [customChatId, chatIdFromStore]);
  useEffect(() => {
    setCurrentDescription(initialDescription);
    setLastSavedDescription(initialDescription);
  }, [initialDescription]);

  const toggleEditMode = useCallback(() => setEditing((prev) => !prev), []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentDescription(e.target.value);
  }, []);

  const fetchLatestDescription = useCallback(async () => {
    if (!db || !chatId) {
      return initialDescription;
    }

    try {
      const chat = await getMessages(db, chatId);
      return chat?.description || initialDescription;
    } catch (error) {
      console.error('Failed to fetch latest description:', error);
      return initialDescription;
    }
  }, [db, chatId, initialDescription]);

  const handleBlur = useCallback(async () => {
    const latestDescription = await fetchLatestDescription();
    setCurrentDescription(latestDescription);
    toggleEditMode();
  }, [fetchLatestDescription, toggleEditMode]);

  const isValidDescription = useCallback(
    (desc: string): boolean => {
      const result = validateChatDescription(desc, lastSavedDescription);

      switch (result) {
        case 'unchanged':
          toggleEditMode();
          return false; // No change, skip validation
        case 'invalid-length':
          toast.error(copy.renameInvalidLength);
          return false;
        case 'invalid-characters':
          toast.error(copy.renameInvalidCharacters);
          return false;
        case 'valid':
        default:
          return true;
      }
    },
    [copy.renameInvalidCharacters, copy.renameInvalidLength, lastSavedDescription, toggleEditMode],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      if (!isValidDescription(currentDescription)) {
        return;
      }

      try {
        if (!db) {
          toast.error(copy.renameStorageUnavailable);
          return;
        }

        if (!chatId) {
          toast.error(copy.renameMissingId);
          return;
        }

        await updateChatDescription(db, chatId, currentDescription);

        /*
         * Track what we just persisted so that a subsequent edit is diffed
         * against the saved value rather than the original (now stale) prop.
         */
        setLastSavedDescription(currentDescription.trim());

        if (syncWithGlobalStore) {
          descriptionStore.set(currentDescription);
        }

        toast.success(copy.renameSuccess);
      } catch (error) {
        console.error('Failed to update chat description:', error);
        toast.error(copy.renameFailed);
      }

      toggleEditMode();
    },
    [
      chatId,
      copy.renameFailed,
      copy.renameMissingId,
      copy.renameStorageUnavailable,
      copy.renameSuccess,
      currentDescription,
      db,
      isValidDescription,
      syncWithGlobalStore,
      toggleEditMode,
    ],
  );

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        await handleBlur();
      }
    },
    [handleBlur],
  );

  return {
    editing,
    handleChange,
    handleBlur,
    handleSubmit,
    handleKeyDown,
    currentDescription,
    toggleEditMode,
  };
}
