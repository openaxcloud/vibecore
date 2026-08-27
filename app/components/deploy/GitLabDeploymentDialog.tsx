import { useStore } from '@nanostores/react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { GitLabAuthDialog } from '~/components/@settings/tabs/gitlab/components/GitLabAuthDialog';
import { SearchInput, EmptyState, StatusIndicator, Badge, ConfirmationDialog } from '~/components/ui';
import {
  formatRepositoryDeploymentCopy,
  formatRepositoryDeploymentDate,
  formatRepositoryDeploymentNumber,
  formatRepositoryDeploymentSize,
  getRepositoryDeploymentCopy,
} from '~/lib/i18n/catalogs/repository-deployment';
import { getLocalStorage } from '~/lib/persistence/localStorage';
import { chatId } from '~/lib/persistence/useChatHistory';
import { GitLabApiService } from '~/lib/services/gitlabApiService';
import { logStore } from '~/lib/stores/logs';
import type { GitLabUserResponse, GitLabProjectInfo } from '~/types/GitLab';
import { classNames } from '~/utils/classNames';

interface GitLabDeploymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  files: Record<string, string>;
}

export function GitLabDeploymentDialog({ isOpen, onClose, projectName, files }: GitLabDeploymentDialogProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const copy = getRepositoryDeploymentCopy(language);
  const provider = 'GitLab';

  const text = (template: string, values: Readonly<Record<string, string | number>> = {}) =>
    formatRepositoryDeploymentCopy(template, { provider, ...values });

  const [repoName, setRepoName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<GitLabUserResponse | null>(null);
  const [recentRepos, setRecentRepos] = useState<GitLabProjectInfo[]>([]);
  const [filteredRepos, setFilteredRepos] = useState<GitLabProjectInfo[]>([]);
  const [repoSearchQuery, setRepoSearchQuery] = useState('');
  const [isFetchingRepos, setIsFetchingRepos] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [createdRepoUrl, setCreatedRepoUrl] = useState('');
  const [pushedFiles, setPushedFiles] = useState<{ path: string; size: number }[]>([]);
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  /*
   * Promise-based bridge so the async push flow can await the token-styled
   * overwrite confirmation dialog (design handoff G5, not window.confirm).
   */
  const [overwriteConfirmation, setOverwriteConfirmation] = useState<{
    description: string;
    resolve: (confirmed: boolean) => void;
  } | null>(null);

  const currentChatId = useStore(chatId);

  const requestOverwriteConfirmation = (description: string) =>
    new Promise<boolean>((resolve) => setOverwriteConfirmation({ description, resolve }));

  const settleOverwriteConfirmation = (confirmed: boolean) => {
    overwriteConfirmation?.resolve(confirmed);
    setOverwriteConfirmation(null);
  };

  // Load GitLab connection on mount
  useEffect(() => {
    if (isOpen) {
      const connection = getLocalStorage('gitlab_connection');

      // Set a default repository name based on the project name
      setRepoName(projectName.replace(/\s+/g, '-').toLowerCase());

      if (connection?.user && connection?.token) {
        setUser(connection.user);

        // Only fetch if we have both user and token
        if (connection.token.trim()) {
          fetchRecentRepos(connection.token, connection.gitlabUrl || 'https://gitlab.com');
        }
      }
    }
  }, [isOpen, projectName]);

  // Filter repositories based on search query
  useEffect(() => {
    if (recentRepos.length === 0) {
      setFilteredRepos([]);
      return;
    }

    if (!repoSearchQuery.trim()) {
      setFilteredRepos(recentRepos);
      return;
    }

    const query = repoSearchQuery.toLowerCase().trim();

    const filtered = recentRepos.filter(
      (repo) =>
        repo.name.toLowerCase().includes(query) || (repo.description && repo.description.toLowerCase().includes(query)),
    );

    setFilteredRepos(filtered);
  }, [recentRepos, repoSearchQuery]);

  const fetchRecentRepos = async (token: string, gitlabUrl = 'https://gitlab.com') => {
    if (!token) {
      logStore.logError(text(copy.errors.authenticationRequired));
      toast.error(text(copy.errors.authenticationRequired));

      return;
    }

    try {
      setIsFetchingRepos(true);

      const apiService = new GitLabApiService(token, gitlabUrl);
      const repos = await apiService.getProjects();
      setRecentRepos(repos);
    } catch (error) {
      console.error('Failed to fetch GitLab repositories:', error);
      logStore.logError(copy.errors.fetchRecent, { error });
      toast.error(copy.errors.fetchRecent);
    } finally {
      setIsFetchingRepos(false);
    }
  };

  // Function to create a new repository or push to an existing one
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const connection = getLocalStorage('gitlab_connection');

    if (!connection?.token || !connection?.user) {
      toast.error(text(copy.errors.connectFirst));
      return;
    }

    if (!repoName.trim()) {
      toast.error(copy.errors.repositoryNameRequired);
      return;
    }

    setIsLoading(true);

    // Sanitize repository name to match what the API will create
    const sanitizedRepoName = repoName
      .replace(/[^a-zA-Z0-9-_.]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();

    try {
      const gitlabUrl = connection.gitlabUrl || 'https://gitlab.com';
      const apiService = new GitLabApiService(connection.token, gitlabUrl);

      let repoUrl = '';

      // Warn user if repository name was changed
      if (sanitizedRepoName !== repoName && sanitizedRepoName !== repoName.toLowerCase()) {
        toast.info(text(copy.progress.sanitized, { name: sanitizedRepoName }));
      }

      // Check if project exists using the sanitized name
      const projectPath = `${connection.user.username}/${sanitizedRepoName}`;
      const existingProject = await apiService.getProjectByPath(projectPath);
      const projectExists = existingProject !== null;

      if (projectExists && existingProject) {
        // Confirm overwrite
        const visibilityChange =
          existingProject.visibility !== (isPrivate ? 'private' : 'public')
            ? `\n\n${text(copy.repositoryUpdate.visibilityChange, {
                from: existingProject.visibility === 'private' ? copy.form.private : copy.form.public,
                to: isPrivate ? copy.form.private : copy.form.public,
              })}`
            : '';

        const confirmOverwrite = await requestOverwriteConfirmation(
          `${text(copy.repositoryUpdate.repositoryExists, { name: sanitizedRepoName })}${visibilityChange}`,
        );

        if (!confirmOverwrite) {
          setIsLoading(false);
          return;
        }

        // Update visibility if needed
        if (existingProject.visibility !== (isPrivate ? 'private' : 'public')) {
          toast.info(copy.progress.updatingVisibility);
          await apiService.updateProjectVisibility(existingProject.id, isPrivate ? 'private' : 'public');
        }

        // Update project with files
        toast.info(copy.progress.uploadingExisting);
        await apiService.updateProjectWithFiles(existingProject.id, files);
        repoUrl = existingProject.http_url_to_repo;
        setCreatedRepoUrl(repoUrl);
        toast.success(copy.progress.updated);
      } else {
        // Create new project with files
        toast.info(copy.progress.creating);

        const newProject = await apiService.createProjectWithFiles(sanitizedRepoName, isPrivate, files);
        repoUrl = newProject.http_url_to_repo;
        setCreatedRepoUrl(repoUrl);
        toast.success(copy.progress.created);
      }

      // Set pushed files for display
      const fileList = Object.entries(files).map(([filePath, content]) => ({
        path: filePath,
        size: new TextEncoder().encode(content).length,
      }));

      setPushedFiles(fileList);
      setShowSuccessDialog(true);

      // Save repository info
      if (currentChatId) {
        localStorage.setItem(
          `gitlab-repo-${currentChatId}`,
          JSON.stringify({
            owner: connection.user.username,
            name: sanitizedRepoName,
            url: repoUrl,
          }),
        );
      }

      logStore.logInfo(text(copy.progress.deploymentCompleted), {
        type: 'system',
        message: text(copy.progress.deployedFiles, {
          count: formatRepositoryDeploymentNumber(fileList.length, language),
          name: projectPath,
        }),
        repoName: sanitizedRepoName,
        projectPath,
        filesCount: fileList.length,
        isNewProject: !projectExists,
      });
    } catch (error) {
      console.error('Error pushing to GitLab:', error);

      logStore.logError(text(copy.errors.pushFailed), {
        error,
        repoName: sanitizedRepoName,
        projectPath: `${connection.user.username}/${sanitizedRepoName}`,
      });

      // Provide specific error messages based on error type
      let errorMessage = text(copy.errors.pushFailed);

      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();

        if (errorMsg.includes('404') || errorMsg.includes('not found')) {
          errorMessage = text(copy.errors.resourceNotFound);
        } else if (errorMsg.includes('401') || errorMsg.includes('unauthorized')) {
          errorMessage = text(copy.errors.authenticationFailed);
        } else if (errorMsg.includes('403') || errorMsg.includes('forbidden')) {
          errorMessage = text(copy.errors.accessDenied);
        } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
          errorMessage = copy.errors.network;
        } else if (errorMsg.includes('timeout')) {
          errorMessage = copy.errors.timeout;
        } else if (errorMsg.includes('rate limit')) {
          errorMessage = text(copy.errors.apiRateLimitWait);
        } else {
          errorMessage = text(copy.errors.generic);
        }
      }

      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setRepoName('');
    setIsPrivate(false);
    setShowSuccessDialog(false);
    setCreatedRepoUrl('');
    onClose();
  };

  const handleAuthDialogClose = () => {
    setShowAuthDialog(false);

    // Refresh user data after auth
    const connection = getLocalStorage('gitlab_connection');

    if (connection?.user && connection?.token) {
      setUser(connection.user);
      fetchRecentRepos(connection.token, connection.gitlabUrl || 'https://gitlab.com');
    }
  };

  // Success Dialog
  if (showSuccessDialog) {
    return (
      <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999]" />
          <div className="fixed inset-0 flex items-center justify-center z-[9999]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-[90vw] md:w-[600px] max-h-[85vh] overflow-y-auto"
            >
              <Dialog.Content className="bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark shadow-xl">
                <Dialog.Title className="sr-only">{text(copy.success.title)}</Dialog.Title>
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500">
                        <div className="i-ph:check-circle w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark">
                          {text(copy.success.title)}
                        </h3>
                        <Dialog.Description className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark">
                          {text(copy.success.description)}
                        </Dialog.Description>
                      </div>
                    </div>
                    <Dialog.Close asChild>
                      <button
                        onClick={handleClose}
                        className="p-2 rounded-lg transition-all duration-200 ease-in-out bg-transparent text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary dark:text-bolt-elements-textTertiary-dark dark:hover:text-bolt-elements-textPrimary-dark hover:bg-bolt-elements-background-depth-2 dark:hover:bg-bolt-elements-background-depth-3 focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColor dark:focus:ring-bolt-elements-borderColor-dark"
                      >
                        <span className="i-ph:x block w-5 h-5" aria-hidden="true" />
                        <span className="sr-only">{copy.form.closeDialog}</span>
                      </button>
                    </Dialog.Close>
                  </div>

                  <div className="bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 rounded-lg p-4 text-left border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark">
                    <p className="text-sm font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark mb-2 flex items-center gap-2">
                      <span className="i-ph:gitlab-logo w-4 h-4 text-orange-500" />
                      {copy.success.repositoryUrl}
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 min-w-0 truncate text-sm bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-4 px-3 py-2 rounded border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark font-mono">
                        {createdRepoUrl}
                      </code>
                      <motion.button
                        onClick={() => {
                          navigator.clipboard?.writeText(createdRepoUrl)?.catch(() => undefined);
                          toast.success(copy.success.urlCopied);
                        }}
                        className="shrink-0 p-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary dark:text-bolt-elements-textSecondary-dark dark:hover:text-bolt-elements-textPrimary-dark bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-4 rounded-lg border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <div className="i-ph:copy w-4 h-4" />
                      </motion.button>
                    </div>
                  </div>

                  <div className="bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 rounded-lg p-4 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark">
                    <p className="text-sm font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark mb-2 flex items-center gap-2">
                      <span className="i-ph:files w-4 h-4 text-[var(--ecode-accent)]" />
                      {text(copy.success.pushedFiles, { count: pushedFiles.length })}
                    </p>
                    <div className="max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                      {pushedFiles.slice(0, 100).map((file) => (
                        <div
                          key={file.path}
                          className="flex items-center justify-between py-1.5 text-sm text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark border-b border-bolt-elements-borderColor/30 dark:border-bolt-elements-borderColor-dark/30 last:border-0"
                        >
                          <span className="font-mono truncate flex-1 text-xs">{file.path}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-bolt-elements-background-depth-3 dark:bg-bolt-elements-background-depth-4 text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark ml-2">
                            {formatRepositoryDeploymentSize(file.size, language)}
                          </span>
                        </div>
                      ))}
                      {pushedFiles.length > 100 && (
                        <div className="py-2 text-center text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark">
                          {text(copy.success.moreFiles, { count: pushedFiles.length - 100 })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <motion.a
                      href={createdRepoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 text-sm inline-flex items-center gap-2"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="i-ph:gitlab-logo w-4 h-4" />
                      {copy.success.viewRepository}
                    </motion.a>
                    <motion.button
                      onClick={() => {
                        navigator.clipboard?.writeText(createdRepoUrl)?.catch(() => undefined);
                        toast.success(copy.success.urlCopied);
                      }}
                      className="px-4 py-2 rounded-lg bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark hover:bg-bolt-elements-background-depth-3 dark:hover:bg-bolt-elements-background-depth-4 text-sm inline-flex items-center gap-2 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="i-ph:copy w-4 h-4" />
                      {copy.success.copyUrl}
                    </motion.button>
                    <motion.button
                      onClick={handleClose}
                      className="px-4 py-2 rounded-lg bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark hover:bg-bolt-elements-background-depth-3 dark:hover:bg-bolt-elements-background-depth-4 text-sm border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {copy.success.close}
                    </motion.button>
                  </div>
                </div>
              </Dialog.Content>
            </motion.div>
          </div>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  if (!user) {
    return (
      <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999]" />
          <div className="fixed inset-0 flex items-center justify-center z-[9999]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-[90vw] md:w-[500px] max-h-[90dvh] overflow-y-auto"
            >
              <Dialog.Content className="bg-bolt-elements-background-depth-1 rounded-lg p-6 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark shadow-xl">
                <Dialog.Title className="sr-only">{text(copy.connection.title)}</Dialog.Title>
                <div className="relative text-center space-y-4">
                  <Dialog.Close asChild>
                    <button
                      onClick={handleClose}
                      className="absolute right-0 top-0 p-2 rounded-lg transition-all duration-200 ease-in-out bg-transparent text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary dark:text-bolt-elements-textTertiary-dark dark:hover:text-bolt-elements-textPrimary-dark hover:bg-bolt-elements-background-depth-2 dark:hover:bg-bolt-elements-background-depth-3 focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColor dark:focus:ring-bolt-elements-borderColor-dark"
                    >
                      <span className="i-ph:x block w-5 h-5" aria-hidden="true" />
                      <span className="sr-only">{copy.form.closeDialog}</span>
                    </button>
                  </Dialog.Close>
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="mx-auto w-16 h-16 rounded-xl bg-bolt-elements-background-depth-3 flex items-center justify-center text-orange-500"
                  >
                    <div className="i-ph:gitlab-logo w-8 h-8" />
                  </motion.div>
                  <h3 className="text-lg font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark">
                    {text(copy.connection.title)}
                  </h3>
                  <Dialog.Description className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark max-w-md mx-auto">
                    {text(copy.connection.description)}
                  </Dialog.Description>
                  <div className="pt-2 flex justify-center gap-3">
                    <motion.button
                      className="px-4 py-2 rounded-lg bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark text-sm hover:bg-bolt-elements-background-depth-3 dark:hover:bg-bolt-elements-background-depth-4 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleClose}
                    >
                      {copy.success.close}
                    </motion.button>
                    <motion.button
                      onClick={() => setShowAuthDialog(true)}
                      className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm hover:bg-orange-600 inline-flex items-center gap-2"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="i-ph:gitlab-logo w-4 h-4" />
                      {text(copy.connection.connectAccount)}
                    </motion.button>
                  </div>
                </div>
              </Dialog.Content>
            </motion.div>
          </div>
        </Dialog.Portal>

        {/* GitLab Auth Dialog */}
        <GitLabAuthDialog isOpen={showAuthDialog} onClose={handleAuthDialogClose} />
      </Dialog.Root>
    );
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999]" />
        <div className="fixed inset-0 flex items-center justify-center z-[9999]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="w-[90vw] md:w-[500px] max-h-[90dvh] overflow-y-auto"
          >
            <Dialog.Content className="bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark shadow-xl">
              <div className="p-6">
                <div className="flex items-center gap-4 mb-6">
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="w-10 h-10 rounded-xl bg-bolt-elements-background-depth-3 flex items-center justify-center text-orange-500"
                  >
                    <div className="i-ph:gitlab-logo w-5 h-5" />
                  </motion.div>
                  <div>
                    <Dialog.Title className="text-lg font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark">
                      {text(copy.form.title)}
                    </Dialog.Title>
                    <Dialog.Description className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark">
                      {text(copy.form.description)}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      onClick={handleClose}
                      className="ml-auto p-2 rounded-lg transition-all duration-200 ease-in-out bg-transparent text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary dark:text-bolt-elements-textTertiary-dark dark:hover:text-bolt-elements-textPrimary-dark hover:bg-bolt-elements-background-depth-2 dark:hover:bg-bolt-elements-background-depth-3 focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColor dark:focus:ring-bolt-elements-borderColor-dark"
                    >
                      <span className="i-ph:x block w-5 h-5" aria-hidden="true" />
                      <span className="sr-only">{copy.form.closeDialog}</span>
                    </button>
                  </Dialog.Close>
                </div>

                <div className="flex items-center gap-3 mb-6 p-4 bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 rounded-lg border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark">
                  <div className="relative">
                    {user.avatar_url && user.avatar_url !== 'null' && user.avatar_url !== '' ? (
                      <img
                        src={user.avatar_url}
                        alt={user.username}
                        className="w-10 h-10 rounded-full object-cover"
                        crossOrigin="anonymous"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          // Handle CORS/COEP errors by hiding the image and showing fallback
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';

                          const fallback = target.parentElement?.querySelector('.avatar-fallback') as HTMLElement;

                          if (fallback) {
                            fallback.style.display = 'flex';
                          }
                        }}
                        onLoad={(e) => {
                          // Ensure fallback is hidden when image loads successfully
                          const target = e.target as HTMLImageElement;

                          const fallback = target.parentElement?.querySelector('.avatar-fallback') as HTMLElement;

                          if (fallback) {
                            fallback.style.display = 'none';
                          }
                        }}
                      />
                    ) : null}

                    <div
                      className="avatar-fallback w-10 h-10 rounded-full bg-bolt-elements-background-depth-4 flex items-center justify-center text-bolt-elements-textSecondary font-semibold text-sm"
                      style={{
                        display:
                          user.avatar_url && user.avatar_url !== 'null' && user.avatar_url !== '' ? 'none' : 'flex',
                      }}
                    >
                      {user.name ? (
                        user.name.charAt(0).toUpperCase()
                      ) : user.username ? (
                        user.username.charAt(0).toUpperCase()
                      ) : (
                        <div className="i-ph:user w-5 h-5" />
                      )}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-white">
                      <div className="i-ph:gitlab-logo w-3 h-3" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark">
                      {user.name || user.username}
                    </p>
                    <p className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark">
                      @{user.username}
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="repoName"
                      className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark"
                    >
                      {copy.form.repositoryName}
                    </label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary dark:text-bolt-elements-textTertiary-dark">
                        <span className="i-ph:git-branch w-4 h-4" />
                      </div>
                      <input
                        id="repoName"
                        type="text"
                        value={repoName}
                        onChange={(e) => setRepoName(e.target.value)}
                        placeholder={copy.form.repositoryNamePlaceholder}
                        className="w-full pl-10 px-4 py-2 rounded-lg bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark placeholder-bolt-elements-textTertiary dark:placeholder-bolt-elements-textTertiary-dark focus:outline-none focus:ring-2 focus:ring-orange-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark">
                        {copy.form.recentRepositories}
                      </label>
                      <span className="text-xs text-bolt-elements-textTertiary dark:text-bolt-elements-textTertiary-dark">
                        {text(copy.form.repositoryCount, {
                          shown: formatRepositoryDeploymentNumber(filteredRepos.length, language),
                          total: formatRepositoryDeploymentNumber(recentRepos.length, language),
                        })}
                      </span>
                    </div>

                    <div className="mb-2">
                      <SearchInput
                        placeholder={copy.form.searchRepositories}
                        value={repoSearchQuery}
                        onChange={(e) => setRepoSearchQuery(e.target.value)}
                        onClear={() => setRepoSearchQuery('')}
                        className="bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark text-sm"
                      />
                    </div>

                    {recentRepos.length === 0 && !isFetchingRepos ? (
                      <EmptyState
                        icon="i-ph:gitlab-logo"
                        title={copy.form.noRepositories}
                        description={text(copy.form.noRepositoriesDescription)}
                        variant="compact"
                      />
                    ) : (
                      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                        {filteredRepos.length === 0 && repoSearchQuery.trim() !== '' ? (
                          <EmptyState
                            icon="i-ph:magnifying-glass"
                            title={copy.form.noMatchingRepositories}
                            description={copy.form.tryDifferentSearch}
                            variant="compact"
                          />
                        ) : (
                          filteredRepos.map((repo) => (
                            <motion.button
                              key={repo.id}
                              type="button"
                              onClick={() => setRepoName(repo.name)}
                              className="w-full p-3 text-left rounded-lg bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-3 dark:hover:bg-bolt-elements-background-depth-4 transition-colors group border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark hover:border-orange-500/30"
                              whileHover={{ scale: 1.01 }}
                              whileTap={{ scale: 0.99 }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="i-ph:git-branch w-4 h-4 text-orange-500" />
                                  <span className="text-sm font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark group-hover:text-orange-500">
                                    {repo.name}
                                  </span>
                                </div>
                                {repo.visibility === 'private' && (
                                  <Badge variant="primary" size="sm" icon="i-ph:lock w-3 h-3">
                                    {copy.form.private}
                                  </Badge>
                                )}
                              </div>
                              {repo.description && (
                                <p className="mt-1 text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark line-clamp-2">
                                  {repo.description}
                                </p>
                              )}
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <Badge variant="subtle" size="sm" icon="i-ph:star w-3 h-3">
                                  {formatRepositoryDeploymentNumber(repo.star_count, language)}
                                </Badge>
                                <Badge variant="subtle" size="sm" icon="i-ph:git-fork w-3 h-3">
                                  {formatRepositoryDeploymentNumber(repo.forks_count, language)}
                                </Badge>
                                <Badge variant="subtle" size="sm" icon="i-ph:clock w-3 h-3">
                                  {formatRepositoryDeploymentDate(repo.updated_at, language)}
                                </Badge>
                              </div>
                            </motion.button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {isFetchingRepos && (
                    <div className="flex items-center justify-center py-4">
                      <StatusIndicator status="loading" pulse={true} label={copy.form.loadingRepositories} />
                    </div>
                  )}

                  <div className="p-3 bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 rounded-lg border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="private"
                        checked={isPrivate}
                        onChange={(e) => setIsPrivate(e.target.checked)}
                        className="rounded border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark text-orange-500 focus:ring-orange-500 dark:bg-bolt-elements-background-depth-3"
                      />
                      <label
                        htmlFor="private"
                        className="text-sm text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark"
                      >
                        {copy.form.makePrivate}
                      </label>
                    </div>
                    <p className="text-xs text-bolt-elements-textTertiary dark:text-bolt-elements-textTertiary-dark mt-2 ml-6">
                      {copy.form.privateDescription}
                    </p>
                  </div>

                  <div className="pt-4 flex gap-2">
                    <motion.button
                      type="button"
                      onClick={handleClose}
                      className="px-4 py-2 rounded-lg bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark hover:bg-bolt-elements-background-depth-3 dark:hover:bg-bolt-elements-background-depth-4 text-sm border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {copy.form.cancel}
                    </motion.button>
                    <motion.button
                      type="submit"
                      disabled={isLoading}
                      className={classNames(
                        'flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm inline-flex items-center justify-center gap-2',
                        isLoading ? 'opacity-50 cursor-not-allowed' : '',
                      )}
                      whileHover={!isLoading ? { scale: 1.02 } : {}}
                      whileTap={!isLoading ? { scale: 0.98 } : {}}
                    >
                      {isLoading ? (
                        <>
                          <div className="i-ph:spinner-gap animate-spin w-4 h-4" />
                          {copy.form.deploying}
                        </>
                      ) : (
                        <>
                          <div className="i-ph:gitlab-logo w-4 h-4" />
                          {text(copy.form.deploy)}
                        </>
                      )}
                    </motion.button>
                  </div>
                </form>
              </div>
            </Dialog.Content>
          </motion.div>
        </div>
      </Dialog.Portal>

      {/* GitLab Auth Dialog */}
      <GitLabAuthDialog isOpen={showAuthDialog} onClose={handleAuthDialogClose} />
      <ConfirmationDialog
        isOpen={overwriteConfirmation !== null}
        onClose={() => settleOverwriteConfirmation(false)}
        onConfirm={() => settleOverwriteConfirmation(true)}
        title={copy.repositoryUpdate.title}
        description={<span className="whitespace-pre-line">{overwriteConfirmation?.description}</span>}
        confirmLabel={copy.repositoryUpdate.confirm}
      />
    </Dialog.Root>
  );
}
