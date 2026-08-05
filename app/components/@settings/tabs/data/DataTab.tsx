import { motion } from 'framer-motion';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { DataVisualization } from './DataVisualization';
import { Button } from '~/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '~/components/ui/Card';
import { ConfirmationDialog, SelectionDialog } from '~/components/ui/Dialog';
import { useDataOperations } from '~/lib/hooks/useDataOperations';
import {
  formatDataSettingsOperationError,
  formatSearchDataSettingsDateTime,
  formatSearchDataSettingsPlural,
  getDataSettingsCopy,
  interpolateSearchDataSettingsCopy,
  resolveSearchDataSettingsLanguage,
  type DataSettingsCopy,
} from '~/lib/i18n/catalogs/search-data-settings';
import { getAllChats, type Chat } from '~/lib/persistence/chats';
import { openDatabase } from '~/lib/persistence/db';
import { classNames } from '~/utils/classNames';

// Create a custom hook to connect to the boltHistory database
function useBoltHistoryDB(initializationErrorMessage: string) {
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const initializationErrorRef = useRef(initializationErrorMessage);

  useEffect(() => {
    initializationErrorRef.current = initializationErrorMessage;
  }, [initializationErrorMessage]);

  useEffect(() => {
    let opened: IDBDatabase | null = null;

    const initDB = async () => {
      try {
        setIsLoading(true);

        const database = await openDatabase();
        opened = database || null;
        setDb(opened);
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(initializationErrorRef.current));
        setIsLoading(false);
      }
    };

    initDB();

    return () => {
      if (opened) {
        opened.close();
      }
    };
  }, []);

  return { db, isLoading, error };
}

// Extend the Chat interface to include the missing properties
interface ExtendedChat extends Chat {
  title?: string;
  updatedAt?: number;
}

// Helper function to create a chat label and description
function createChatItem(chat: Chat, copy: DataSettingsCopy, language: 'en' | 'fr'): ChatItem {
  const updatedAt = (chat as ExtendedChat).updatedAt || Date.parse(chat.timestamp);

  const messages = formatSearchDataSettingsPlural(language, chat.messages.length, {
    one: copy.chats.messages_one,
    other: copy.chats.messages_other,
  });

  return {
    id: chat.id,

    // Use description as title if available, or format a short ID
    label:
      (chat as ExtendedChat).title ||
      chat.description ||
      interpolateSearchDataSettingsCopy(copy.chats.fallbackLabel, { id: chat.id.slice(0, 8) }),

    // Format the description with message count and timestamp
    description: interpolateSearchDataSettingsCopy(copy.chats.updated, {
      messages,
      date: formatSearchDataSettingsDateTime(updatedAt, language),
    }),
  };
}

interface SettingsCategory {
  id: string;
  label: string;
  description: string;
}

interface ChatItem {
  id: string;
  label: string;
  description: string;
}

export function DataTab() {
  const { i18n } = useTranslation();
  const language = resolveSearchDataSettingsLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getDataSettingsCopy(language);

  // Use our custom hook for the boltHistory database
  const {
    db,
    isLoading: dbLoading,
    error: dbError,
  } = useBoltHistoryDB(copy.operations.technical.databaseInitialization);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const apiKeyFileInputRef = useRef<HTMLInputElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  // State for confirmation dialogs
  const [showResetInlineConfirm, setShowResetInlineConfirm] = useState(false);
  const [showDeleteInlineConfirm, setShowDeleteInlineConfirm] = useState(false);
  const [showSettingsSelection, setShowSettingsSelection] = useState(false);
  const [showChatsSelection, setShowChatsSelection] = useState(false);

  // State for settings categories and available chats
  const settingsCategories = useMemo<SettingsCategory[]>(
    () =>
      Object.entries(copy.categories).map(([id, category]) => ({
        id,
        ...category,
      })),
    [copy.categories],
  );

  const [availableChats, setAvailableChats] = useState<ExtendedChat[]>([]);
  const [chatItems, setChatItems] = useState<ChatItem[]>([]);

  // Data operations hook with boltHistory database
  const {
    isExporting,
    isImporting,
    isResetting,
    isDownloadingTemplate,
    handleExportSettings,
    handleExportSelectedSettings,
    handleExportAllChats,
    handleExportSelectedChats,
    handleImportSettings,
    handleImportChats,
    handleResetSettings,
    handleResetChats,
    handleDownloadTemplate,
    handleImportAPIKeys,
  } = useDataOperations({
    language,
    customDb: db || undefined, // Pass the boltHistory database, converting null to undefined
    onReloadSettings: () => window.location.reload(),
    onReloadChats: () => {
      // Reload chats after reset
      if (db) {
        getAllChats(db)
          .then((chats) => {
            // Cast to ExtendedChat to handle additional properties
            const extendedChats = chats as ExtendedChat[];
            setAvailableChats(extendedChats);
            setChatItems(extendedChats.map((chat) => createChatItem(chat, copy, language)));
          })
          .catch((error) => {
            console.error('Failed to reload chats after reset:', error);
            toast.error(copy.feedback.reloadChatsFailed);
          });
      }
    },
    onResetSettings: () => setShowResetInlineConfirm(false),
    onResetChats: () => setShowDeleteInlineConfirm(false),
  });

  // Loading states for operations not provided by the hook
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImportingKeys, setIsImportingKeys] = useState(false);

  // Load available chats
  useEffect(() => {
    if (db) {
      console.log('Loading chats from boltHistory database', {
        name: db.name,
        version: db.version,
        objectStoreNames: Array.from(db.objectStoreNames),
      });

      getAllChats(db)
        .then((chats) => {
          console.log('Found chats:', chats.length);

          // Cast to ExtendedChat to handle additional properties
          const extendedChats = chats as ExtendedChat[];
          setAvailableChats(extendedChats);

          // Create ChatItems for selection dialog
          setChatItems(extendedChats.map((chat) => createChatItem(chat, copy, language)));
        })
        .catch((error) => {
          console.error('Error loading chats:', error);
          toast.error(formatDataSettingsOperationError(language, copy.feedback.loadChatsFailed, error));
        });
    }
  }, [copy, db, language]);

  // Handle file input changes
  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (file) {
        handleImportSettings(file);
      }

      event.target.value = '';
    },
    [handleImportSettings],
  );

  const handleAPIKeyFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (file) {
        setIsImportingKeys(true);
        handleImportAPIKeys(file).finally(() => setIsImportingKeys(false));
      }

      event.target.value = '';
    },
    [handleImportAPIKeys],
  );

  const handleChatFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (file) {
        handleImportChats(file);
      }

      event.target.value = '';
    },
    [handleImportChats],
  );

  // Wrapper for reset chats to handle loading state
  const handleResetChatsWithState = useCallback(() => {
    setIsDeleting(true);
    handleResetChats().finally(() => setIsDeleting(false));
  }, [handleResetChats]);

  return (
    <div className="space-y-12 [&_button]:!h-auto [&_button]:min-h-8 [&_button]:!whitespace-normal [&_button]:break-words [&_button]:py-2 [&_button]:text-center [&_button]:leading-tight">
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileInputChange} className="hidden" />
      <input
        ref={apiKeyFileInputRef}
        type="file"
        accept=".json"
        onChange={handleAPIKeyFileInputChange}
        className="hidden"
      />
      <input
        ref={chatFileInputRef}
        type="file"
        accept=".json"
        onChange={handleChatFileInputChange}
        className="hidden"
      />

      {/* Reset Settings Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showResetInlineConfirm}
        onClose={() => setShowResetInlineConfirm(false)}
        title={copy.dialogs.resetSettingsTitle}
        description={copy.dialogs.resetSettingsDescription}
        confirmLabel={copy.dialogs.resetSettingsConfirm}
        cancelLabel={copy.common.cancel}
        variant="destructive"
        isLoading={isResetting}
        onConfirm={handleResetSettings}
      />

      {/* Delete Chats Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteInlineConfirm}
        onClose={() => setShowDeleteInlineConfirm(false)}
        title={copy.dialogs.deleteChatsTitle}
        description={copy.dialogs.deleteChatsDescription}
        confirmLabel={copy.dialogs.deleteChatsConfirm}
        cancelLabel={copy.common.cancel}
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={handleResetChatsWithState}
      />

      {/* Settings Selection Dialog */}
      <SelectionDialog
        isOpen={showSettingsSelection}
        onClose={() => setShowSettingsSelection(false)}
        title={copy.dialogs.selectSettingsTitle}
        items={settingsCategories}
        onConfirm={(selectedIds) => {
          handleExportSelectedSettings(selectedIds);
          setShowSettingsSelection(false);
        }}
        confirmLabel={copy.common.exportSelected}
      />

      {/* Chats Selection Dialog */}
      <SelectionDialog
        isOpen={showChatsSelection}
        onClose={() => setShowChatsSelection(false)}
        title={copy.dialogs.selectChatsTitle}
        items={chatItems}
        onConfirm={(selectedIds) => {
          handleExportSelectedChats(selectedIds);
          setShowChatsSelection(false);
        }}
        confirmLabel={copy.common.exportSelected}
      />

      {/* Chats Section */}
      <div>
        <h2 className="mb-4 break-words text-xl font-semibold text-bolt-elements-textPrimary">
          {copy.chats.sectionTitle}
        </h2>
        {dbError ? (
          <div role="alert" className="rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-400">
            {copy.chats.databaseOpenFailed}
          </div>
        ) : dbLoading ? (
          <div className="flex items-center justify-center p-4">
            <div className="i-ph-spinner-gap-bold animate-spin w-6 h-6 mr-2" />
            <span>{copy.chats.databaseLoading}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <div className="flex items-center mb-2">
                  <motion.div className="text-accent-500 mr-2" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                    <div className="i-ph-download-duotone w-5 h-5" />
                  </motion.div>
                  <CardTitle className="break-words text-lg transition-colors group-hover:text-bolt-elements-item-contentAccent">
                    {copy.chats.exportAllTitle}
                  </CardTitle>
                </div>
                <CardDescription>{copy.chats.exportAllDescription}</CardDescription>
              </CardHeader>
              <CardFooter>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full">
                  <Button
                    onClick={async () => {
                      try {
                        if (!db) {
                          toast.error(copy.feedback.databaseUnavailable);
                          return;
                        }

                        console.log('Database information:', {
                          name: db.name,
                          version: db.version,
                          objectStoreNames: Array.from(db.objectStoreNames),
                        });

                        if (availableChats.length === 0) {
                          toast.warning(copy.feedback.noChatsAvailable);
                          return;
                        }

                        await handleExportAllChats();
                      } catch (error) {
                        console.error('Error exporting chats:', error);
                        toast.error(
                          formatDataSettingsOperationError(language, copy.operations.errors.exportChats, error),
                        );
                      }
                    }}
                    disabled={isExporting || availableChats.length === 0}
                    variant="outline"
                    size="sm"
                    className={classNames(
                      'hover:text-bolt-elements-item-contentAccent hover:border-bolt-elements-item-backgroundAccent hover:bg-bolt-elements-item-backgroundAccent transition-colors w-full justify-center',
                      isExporting || availableChats.length === 0 ? 'cursor-not-allowed' : '',
                    )}
                  >
                    {isExporting ? (
                      <>
                        <div className="i-ph-spinner-gap-bold animate-spin w-4 h-4 mr-2" />
                        {copy.common.exporting}
                      </>
                    ) : availableChats.length === 0 ? (
                      copy.chats.noChatsToExport
                    ) : (
                      copy.common.exportAll
                    )}
                  </Button>
                </motion.div>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center mb-2">
                  <motion.div className="text-accent-500 mr-2" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                    <div className="i-ph:list-checks w-5 h-5" />
                  </motion.div>
                  <CardTitle className="break-words text-lg transition-colors group-hover:text-bolt-elements-item-contentAccent">
                    {copy.chats.exportSelectedTitle}
                  </CardTitle>
                </div>
                <CardDescription>{copy.chats.exportSelectedDescription}</CardDescription>
              </CardHeader>
              <CardFooter>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full">
                  <Button
                    onClick={() => setShowChatsSelection(true)}
                    disabled={isExporting || chatItems.length === 0}
                    variant="outline"
                    size="sm"
                    className={classNames(
                      'hover:text-bolt-elements-item-contentAccent hover:border-bolt-elements-item-backgroundAccent hover:bg-bolt-elements-item-backgroundAccent transition-colors w-full justify-center',
                      isExporting || chatItems.length === 0 ? 'cursor-not-allowed' : '',
                    )}
                  >
                    {isExporting ? (
                      <>
                        <div className="i-ph-spinner-gap-bold animate-spin w-4 h-4 mr-2" />
                        {copy.common.exporting}
                      </>
                    ) : (
                      copy.chats.selectChats
                    )}
                  </Button>
                </motion.div>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center mb-2">
                  <motion.div className="text-accent-500 mr-2" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                    <div className="i-ph-upload-duotone w-5 h-5" />
                  </motion.div>
                  <CardTitle className="break-words text-lg transition-colors group-hover:text-bolt-elements-item-contentAccent">
                    {copy.chats.importTitle}
                  </CardTitle>
                </div>
                <CardDescription>{copy.chats.importDescription}</CardDescription>
              </CardHeader>
              <CardFooter>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full">
                  <Button
                    onClick={() => chatFileInputRef.current?.click()}
                    disabled={isImporting}
                    variant="outline"
                    size="sm"
                    className={classNames(
                      'hover:text-bolt-elements-item-contentAccent hover:border-bolt-elements-item-backgroundAccent hover:bg-bolt-elements-item-backgroundAccent transition-colors w-full justify-center',
                      isImporting ? 'cursor-not-allowed' : '',
                    )}
                  >
                    {isImporting ? (
                      <>
                        <div className="i-ph-spinner-gap-bold animate-spin w-4 h-4 mr-2" />
                        {copy.common.importing}
                      </>
                    ) : (
                      copy.chats.importAction
                    )}
                  </Button>
                </motion.div>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center mb-2">
                  <motion.div
                    className="text-red-500 dark:text-red-400 mr-2"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <div className="i-ph-trash-duotone w-5 h-5" />
                  </motion.div>
                  <CardTitle className="break-words text-lg transition-colors group-hover:text-bolt-elements-item-contentAccent">
                    {copy.chats.deleteTitle}
                  </CardTitle>
                </div>
                <CardDescription>{copy.chats.deleteDescription}</CardDescription>
              </CardHeader>
              <CardFooter>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full">
                  <Button
                    onClick={() => setShowDeleteInlineConfirm(true)}
                    disabled={isDeleting || chatItems.length === 0}
                    variant="outline"
                    size="sm"
                    className={classNames(
                      'hover:text-bolt-elements-item-contentAccent hover:border-bolt-elements-item-backgroundAccent hover:bg-bolt-elements-item-backgroundAccent transition-colors w-full justify-center',
                      isDeleting || chatItems.length === 0 ? 'cursor-not-allowed' : '',
                    )}
                  >
                    {isDeleting ? (
                      <>
                        <div className="i-ph-spinner-gap-bold animate-spin w-4 h-4 mr-2" />
                        {copy.common.deleting}
                      </>
                    ) : (
                      copy.chats.deleteAction
                    )}
                  </Button>
                </motion.div>
              </CardFooter>
            </Card>
          </div>
        )}
      </div>

      {/* Settings Section */}
      <div>
        <h2 className="mb-4 break-words text-xl font-semibold text-bolt-elements-textPrimary">
          {copy.settings.sectionTitle}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <div className="flex items-center mb-2">
                <motion.div className="text-accent-500 mr-2" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <div className="i-ph-download-duotone w-5 h-5" />
                </motion.div>
                <CardTitle className="break-words text-lg transition-colors group-hover:text-bolt-elements-item-contentAccent">
                  {copy.settings.exportAllTitle}
                </CardTitle>
              </div>
              <CardDescription>{copy.settings.exportAllDescription}</CardDescription>
            </CardHeader>
            <CardFooter>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full">
                <Button
                  onClick={handleExportSettings}
                  disabled={isExporting}
                  variant="outline"
                  size="sm"
                  className={classNames(
                    'hover:text-bolt-elements-item-contentAccent hover:border-bolt-elements-item-backgroundAccent hover:bg-bolt-elements-item-backgroundAccent transition-colors w-full justify-center',
                    isExporting ? 'cursor-not-allowed' : '',
                  )}
                >
                  {isExporting ? (
                    <>
                      <div className="i-ph-spinner-gap-bold animate-spin w-4 h-4 mr-2" />
                      {copy.common.exporting}
                    </>
                  ) : (
                    copy.common.exportAll
                  )}
                </Button>
              </motion.div>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center mb-2">
                <motion.div className="text-accent-500 mr-2" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <div className="i-ph:funnel w-5 h-5" />
                </motion.div>
                <CardTitle className="break-words text-lg transition-colors group-hover:text-bolt-elements-item-contentAccent">
                  {copy.settings.exportSelectedTitle}
                </CardTitle>
              </div>
              <CardDescription>{copy.settings.exportSelectedDescription}</CardDescription>
            </CardHeader>
            <CardFooter>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full">
                <Button
                  onClick={() => setShowSettingsSelection(true)}
                  disabled={isExporting || settingsCategories.length === 0}
                  variant="outline"
                  size="sm"
                  className={classNames(
                    'hover:text-bolt-elements-item-contentAccent hover:border-bolt-elements-item-backgroundAccent hover:bg-bolt-elements-item-backgroundAccent transition-colors w-full justify-center',
                    isExporting || settingsCategories.length === 0 ? 'cursor-not-allowed' : '',
                  )}
                >
                  {isExporting ? (
                    <>
                      <div className="i-ph-spinner-gap-bold animate-spin w-4 h-4 mr-2" />
                      {copy.common.exporting}
                    </>
                  ) : (
                    copy.settings.selectSettings
                  )}
                </Button>
              </motion.div>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center mb-2">
                <motion.div className="text-accent-500 mr-2" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <div className="i-ph-upload-duotone w-5 h-5" />
                </motion.div>
                <CardTitle className="break-words text-lg transition-colors group-hover:text-bolt-elements-item-contentAccent">
                  {copy.settings.importTitle}
                </CardTitle>
              </div>
              <CardDescription>{copy.settings.importDescription}</CardDescription>
            </CardHeader>
            <CardFooter>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full">
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  variant="outline"
                  size="sm"
                  className={classNames(
                    'hover:text-bolt-elements-item-contentAccent hover:border-bolt-elements-item-backgroundAccent hover:bg-bolt-elements-item-backgroundAccent transition-colors w-full justify-center',
                    isImporting ? 'cursor-not-allowed' : '',
                  )}
                >
                  {isImporting ? (
                    <>
                      <div className="i-ph-spinner-gap-bold animate-spin w-4 h-4 mr-2" />
                      {copy.common.importing}
                    </>
                  ) : (
                    copy.settings.importAction
                  )}
                </Button>
              </motion.div>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center mb-2">
                <motion.div
                  className="text-red-500 dark:text-red-400 mr-2"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <div className="i-ph-arrow-counter-clockwise-duotone w-5 h-5" />
                </motion.div>
                <CardTitle className="break-words text-lg transition-colors group-hover:text-bolt-elements-item-contentAccent">
                  {copy.settings.resetTitle}
                </CardTitle>
              </div>
              <CardDescription>{copy.settings.resetDescription}</CardDescription>
            </CardHeader>
            <CardFooter>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full">
                <Button
                  onClick={() => setShowResetInlineConfirm(true)}
                  disabled={isResetting}
                  variant="outline"
                  size="sm"
                  className={classNames(
                    'hover:text-bolt-elements-item-contentAccent hover:border-bolt-elements-item-backgroundAccent hover:bg-bolt-elements-item-backgroundAccent transition-colors w-full justify-center',
                    isResetting ? 'cursor-not-allowed' : '',
                  )}
                >
                  {isResetting ? (
                    <>
                      <div className="i-ph-spinner-gap-bold animate-spin w-4 h-4 mr-2" />
                      {copy.common.resetting}
                    </>
                  ) : (
                    copy.settings.resetAction
                  )}
                </Button>
              </motion.div>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* API Keys Section */}
      <div>
        <h2 className="mb-4 break-words text-xl font-semibold text-bolt-elements-textPrimary">
          {copy.apiKeys.sectionTitle}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <div className="flex items-center mb-2">
                <motion.div className="text-accent-500 mr-2" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <div className="i-ph-file-text-duotone w-5 h-5" />
                </motion.div>
                <CardTitle className="break-words text-lg transition-colors group-hover:text-bolt-elements-item-contentAccent">
                  {copy.apiKeys.downloadTitle}
                </CardTitle>
              </div>
              <CardDescription>{copy.apiKeys.downloadDescription}</CardDescription>
            </CardHeader>
            <CardFooter>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full">
                <Button
                  onClick={handleDownloadTemplate}
                  disabled={isDownloadingTemplate}
                  variant="outline"
                  size="sm"
                  className={classNames(
                    'hover:text-bolt-elements-item-contentAccent hover:border-bolt-elements-item-backgroundAccent hover:bg-bolt-elements-item-backgroundAccent transition-colors w-full justify-center',
                    isDownloadingTemplate ? 'cursor-not-allowed' : '',
                  )}
                >
                  {isDownloadingTemplate ? (
                    <>
                      <div className="i-ph-spinner-gap-bold animate-spin w-4 h-4 mr-2" />
                      {copy.common.downloading}
                    </>
                  ) : (
                    copy.common.download
                  )}
                </Button>
              </motion.div>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center mb-2">
                <motion.div className="text-accent-500 mr-2" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <div className="i-ph-upload-duotone w-5 h-5" />
                </motion.div>
                <CardTitle className="break-words text-lg transition-colors group-hover:text-bolt-elements-item-contentAccent">
                  {copy.apiKeys.importTitle}
                </CardTitle>
              </div>
              <CardDescription>{copy.apiKeys.importDescription}</CardDescription>
            </CardHeader>
            <CardFooter>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full">
                <Button
                  onClick={() => apiKeyFileInputRef.current?.click()}
                  disabled={isImportingKeys}
                  variant="outline"
                  size="sm"
                  className={classNames(
                    'hover:text-bolt-elements-item-contentAccent hover:border-bolt-elements-item-backgroundAccent hover:bg-bolt-elements-item-backgroundAccent transition-colors w-full justify-center',
                    isImportingKeys ? 'cursor-not-allowed' : '',
                  )}
                >
                  {isImportingKeys ? (
                    <>
                      <div className="i-ph-spinner-gap-bold animate-spin w-4 h-4 mr-2" />
                      {copy.common.importing}
                    </>
                  ) : (
                    copy.apiKeys.importAction
                  )}
                </Button>
              </motion.div>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* Data Visualization */}
      <div>
        <h2 className="mb-4 break-words text-xl font-semibold text-bolt-elements-textPrimary">
          {copy.visualization.sectionTitle}
        </h2>
        <Card>
          <CardContent className="p-5">
            <DataVisualization chats={availableChats} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
