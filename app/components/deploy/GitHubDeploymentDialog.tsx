import { useStore } from '@nanostores/react';
import { Octokit } from '@octokit/rest';
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { GitHubAuthDialog } from '~/components/@settings/tabs/github/components/GitHubAuthDialog';
import { SearchInput, EmptyState, StatusIndicator, Badge, ConfirmationDialog } from '~/components/ui';
import { formatClientAstResidualCopy, getClientAstResidualCopy } from '~/lib/i18n/catalogs/client-ast-residual';
import {
  formatRepositoryDeploymentCopy,
  formatRepositoryDeploymentDate,
  formatRepositoryDeploymentNumber,
  formatRepositoryDeploymentSize,
  formatRepositoryDeploymentTime,
  getRepositoryDeploymentCopy,
} from '~/lib/i18n/catalogs/repository-deployment';
import { getLocalStorage } from '~/lib/persistence/localStorage';
import { chatId } from '~/lib/persistence/useChatHistory';
import { logStore } from '~/lib/stores/logs';
import type { GitHubUserResponse, GitHubRepoInfo } from '~/types/GitHub';
import { classNames } from '~/utils/classNames';

interface GitHubDeploymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  files: Record<string, string>;
}

export function GitHubDeploymentDialog({ isOpen, onClose, projectName, files }: GitHubDeploymentDialogProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const copy = getRepositoryDeploymentCopy(language);
  const astCopy = getClientAstResidualCopy(language);
  const provider = 'GitHub';
  const isFrench = language.toLowerCase().startsWith('fr');

  const text = (template: string, values: Readonly<Record<string, string | number>> = {}) =>
    formatRepositoryDeploymentCopy(template, { provider, ...values });

  const [repoName, setRepoName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<GitHubUserResponse | null>(null);
  const [recentRepos, setRecentRepos] = useState<GitHubRepoInfo[]>([]);
  const [filteredRepos, setFilteredRepos] = useState<GitHubRepoInfo[]>([]);
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

  /*
   * Load GitHub connection on mount
   * Helper function to sanitize repository name
   */
  const sanitizeRepoName = (name: string): string => {
    return (
      name
        .toLowerCase()
        // Replace spaces and underscores with hyphens
        .replace(/[\s_]+/g, '-')
        // Remove special characters except hyphens and alphanumeric
        .replace(/[^a-z0-9-]/g, '')
        // Remove multiple consecutive hyphens
        .replace(/-+/g, '-')
        // Remove leading/trailing hyphens
        .replace(/^-+|-+$/g, '')
        // Ensure it's not empty and has reasonable length
        .substring(0, 100) || 'my-project'
    );
  };

  useEffect(() => {
    if (isOpen) {
      const connection = getLocalStorage('github_connection');

      // Set a default repository name based on the project name with proper sanitization
      setRepoName(sanitizeRepoName(projectName));

      if (connection?.user && connection?.token) {
        setUser(connection.user);

        // Only fetch if we have both user and token
        if (connection.token.trim()) {
          fetchRecentRepos(connection.token);
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
        repo.name.toLowerCase().includes(query) ||
        (repo.description && repo.description.toLowerCase().includes(query)) ||
        (repo.language && repo.language.toLowerCase().includes(query)),
    );

    setFilteredRepos(filtered);
  }, [recentRepos, repoSearchQuery]);

  const fetchRecentRepos = async (token: string) => {
    if (!token) {
      logStore.logError(text(copy.errors.authenticationRequired));
      toast.error(text(copy.errors.authenticationRequired));

      return;
    }

    try {
      setIsFetchingRepos(true);

      // Fetch ALL repos by paginating through all pages
      let allRepos: GitHubRepoInfo[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const requestUrl = `https://api.github.com/user/repos?sort=updated&per_page=100&page=${page}&affiliation=owner,organization_member`;

        const response = await fetch(requestUrl, {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `Bearer ${token.trim()}`,
          },
        });

        if (!response.ok) {
          let errorData: { message?: string } = {};

          try {
            errorData = await response.json();
          } catch {
            errorData = { message: copy.errors.couldNotParseResponse };
          }

          if (response.status === 401) {
            toast.error(text(copy.errors.tokenExpired));

            // Clear invalid token
            const connection = getLocalStorage('github_connection');

            if (connection) {
              localStorage.removeItem('github_connection');
              setUser(null);
            }
          } else if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
            // Rate limit exceeded
            const resetTime = response.headers.get('x-ratelimit-reset');
            const parsedResetTime = resetTime ? parseInt(resetTime, 10) : NaN;

            const resetDate = Number.isFinite(parsedResetTime)
              ? formatRepositoryDeploymentTime(parsedResetTime * 1000, language)
              : copy.errors.resetSoon;
            toast.error(text(copy.errors.apiRateLimit, { time: resetDate }));
          } else {
            logStore.logError(copy.errors.fetchRecent, {
              status: response.status,
              statusText: response.statusText,
              error: errorData,
            });
            toast.error(
              isFrench
                ? copy.errors.fetchRecent
                : text(copy.errors.fetchWithReason, { reason: errorData.message || response.statusText }),
            );
          }

          return;
        }

        try {
          const repos = (await response.json()) as GitHubRepoInfo[];
          allRepos = allRepos.concat(repos);

          if (repos.length < 100) {
            hasMore = false;
          } else {
            page += 1;
          }
        } catch (parseError) {
          logStore.logError(copy.errors.parseRepositoryData, { parseError });
          toast.error(copy.errors.parseRepositoryData);
          setRecentRepos([]);

          return;
        }
      }

      setRecentRepos(allRepos);
    } catch (error) {
      logStore.logError(copy.errors.fetchRecent, { error });
      toast.error(copy.errors.fetchRecent);
    } finally {
      setIsFetchingRepos(false);
    }
  };

  // Function to create a new repository or push to an existing one
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const connection = getLocalStorage('github_connection');

    if (!connection?.token || !connection?.user) {
      toast.error(text(copy.errors.connectFirst));
      return;
    }

    if (!repoName.trim()) {
      toast.error(copy.errors.repositoryNameRequired);
      return;
    }

    // Validate repository name
    const sanitizedName = sanitizeRepoName(repoName);

    if (!sanitizedName || sanitizedName.length < 1) {
      toast.error(copy.errors.repositoryNameInvalid);
      return;
    }

    if (sanitizedName.length > 100) {
      toast.error(copy.errors.repositoryNameTooLong);
      return;
    }

    // Update the repo name field with the sanitized version if it was changed
    if (sanitizedName !== repoName) {
      setRepoName(sanitizedName);
      toast.info(text(copy.progress.sanitized, { name: sanitizedName }));
    }

    setIsLoading(true);

    try {
      // Initialize Octokit with the GitHub token
      const octokit = new Octokit({ auth: connection.token });

      let repoExists = false;

      try {
        // Check if the repository already exists - ensure repo name is properly sanitized
        const sanitizedRepoName = sanitizeRepoName(repoName);

        const { data: existingRepo } = await octokit.repos.get({
          owner: connection.user.login,
          repo: sanitizedRepoName,
        });

        repoExists = true;

        // If we get here, the repo exists - confirm overwrite
        let confirmMessage = text(copy.repositoryUpdate.repositoryExists, { name: repoName });

        // Add visibility change warning if needed
        if (existingRepo.private !== isPrivate) {
          const visibilityChange = isPrivate
            ? copy.repositoryUpdate.publicToPrivate
            : copy.repositoryUpdate.privateToPublic;

          confirmMessage += `\n\n${visibilityChange}`;
        }

        const confirmOverwrite = await requestOverwriteConfirmation(confirmMessage);

        if (!confirmOverwrite) {
          setIsLoading(false);
          return;
        }

        // If visibility needs to be updated
        if (existingRepo.private !== isPrivate) {
          await octokit.repos.update({
            owner: connection.user.login,
            repo: sanitizedRepoName,
            private: isPrivate,
          });
        }
      } catch (error: any) {
        // 404 means repo doesn't exist, which is what we want for new repos
        if (error.status !== 404) {
          throw error;
        }
      }

      // Create repository if it doesn't exist
      if (!repoExists) {
        const sanitizedRepoName = sanitizeRepoName(repoName);

        const { data: newRepo } = await octokit.repos.createForAuthenticatedUser({
          name: sanitizedRepoName,
          private: isPrivate,

          // Initialize with a README to avoid empty repository issues
          auto_init: true,

          // Create a .gitignore file for the project
          gitignore_template: 'Node',
        });

        // Set the URL for success dialog
        setCreatedRepoUrl(newRepo.html_url);

        // Since we created the repo with auto_init, we need to wait for GitHub to initialize it
        console.log('Created new repository with auto_init, waiting for GitHub to initialize it...');

        // Wait a moment for GitHub to set up the initial commit
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        // Set URL for existing repo
        const sanitizedRepoName = sanitizeRepoName(repoName);
        setCreatedRepoUrl(`https://github.com/${connection.user.login}/${sanitizedRepoName}`);
      }

      // Process files to upload
      const fileEntries = Object.entries(files);

      // Filter out files and format them for display
      const fileList = fileEntries.map(([filePath, content]) => {
        // The paths are already properly formatted in the GitHubDeploy component
        return {
          path: filePath,
          size: new TextEncoder().encode(content).length,
        };
      });

      setPushedFiles(fileList);

      /*
       * Now we need to handle the repository, whether it's new or existing
       * Get the default branch for the repository
       */
      let defaultBranch: string;
      let baseSha: string | null = null;

      try {
        // For both new and existing repos, get the repository info
        const sanitizedRepoName = sanitizeRepoName(repoName);

        const { data: repo } = await octokit.repos.get({
          owner: connection.user.login,
          repo: sanitizedRepoName,
        });
        defaultBranch = repo.default_branch || 'main';
        console.log(`Repository default branch: ${defaultBranch}`);

        // For a newly created repo (or existing one), get the reference to the default branch
        try {
          const { data: refData } = await octokit.git.getRef({
            owner: connection.user.login,
            repo: sanitizedRepoName,
            ref: `heads/${defaultBranch}`,
          });

          baseSha = refData.object.sha;
          console.log(`Found existing reference with SHA: ${baseSha}`);

          // Get the latest commit to use as a base for our tree
          const { data: commitData } = await octokit.git.getCommit({
            owner: connection.user.login,
            repo: sanitizedRepoName,
            commit_sha: baseSha,
          });

          // Store the base tree SHA for tree creation
          baseSha = commitData.tree.sha;
          console.log(`Using base tree SHA: ${baseSha}`);
        } catch (refError) {
          console.error('Error getting reference:', refError);
          baseSha = null;
        }
      } catch (repoError) {
        console.error('Error getting repository info:', repoError);
        defaultBranch = 'main';
        baseSha = null;
      }

      try {
        console.log('Creating tree for repository');

        // Create a tree with all files
        const tree = fileEntries.map(([filePath, content]) => ({
          path: filePath, // We've already formatted the paths correctly
          mode: '100644' as const, // Regular file
          type: 'blob' as const,
          content,
        }));

        console.log(`Creating tree with ${tree.length} files using base: ${baseSha || 'none'}`);

        // Create a tree with all the files, using the base tree if available
        const sanitizedRepoName = sanitizeRepoName(repoName);

        const { data: treeData } = await octokit.git.createTree({
          owner: connection.user.login,
          repo: sanitizedRepoName,
          tree,
          base_tree: baseSha || undefined,
        });

        console.log('Tree created successfully', treeData.sha);

        // Get the current reference to use as parent for our commit
        let parentCommitSha: string | null = null;

        try {
          const { data: refData } = await octokit.git.getRef({
            owner: connection.user.login,
            repo: sanitizedRepoName,
            ref: `heads/${defaultBranch}`,
          });
          parentCommitSha = refData.object.sha;
          console.log(`Found parent commit: ${parentCommitSha}`);
        } catch (refError) {
          console.log('No reference found, this is a brand new repo', refError);
          parentCommitSha = null;
        }

        // Create a commit with the tree
        console.log('Creating commit');

        const { data: commitData } = await octokit.git.createCommit({
          owner: connection.user.login,
          repo: sanitizedRepoName,
          message: !repoExists
            ? astCopy['clientAst.deploy.github.initialCommit']
            : astCopy['clientAst.deploy.github.updateCommit'],
          tree: treeData.sha,
          parents: parentCommitSha ? [parentCommitSha] : [], // Use parent if available
        });

        console.log('Commit created successfully', commitData.sha);

        // Update the reference to point to the new commit
        try {
          console.log(`Updating reference: heads/${defaultBranch} to ${commitData.sha}`);
          await octokit.git.updateRef({
            owner: connection.user.login,
            repo: sanitizedRepoName,
            ref: `heads/${defaultBranch}`,
            sha: commitData.sha,
            force: true, // Use force to ensure the update works
          });
          console.log('Reference updated successfully');
        } catch (refError) {
          console.log('Failed to update reference, attempting to create it', refError);

          // If the reference doesn't exist, create it (shouldn't happen with auto_init, but just in case)
          try {
            await octokit.git.createRef({
              owner: connection.user.login,
              repo: sanitizedRepoName,
              ref: `refs/heads/${defaultBranch}`,
              sha: commitData.sha,
            });
            console.log('Reference created successfully');
          } catch (createRefError) {
            console.error('Error creating reference:', createRefError);

            const errorMsg =
              typeof createRefError === 'object' && createRefError !== null && 'message' in createRefError
                ? String(createRefError.message)
                : astCopy['clientAst.deploy.github.unknownError'];
            throw new Error(
              formatClientAstResidualCopy(astCopy['clientAst.deploy.github.referenceCreateFailed'], {
                reason: errorMsg,
              }),
            );
          }
        }
      } catch (gitError) {
        console.error('Error with git operations:', gitError);

        const gitErrorMsg =
          typeof gitError === 'object' && gitError !== null && 'message' in gitError
            ? String(gitError.message)
            : astCopy['clientAst.deploy.github.unknownError'];
        throw new Error(
          formatClientAstResidualCopy(astCopy['clientAst.deploy.github.operationsFailed'], {
            reason: gitErrorMsg,
          }),
        );
      }

      // Save the repository information for this chat
      const sanitizedRepoName = sanitizeRepoName(repoName);

      if (currentChatId) {
        localStorage.setItem(
          `github-repo-${currentChatId}`,
          JSON.stringify({
            owner: connection.user.login,
            name: sanitizedRepoName,
            url: `https://github.com/${connection.user.login}/${sanitizedRepoName}`,
          }),
        );
      }

      // Show success dialog
      setShowSuccessDialog(true);
    } catch (error) {
      console.error('Error pushing to GitHub:', error);

      // Attempt to extract more specific error information
      let errorMessage = text(copy.errors.pushFailed);
      let isRetryable = false;

      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();

        if (errorMsg.includes('network') || errorMsg.includes('fetch failed') || errorMsg.includes('connection')) {
          errorMessage = copy.errors.network;
          isRetryable = true;
        } else if (errorMsg.includes('401') || errorMsg.includes('unauthorized')) {
          errorMessage = text(copy.errors.authenticationFailed);
        } else if (errorMsg.includes('403') || errorMsg.includes('forbidden')) {
          errorMessage = text(copy.errors.accessDenied);
        } else if (errorMsg.includes('404') || errorMsg.includes('not found')) {
          errorMessage = text(copy.errors.resourceNotFound);
        } else if (errorMsg.includes('422') || errorMsg.includes('validation failed')) {
          if (errorMsg.includes('name already exists')) {
            errorMessage = copy.errors.nameAlreadyExists;
          } else {
            errorMessage = copy.errors.validationFailed;
          }
        } else if (errorMsg.includes('rate limit') || errorMsg.includes('429')) {
          errorMessage = text(copy.errors.apiRateLimitWait);
          isRetryable = true;
        } else if (errorMsg.includes('timeout')) {
          errorMessage = copy.errors.timeout;
          isRetryable = true;
        } else {
          errorMessage = text(copy.errors.generic);
        }
      } else if (typeof error === 'object' && error !== null) {
        // Octokit errors
        if ('message' in error) {
          errorMessage = text(copy.errors.generic);
        }

        // GitHub API errors
        if ('documentation_url' in error) {
          console.log('GitHub API documentation:', error.documentation_url);
        }
      }

      // Show error with retry suggestion if applicable
      const finalMessage = isRetryable ? text(copy.errors.retry, { message: errorMessage }) : errorMessage;
      toast.error(finalMessage);

      // Log detailed error for debugging
      console.error('Detailed GitHub deployment error:', {
        error,
        repoName: sanitizeRepoName(repoName),
        user: connection?.user?.login,
        isRetryable,
      });
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
    const connection = getLocalStorage('github_connection');

    if (connection?.user && connection?.token) {
      setUser(connection.user);
      fetchRecentRepos(connection.token);
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
                      <span className="i-ph:github-logo w-4 h-4 text-[var(--ecode-accent)]" />
                      {copy.success.repositoryUrl}
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 min-w-0 truncate text-sm bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-4 px-3 py-2 rounded border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark font-mono">
                        {createdRepoUrl}
                      </code>
                      <motion.button
                        onClick={() => {
                          void navigator.clipboard
                            ?.writeText(createdRepoUrl)
                            .then(() => toast.success(copy.success.urlCopied))
                            .catch(() => toast.error(copy.success.urlCopyFailed));
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
                      className="px-4 py-2 rounded-lg bg-[var(--ecode-accent)] text-white hover:brightness-110 text-sm inline-flex items-center gap-2"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="i-ph:github-logo w-4 h-4" />
                      {copy.success.viewRepository}
                    </motion.a>
                    <motion.button
                      onClick={() => {
                        void navigator.clipboard
                          ?.writeText(createdRepoUrl)
                          .then(() => toast.success(copy.success.urlCopied))
                          .catch(() => toast.error(copy.success.urlCopyFailed));
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
              className="w-[90vw] md:w-[500px]"
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
                    className="mx-auto w-16 h-16 rounded-xl bg-bolt-elements-background-depth-3 flex items-center justify-center text-[var(--ecode-accent)]"
                  >
                    <div className="i-ph:github-logo w-8 h-8" />
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
                      className="px-4 py-2 rounded-lg bg-[var(--ecode-accent)] text-white text-sm hover:brightness-110 inline-flex items-center gap-2"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="i-ph:github-logo w-4 h-4" />
                      {text(copy.connection.connectAccount)}
                    </motion.button>
                  </div>
                </div>
              </Dialog.Content>
            </motion.div>
          </div>
        </Dialog.Portal>

        {/* GitHub Auth Dialog */}
        <GitHubAuthDialog isOpen={showAuthDialog} onClose={handleAuthDialogClose} />
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
                    className="w-10 h-10 rounded-xl bg-bolt-elements-background-depth-3 flex items-center justify-center text-[var(--ecode-accent)]"
                  >
                    <div className="i-ph:github-logo w-5 h-5" />
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
                    <img src={user.avatar_url} alt={user.login} className="w-10 h-10 rounded-full" />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[var(--ecode-accent)] flex items-center justify-center text-white">
                      <div className="i-ph:github-logo w-3 h-3" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark">
                      {user.name || user.login}
                    </p>
                    <p className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark">
                      @{user.login}
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
                        onChange={(e) => {
                          const value = e.target.value;
                          setRepoName(value);

                          // Show real-time feedback for invalid characters
                          const sanitized = sanitizeRepoName(value);

                          if (value && value !== sanitized) {
                            // Show preview of sanitized name without being too intrusive
                            e.target.setAttribute('data-sanitized', sanitized);
                          } else {
                            e.target.removeAttribute('data-sanitized');
                          }
                        }}
                        placeholder={copy.form.repositoryNamePlaceholder}
                        className="w-full pl-10 px-4 py-2 rounded-lg bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark placeholder-bolt-elements-textTertiary dark:placeholder-bolt-elements-textTertiary-dark focus:outline-none focus:ring-2 focus:ring-[var(--ecode-accent)]"
                        required
                        maxLength={100}
                        pattern="[a-zA-Z0-9\-_\s]+"
                        title={copy.form.repositoryNameHelp}
                      />
                    </div>
                    {repoName && sanitizeRepoName(repoName) !== repoName && (
                      <p className="text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark mt-1">
                        {copy.form.willCreateAs}{' '}
                        <span className="font-mono text-[var(--ecode-accent)]">{sanitizeRepoName(repoName)}</span>
                      </p>
                    )}
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
                        icon="i-ph:github-logo"
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
                              key={repo.full_name}
                              type="button"
                              onClick={() => setRepoName(repo.name)}
                              className="w-full p-3 text-left rounded-lg bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-3 dark:hover:bg-bolt-elements-background-depth-4 transition-colors group border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark hover:border-[var(--ecode-accent)]/30"
                              whileHover={{ scale: 1.01 }}
                              whileTap={{ scale: 0.99 }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="i-ph:git-branch w-4 h-4 text-[var(--ecode-accent)]" />
                                  <span className="text-sm font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark group-hover:text-[var(--ecode-accent)]">
                                    {repo.name}
                                  </span>
                                </div>
                                {repo.private && (
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
                                {repo.language && (
                                  <Badge variant="subtle" size="sm" icon="i-ph:code w-3 h-3">
                                    {repo.language}
                                  </Badge>
                                )}
                                <Badge variant="subtle" size="sm" icon="i-ph:star w-3 h-3">
                                  {formatRepositoryDeploymentNumber(repo.stargazers_count, language)}
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
                        className="rounded border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark text-[var(--ecode-accent)] focus:ring-[var(--ecode-accent)] dark:bg-bolt-elements-background-depth-3"
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
                        'flex-1 px-4 py-2 bg-[var(--ecode-accent)] text-white rounded-lg hover:brightness-110 text-sm inline-flex items-center justify-center gap-2',
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
                          <div className="i-ph:github-logo w-4 h-4" />
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

      {/* GitHub Auth Dialog */}
      <GitHubAuthDialog isOpen={showAuthDialog} onClose={handleAuthDialogClose} />
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
