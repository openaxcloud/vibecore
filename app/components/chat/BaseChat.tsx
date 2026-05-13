/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
/* eslint-disable import/order */
import * as Tooltip from '@radix-ui/react-tooltip';
import { EditorAdapter } from '@vibecore/editor';
import type { JSONValue, Message } from 'ai';
import Cookies from 'js-cookie';
import React, { lazy, Suspense, type RefCallback, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelGroup } from 'react-resizable-panels';
import { ClientOnly } from 'remix-utils/client-only';
import { getApiKeysFromCookies } from './APIKeyManager';
import styles from './BaseChat.module.scss';
import ChatAlert from './ChatAlert';
import GitCloneButton from './GitCloneButton';
import { Messages } from './Messages.client';
import { ImportButtons } from '~/components/chat/chatExportAndImport/ImportButtons';
import { Menu } from '~/components/sidebar/Menu.client';
import { PanelBoundary, PanelLoading } from '~/components/ui/PanelBoundary';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { FileTree } from '~/components/workbench/FileTree';
import { Preview } from '~/components/workbench/Preview';
import { Search } from '~/components/workbench/Search';
import { LockManager } from '~/components/workbench/LockManager';
import type { FileMap } from '~/lib/stores/files';
import { workbenchStore } from '~/lib/stores/workbench';
import { themeStore } from '~/lib/stores/theme';
import type { ProviderInfo } from '~/types/model';
import { classNames } from '~/utils/classNames';
import { PROVIDER_LIST, WORK_DIR } from '~/utils/constants';
import { ExamplePrompts } from '~/components/chat/ExamplePrompts';
import StarterTemplates from './StarterTemplates';
import type { ActionAlert, SupabaseAlert, DeployAlert, LlmErrorAlertType } from '~/types/actions';
import DeployChatAlert from '~/components/deploy/DeployAlert';
import {
  BOLT_DEPLOY_PROVIDERS,
  DEFAULT_DEPLOY_BUILD_COMMAND,
  DEFAULT_DEPLOY_OUTPUT_DIRECTORY,
  detectFrameworkFromDeployConfig,
} from '~/components/deploy/deployUtils';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { useProjectCollaboration } from '~/lib/collaboration/useProjectCollaboration';

const LazyWorkbench = lazy(() =>
  import('~/components/workbench/Workbench.client').then((module) => ({ default: module.Workbench })),
);
const LazyTerminalTabs = lazy(() =>
  import('~/components/workbench/terminal/TerminalTabs').then((module) => ({ default: module.TerminalTabs })),
);
import ProgressCompilation from './ProgressCompilation';
import type { ProgressAnnotation } from '~/types/context';
import { SupabaseChatAlert } from '~/components/chat/SupabaseAlert';
import { expoUrlAtom } from '~/lib/stores/qrCodeStore';
import { useStore } from '@nanostores/react';
import { StickToBottom, useStickToBottomContext } from '~/lib/hooks';
import { ChatBox } from './ChatBox';
import type { DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import LlmErrorAlert from './LLMApiAlert';
import { useResponsiveLayout } from '@vibecore/editor';
import { useSwipeGesture } from '~/lib/hooks/useMobileGestures';
import { useMobileIdePersistence } from '~/lib/hooks/useMobileIdePersistence';
import { getProjectIdeMemory, saveProjectIdeMemory } from '~/lib/persistence/projectIdeMemory';
import { useSearchParams } from '@remix-run/react';

const TEXTAREA_MIN_HEIGHT = 76;

const IDE_MANAGEMENT_PANELS = [
  'overview',
  'database',
  'object-storage',
  'packages',
  'monitoring',
  'extensions',
  'integrations',
  'workflows',
  'deployments',
  'security',
  'env',
  'secrets',
  'git',
  'activity',
  'terminal',
  'logs',
  'collaborators',
  'domains',
  'snapshots',
  'settings',
] as const;

const IDE_RIGHT_PANELS = ['files'] as const;
const IDE_WORKSPACE_PANELS = ['editor', 'preview', 'files', 'search', 'locks', ...IDE_MANAGEMENT_PANELS] as const;
const MOBILE_IDE_PANELS = ['chat', 'files', 'editor', 'terminal', 'preview', 'deploy'] as const;

const IDE_TOOL_DESCRIPTIONS: Record<IdeWorkspacePanel | IdeRightPanel, string> = {
  overview: 'Project summary',
  database: 'SQL browser',
  'object-storage': 'File storage',
  packages: 'Dependencies manager',
  monitoring: 'App metrics',
  extensions: 'Marketplace',
  integrations: 'Connected services',
  workflows: 'Task automation',
  deployments: 'Publish your app',
  security: 'Security scanner',
  env: 'Environment variables',
  secrets: 'Environment variables',
  git: 'Version control',
  activity: 'Project timeline',
  terminal: 'Workspace terminal',
  logs: 'Terminal',
  collaborators: 'Team access',
  domains: 'Custom domains',
  snapshots: 'Rollback points',
  settings: 'Project settings',
  editor: 'Code editor',
  preview: 'App preview',
  files: 'Browse project files',
  search: 'Find in files',
  locks: 'Locked files',
};

type IdeRightPanel = (typeof IDE_RIGHT_PANELS)[number];
type IdeManagementPanel = (typeof IDE_MANAGEMENT_PANELS)[number];
type IdeWorkspacePanel = (typeof IDE_WORKSPACE_PANELS)[number];
type IdePaneTab = {
  id: string;
  panel: IdeWorkspacePanel;
  pinned?: boolean;
  filePath?: string;
  preview?: boolean;
};
type AgentToolAction = {
  panel: IdeWorkspacePanel | IdeRightPanel;
  title: string;
  description: string;
  icon: string;
};
type ProjectSnapshot = {
  id: string;
  label?: string;
  kind?: string;
  createdAt?: string;
  byteLength?: number;
};
type ProjectConversationCheckpoint = {
  id: string;
  title: string;
  description: string;
  messageId?: string;
  messageIndex: number;
  conversationId: string;
  conversationTitle: string;
  createdAt?: string;
  ageLabel: string;
  commitSha?: string;
  snapshot?: ProjectSnapshot;
  messages: Message[];
};
type ProjectAgentSuggestion = {
  id: string;
  label: string;
  prompt: string;
  reason: string;
  icon: string;
  priority: number;
};
type ProjectAgentExecutionMode = 'ask' | 'edit' | 'agent' | 'architect';

const PROJECT_AGENT_EXECUTION_MODES: Array<{
  id: ProjectAgentExecutionMode;
  label: string;
  chatMode: 'discuss' | 'build';
  description: string;
}> = [
  {
    id: 'ask',
    label: 'Ask',
    chatMode: 'discuss',
    description: 'Answer, explain, and inspect without changing files or running commands.',
  },
  {
    id: 'edit',
    label: 'Edit',
    chatMode: 'build',
    description: 'Make scoped code changes only after identifying the target files.',
  },
  {
    id: 'agent',
    label: 'Agent',
    chatMode: 'build',
    description: 'Execute the requested task end to end with verification.',
  },
  {
    id: 'architect',
    label: 'Architect',
    chatMode: 'discuss',
    description: 'Design architecture, contracts, risks, and rollout steps before implementation.',
  },
];

const INTEGRATION_CATALOG = [
  ['github', 'GitHub', 'Connect repositories for code sync and CI/CD.', 'cicd', 'i-ph:github-logo'],
  ['slack', 'Slack', 'Send build, deploy and incident notifications to channels.', 'communication', 'i-ph:slack-logo'],
  ['jira', 'Jira', 'Sync issues and delivery work across projects.', 'project', 'i-ph:kanban'],
  ['notion', 'Notion', 'Sync docs and product notes with project context.', 'project', 'i-ph:notion-logo'],
  ['gitlab', 'GitLab', 'Alternative Git hosting and CI pipelines.', 'cicd', 'i-ph:gitlab-logo'],
  ['discord', 'Discord', 'Send workspace notifications to Discord.', 'communication', 'i-ph:discord-logo'],
  ['trello', 'Trello', 'Visual boards and cards for product work.', 'project', 'i-ph:columns'],
  ['asana', 'Asana', 'Team work management and task tracking.', 'project', 'i-ph:list-checks'],
  ['figma', 'Figma', 'Design collaboration and handoff links.', 'project', 'i-ph:figma-logo'],
  ['linear', 'Linear', 'Issues, sprints and roadmaps.', 'project', 'i-ph:chart-line-up'],
  ['zendesk', 'Zendesk', 'Support tickets and customer operations.', 'support', 'i-ph:headset'],
  ['datadog', 'Datadog', 'Infrastructure and application monitoring.', 'observability', 'i-ph:chart-line'],
  ['sentry', 'Sentry', 'Error tracking and release health.', 'observability', 'i-ph:warning-diamond'],
  ['pagerduty', 'PagerDuty', 'Incident routing and on-call escalation.', 'observability', 'i-ph:bell-ringing'],
  ['newrelic', 'New Relic', 'Full-stack observability data.', 'observability', 'i-ph:pulse'],
  ['grafana', 'Grafana', 'Dashboards and metrics visualization.', 'observability', 'i-ph:gauge'],
  ['jenkins', 'Jenkins', 'Self-hosted automation server.', 'cicd', 'i-ph:factory'],
  ['circleci', 'CircleCI', 'Continuous integration and delivery.', 'cicd', 'i-ph:circle'],
  ['github-actions', 'GitHub Actions', 'Repository-native workflow automation.', 'cicd', 'i-ph:git-branch'],
  ['vercel', 'Vercel', 'Deploy and host modern web apps.', 'cicd', 'i-ph:triangle'],
  ['aws-s3', 'AWS S3', 'Object storage for assets and exports.', 'data', 'i-ph:cloud'],
  ['mongodb', 'MongoDB', 'Document database integration.', 'data', 'i-ph:database'],
  ['postgresql', 'PostgreSQL', 'Relational database integration.', 'data', 'i-ph:database'],
  ['redis', 'Redis', 'In-memory cache and queue service.', 'data', 'i-ph:stack'],
  ['elasticsearch', 'Elasticsearch', 'Search and analytics indexing.', 'data', 'i-ph:magnifying-glass'],
  ['stripe', 'Stripe', 'Payments, billing and webhook events.', 'payments', 'i-ph:credit-card'],
  ['twilio', 'Twilio', 'SMS, voice and communications APIs.', 'communication', 'i-ph:phone'],
  ['sendgrid', 'SendGrid', 'Transactional email delivery.', 'communication', 'i-ph:paper-plane-tilt'],
  ['intercom', 'Intercom', 'Customer messaging and support.', 'support', 'i-ph:chat-circle-text'],
  ['hubspot', 'HubSpot', 'CRM and marketing automation.', 'support', 'i-ph:users-three'],
  ['salesforce', 'Salesforce', 'Enterprise CRM workflows.', 'support', 'i-ph:building-office'],
  ['zapier', 'Zapier', 'Cross-tool workflow automation.', 'automation', 'i-ph:lightning'],
] as const;
const INTEGRATION_CATEGORIES = [
  ['all', 'All Integrations', 'i-ph:link'],
  ['cicd', 'CI/CD', 'i-ph:rocket-launch'],
  ['observability', 'Observability', 'i-ph:chart-line'],
  ['communication', 'Communication', 'i-ph:globe'],
  ['project', 'Project Management', 'i-ph:kanban'],
  ['support', 'Support', 'i-ph:headset'],
  ['data', 'Data & Storage', 'i-ph:database'],
  ['payments', 'Payments', 'i-ph:shield-check'],
  ['automation', 'Automation', 'i-ph:hard-drives'],
] as const;
const TERMINAL_SCRIPT_TEMPLATES = [
  ['start-dev', 'Start Development Server', 'Start the development server with hot reload.', 'npm run dev'],
  ['build', 'Build Project', 'Build the project for production.', 'npm run build'],
  ['test', 'Run Tests', 'Execute the test suite.', 'npm test'],
  ['lint', 'Lint Code', 'Check code style and static issues.', 'npm run lint'],
  ['db-migrate', 'Database Migration', 'Run database migrations.', 'npm run db:migrate'],
  ['docker-build', 'Docker Build', 'Build the project Docker image.', 'docker build -t vibecore-project .'],
  ['git-status', 'Git Status', 'Inspect repository status and recent commits.', 'git status && git log --oneline -5'],
  ['clean-deps', 'Clean Dependencies', 'Remove and reinstall dependencies.', 'rm -rf node_modules && npm install'],
] as const;
type ProjectIdeBackendState = {
  workspace?: { id?: string; status?: string; runtimeMode?: string } | null;
  ports?: Array<{ port?: number; ready?: boolean; type?: string; url?: string }>;
  git?: { branch?: string; ahead?: number; behind?: number; changedFiles?: unknown[] };
  files?: Array<{ path: string; sizeBytes?: number }>;
  recentActivity?: Array<{ action: string; createdAt?: string }>;
  collaborators?: Array<{ id?: string; userId?: string; roleKey?: string }>;
};
type IdePaneLeaf = { type: 'leaf'; id: string; tabs: IdePaneTab[]; activeTabId?: string };
type IdePaneSplit = {
  type: 'split';
  id: string;
  direction: 'horizontal';
  first: IdePaneNode;
  second: IdePaneNode;
};
type IdePaneNode = IdePaneLeaf | IdePaneSplit;

function runtimeStatusText(input: {
  workspaceStatus?: { status?: string } | null;
  workspaceLoading: boolean;
  workspaceError?: string;
}) {
  if (input.workspaceError) {
    return 'Runtime: Error';
  }

  if (input.workspaceLoading) {
    return 'Runtime: Starting';
  }

  const status = input.workspaceStatus?.status?.toLowerCase();

  if (status === 'running') {
    return 'Runtime: Running';
  }

  if (status === 'booting' || status === 'starting') {
    return 'Runtime: Starting';
  }

  if (status === 'error') {
    return 'Runtime: Error';
  }

  if (status === 'stopped') {
    return 'Runtime: Stopped';
  }

  return 'Runtime: Not started';
}

function previewPortText(input: {
  previews: Array<{ port: number; ready?: boolean }>;
  workspaceLoading: boolean;
  workspaceError?: string;
  previewServerState: { status: string };
}) {
  const activePreview = input.previews.find((preview) => preview.ready !== false) ?? input.previews[0];

  if (activePreview) {
    return `Port :${activePreview.port}`;
  }

  if (input.workspaceError) {
    return 'Port: unavailable';
  }

  return input.workspaceLoading || input.previewServerState.status === 'starting' ? 'Port: detecting' : 'Port: none';
}

function previewCommandFromLogs(logs: string[]) {
  for (const log of [...logs].reverse()) {
    const message = typeof log === 'string' ? log : '';
    const match = message.match(/Starting preview with ([^\n]+)/i);

    if (match?.[1]) {
      return match[1].replace(/\s+in\s+.+$/i, '').trim();
    }
  }

  return undefined;
}

function devServerStatusText(input: {
  previews: Array<{ ready?: boolean }>;
  workspaceLoading: boolean;
  workspaceError?: string;
  logs: string[];
  previewServerState: { status: string; command?: string; error?: string };
}) {
  const command = input.previewServerState.command ?? previewCommandFromLogs(input.logs);

  if (input.previews.some((preview) => preview.ready !== false)) {
    return command ? `Dev: active (${command})` : 'Dev: active';
  }

  if (input.workspaceError || input.previewServerState.status === 'error') {
    return 'Dev: blocked';
  }

  if (
    input.workspaceLoading ||
    input.previewServerState.status === 'starting' ||
    input.previewServerState.status === 'stopping' ||
    command
  ) {
    if (input.previewServerState.status === 'stopping') {
      return command ? `Dev: stopping (${command})` : 'Dev: stopping';
    }

    return command ? `Dev: starting (${command})` : 'Dev: starting';
  }

  return 'Dev: idle';
}

function fileTypeLabel(filePath?: string) {
  const extension = filePath?.split('.').pop()?.toLowerCase();

  if (extension === 'ts' || extension === 'tsx') {
    return 'TypeScript';
  }

  if (extension === 'js' || extension === 'jsx') {
    return 'JavaScript';
  }

  if (extension === 'json') {
    return 'JSON';
  }

  if (extension === 'css' || extension === 'scss') {
    return 'Stylesheet';
  }

  if (extension === 'md' || extension === 'mdx') {
    return 'Markdown';
  }

  return extension ? extension.toUpperCase() : 'Project';
}

function shortContent(value: unknown, fallback = 'Project update') {
  const text = String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text ? text.slice(0, 120) : fallback;
}

function timeAgo(value?: string) {
  if (!value) {
    return 'just now';
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return 'recorded';
  }

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  const units: Array<[number, string]> = [
    [60 * 60 * 24 * 365, 'year'],
    [60 * 60 * 24 * 30, 'month'],
    [60 * 60 * 24, 'day'],
    [60 * 60, 'hour'],
    [60, 'minute'],
  ];

  for (const [size, label] of units) {
    const count = Math.floor(seconds / size);

    if (count >= 1) {
      return `${count} ${label}${count === 1 ? '' : 's'} ago`;
    }
  }

  return 'just now';
}

function messageCreatedAt(message: Message | undefined) {
  const candidate = (message as any)?.createdAt ?? (message as any)?.timestamp;

  if (candidate instanceof Date) {
    return candidate.toISOString();
  }

  return typeof candidate === 'string' ? candidate : undefined;
}

function hasProjectFile(files: FileMap, matcher: (filePath: string) => boolean) {
  return Object.entries(files).some(([filePath, file]) => file?.type === 'file' && matcher(filePath));
}

function projectFileNames(files: FileMap) {
  return Object.entries(files)
    .filter(([, file]) => file?.type === 'file')
    .map(([filePath]) => filePath);
}

function buildProjectAgentSuggestions(input: {
  files: FileMap;
  selectedFile?: string;
  messages?: Message[];
  backendState: ProjectIdeBackendState;
  runtimeState: ProjectIdeBackendState;
  workspaceLogs: string[];
  activePanel: IdeWorkspacePanel;
  chatStarted: boolean;
}): ProjectAgentSuggestion[] {
  const {
    files,
    selectedFile,
    messages = [],
    backendState,
    runtimeState,
    workspaceLogs,
    activePanel,
    chatStarted,
  } = input;

  const filePaths = projectFileNames(files);
  const changedFiles = backendState.git?.changedFiles?.length ?? 0;

  const recentText = messages
    .slice(-6)
    .map((message) => String(message.content ?? ''))
    .join(' ')
    .toLowerCase();

  const lastUserText = [...messages].reverse().find((message) => message.role === 'user')?.content;
  const recentLogs = workspaceLogs.slice(-40).join('\n').toLowerCase();
  const previewRunning = (runtimeState.ports ?? []).some((port) => port.ready !== false);

  const hasPackageJson = hasProjectFile(
    files,
    (filePath) => filePath.endsWith('/package.json') || filePath === 'package.json',
  );
  const hasTests = hasProjectFile(
    files,
    (filePath) => /\.(test|spec)\.[jt]sx?$/.test(filePath) || filePath.includes('__tests__'),
  );
  const hasEnvExample = hasProjectFile(
    files,
    (filePath) => filePath.endsWith('.env.example') || filePath.includes('/.env'),
  );
  const hasDbFiles = hasProjectFile(files, (filePath) =>
    /(schema\.prisma|supabase|drizzle|migrations|tenders\.json|database|db\.)/i.test(filePath),
  );

  const hasUiFiles = hasProjectFile(files, (filePath) => /\.(tsx|jsx|css|scss)$/.test(filePath));

  const hasApiFiles = hasProjectFile(files, (filePath) =>
    /(api|server|route|routes|controller|handler)/i.test(filePath),
  );

  const selectedLabel = selectedFile ? selectedFile.split('/').slice(-2).join('/') : undefined;

  const suggestions: ProjectAgentSuggestion[] = [];

  const add = (suggestion: ProjectAgentSuggestion) => {
    if (!suggestions.some((item) => item.id === suggestion.id || item.prompt === suggestion.prompt)) {
      suggestions.push(suggestion);
    }
  };

  if (/error|failed|exception|traceback|cannot|econn|invalid/i.test(recentLogs)) {
    add({
      id: 'fix-runtime-error',
      label: 'Fix latest error',
      prompt:
        'Analyze the latest runtime logs, identify the root cause, and patch the project so the preview runs cleanly.',
      reason: 'Recent logs contain errors',
      icon: 'i-ph:warning',
      priority: 100,
    });
  }

  if (!previewRunning && hasPackageJson) {
    add({
      id: 'start-preview',
      label: 'Get preview running',
      prompt:
        'Inspect the project startup setup, install or fix missing dependencies if needed, and get the preview dev server running.',
      reason: 'Preview has no active port',
      icon: 'i-ph:browser',
      priority: 95,
    });
  }

  if (selectedFile) {
    add({
      id: 'improve-selected-file',
      label: `Improve ${selectedLabel}`,
      prompt: `Review ${selectedFile}, explain the most important improvement, then implement it with minimal changes.`,
      reason: 'Based on the open file',
      icon: 'i-ph:file-code',
      priority: 88,
    });
  }

  if (changedFiles > 0) {
    add({
      id: 'review-changes',
      label: 'Review changes',
      prompt:
        'Review the current uncommitted project changes, summarize what changed, find likely bugs, and suggest the next safe commit.',
      reason: `${changedFiles} changed file${changedFiles === 1 ? '' : 's'}`,
      icon: 'i-ph:git-diff',
      priority: 84,
    });
  }

  if (/deploy|publish|ship|production|prod|domain/.test(recentText) || activePanel === 'deployments') {
    add({
      id: 'prepare-deploy',
      label: 'Prepare deploy',
      prompt:
        'Check the project for deployment readiness: build command, env vars, output directory, runtime risks, and any blocker before publishing.',
      reason: 'Deployment context detected',
      icon: 'i-ph:rocket-launch',
      priority: 80,
    });
  }

  if (!hasTests && filePaths.length > 4) {
    add({
      id: 'add-smoke-tests',
      label: 'Add smoke tests',
      prompt:
        'Add a small smoke test or validation script for the most important user flow in this project, following the existing stack.',
      reason: 'No tests detected',
      icon: 'i-ph:check-circle',
      priority: 72,
    });
  }

  if (hasDbFiles || /database|db|data|schema|migration|supabase/.test(recentText)) {
    add({
      id: 'audit-data-layer',
      label: 'Audit data flow',
      prompt:
        'Inspect the project data layer and recent conversation context, then fix the highest-risk data consistency or schema issue.',
      reason: 'Database/data files detected',
      icon: 'i-ph:database',
      priority: 70,
    });
  }

  if (hasUiFiles && (/ui|design|button|panel|theme|mobile|responsive/.test(recentText) || activePanel === 'preview')) {
    add({
      id: 'polish-ui',
      label: 'Polish current UI',
      prompt:
        'Audit the current UI for layout, theme, responsive issues and interaction gaps, then patch the most visible problems.',
      reason: 'UI work is active',
      icon: 'i-ph:paint-brush',
      priority: 68,
    });
  }

  if (hasEnvExample || /api key|env|secret|provider|openai|anthropic/.test(recentText)) {
    add({
      id: 'check-config',
      label: 'Check config',
      prompt:
        'Validate environment variables and provider configuration for this project, then fix missing or misleading UI/config states.',
      reason: 'Config/provider context detected',
      icon: 'i-ph:key',
      priority: 64,
    });
  }

  if (hasApiFiles) {
    add({
      id: 'harden-api',
      label: 'Harden API paths',
      prompt:
        'Inspect the API/server routes touched by this project and fix one concrete reliability, error handling, or missing route issue.',
      reason: 'Server/API files detected',
      icon: 'i-ph:shield-check',
      priority: 58,
    });
  }

  if (lastUserText && chatStarted) {
    add({
      id: 'continue-last-request',
      label: 'Continue last request',
      prompt: `Continue from my last request: "${shortContent(lastUserText, 'the last request')}". Check what is still missing and finish it.`,
      reason: 'Based on the latest conversation',
      icon: 'i-ph:arrow-bend-down-right',
      priority: 92,
    });
  }

  add({
    id: 'add-feature',
    label: 'Add a feature',
    prompt:
      'Inspect the current project and add one useful, coherent feature. Keep the change small, runnable, and aligned with the existing app structure.',
    reason: 'Core Bolt workflow',
    icon: 'i-ph:plus-circle',
    priority: 88,
  });

  add({
    id: 'next-best-step',
    label: 'Find next best step',
    prompt:
      'Analyze the current project files, recent conversation, preview/runtime state and git changes, then choose and implement the highest-impact next step.',
    reason: 'Project-aware fallback',
    icon: 'i-ph:sparkle',
    priority: 1,
  });

  return suggestions.sort((left, right) => right.priority - left.priority).slice(0, 4);
}

const DEFAULT_PANE_TREE: IdePaneLeaf = {
  type: 'leaf',
  id: 'pane-main',
  tabs: [
    { id: 'tab-editor-default', panel: 'editor' },
    { id: 'tab-preview-default', panel: 'preview', pinned: true },
  ],
  activeTabId: 'tab-editor-default',
};

function cloneDefaultPaneTree(): IdePaneNode {
  return JSON.parse(JSON.stringify(DEFAULT_PANE_TREE));
}

function collectPaneTabs(node: any): IdePaneTab[] {
  if (node?.type === 'leaf' && Array.isArray(node.tabs)) {
    return node.tabs;
  }

  return [...collectPaneTabs(node?.first), ...collectPaneTabs(node?.second)];
}

function ensureCorePaneTabs(tabs: IdePaneTab[]) {
  const nextTabs = [...tabs];

  if (!nextTabs.some((tab) => tab.panel === 'editor')) {
    nextTabs.unshift({ id: 'tab-editor-default', panel: 'editor' });
  }

  if (!nextTabs.some((tab) => tab.panel === 'preview')) {
    nextTabs.push({ id: 'tab-preview-default', panel: 'preview', pinned: true });
  }

  return nextTabs;
}

function normalizePaneTree(node: any): IdePaneNode {
  if (node?.type === 'split') {
    return {
      type: 'split',
      id: typeof node.id === 'string' ? node.id : 'pane-split-root',
      direction: 'horizontal',
      first: normalizePaneTree(node.first),
      second: normalizePaneTree(node.second),
    };
  }

  const tabs = ensureCorePaneTabs(collectPaneTabs(node));
  const legacyActiveTabId = typeof node?.activeTabId === 'string' ? node.activeTabId : undefined;
  const activeTabId = tabs.some((tab) => tab.id === legacyActiveTabId) ? legacyActiveTabId : tabs[tabs.length - 1]?.id;

  return {
    type: 'leaf',
    id: 'pane-main',
    tabs,
    activeTabId,
  };
}

function isIdeRightPanel(panel: string): panel is IdeRightPanel {
  return (IDE_RIGHT_PANELS as readonly string[]).includes(panel);
}

function isIdeWorkspacePanel(panel: string): panel is IdeWorkspacePanel {
  return (IDE_WORKSPACE_PANELS as readonly string[]).includes(panel);
}

function isIdeManagementPanel(panel: string): panel is IdeManagementPanel {
  return (IDE_MANAGEMENT_PANELS as readonly string[]).includes(panel);
}

function makePaneTab(panel: IdeWorkspacePanel, options: Partial<IdePaneTab> = {}): IdePaneTab {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id: options.id ?? `tab-${panel}-${suffix}`,
    panel,
    pinned: options.pinned,
    filePath: options.filePath,
  };
}

function inferAgentToolAction(message: string | undefined): AgentToolAction | null {
  const text = (message ?? '').toLowerCase();

  const matches: Array<[RegExp, IdeWorkspacePanel | IdeRightPanel, string]> = [
    [/\b(open|show|ouvre|affiche).*\b(files?|fichiers?|explorer)\b|\b(files?|fichiers?)\b/, 'files', 'Open Files'],
    [/\b(search|find|recherche)\b/, 'search', 'Open Search'],
    [/\b(database|sql|db|base de donn)/, 'database', 'Open Database'],
    [/\b(terminal|console|logs?|shell)\b/, 'terminal', 'Open Terminal'],
    [/\b(preview|webview|aperçu|apercu)\b/, 'preview', 'Open Webview'],
    [/\b(deploy|deployment|publish|publier|déploiement|deploiement)\b/, 'deployments', 'Open Deployments'],
    [/\b(secret|env|environment variable)\b/, 'secrets', 'Open Secrets'],
    [/\bgit\b|\bbranch\b|\bcommit\b/, 'git', 'Open Git'],
    [/\b(package|dependency|dependencies|npm|pnpm)\b/, 'packages', 'Open Packages'],
    [
      /\b(integration|integrations|webhook|api key|event stream|slack|jira|sentry|stripe|zapier)\b/,
      'integrations',
      'Open Integrations',
    ],
    [/\b(workflow|workflows|run button|automation|automate|script|task)\b/, 'workflows', 'Open Workflows'],
    [/\b(snapshot|checkpoint|restore|rollback)\b/, 'snapshots', 'Open Snapshots'],
    [/\b(extension|marketplace)\b/, 'extensions', 'Open Extensions'],
    [/\bmonitoring|metrics|observability\b/, 'monitoring', 'Open Monitoring'],
    [/\bsettings|param(è|e)tres|configuration\b/, 'settings', 'Open Settings'],
  ];

  const match = matches.find(([pattern]) => pattern.test(text));

  if (!match) {
    return null;
  }

  const [, panel, title] = match;

  return {
    panel,
    title,
    description: IDE_TOOL_DESCRIPTIONS[panel],
    icon: panelIcon(panel),
  };
}

function resolveMentionedProjectFiles(message: string, projectFilePaths: string[]) {
  const rawMentions = Array.from(message.matchAll(/@([^\s,;:()[\]{}"'`]+)/g)).map((match) =>
    match[1].replace(/[.!?]+$/, ''),
  );

  const matches: string[] = [];

  for (const mention of rawMentions) {
    const normalizedMention = mention.replace(/^\/+/, '').toLowerCase();

    const match = projectFilePaths.find((filePath) => {
      const normalizedPath = filePath.replace(/^\/+/, '').toLowerCase();

      return (
        normalizedPath === normalizedMention ||
        normalizedPath.endsWith(`/${normalizedMention}`) ||
        normalizedPath.includes(normalizedMention)
      );
    });

    if (match && !matches.includes(match)) {
      matches.push(match);
    }
  }

  return matches.slice(0, 12);
}

function buildProjectAgentPrompt({
  message,
  mode,
  planFirst,
  mentionedFiles,
}: {
  message: string;
  mode: ProjectAgentExecutionMode;
  planFirst: boolean;
  mentionedFiles: string[];
}) {
  const modeConfig = PROJECT_AGENT_EXECUTION_MODES.find((item) => item.id === mode) ?? PROJECT_AGENT_EXECUTION_MODES[2];

  const guardrails = [
    `Mode: ${modeConfig.label}. ${modeConfig.description}`,
    planFirst
      ? 'Plan first is enabled: produce a concise, reviewable plan and wait for explicit approval before editing files, running shell commands, deploying, or applying destructive actions.'
      : 'Plan first is disabled: proceed according to the selected mode, but keep changes scoped and verify them.',
  ];

  if (mode === 'ask') {
    guardrails.push(
      'Do not edit files, run shell commands, or trigger runtime tools unless the user explicitly switches mode.',
    );
  }

  if (mode === 'architect') {
    guardrails.push(
      'Prioritize architecture, contracts, rollout sequence, risks, and acceptance criteria over code changes.',
    );
  }

  if (mentionedFiles.length > 0) {
    guardrails.push(`User-selected file context: ${mentionedFiles.map((filePath) => `@${filePath}`).join(', ')}`);
  }

  return `<vibecore_agent_request>\n${guardrails.map((line) => `- ${line}`).join('\n')}\n</vibecore_agent_request>\n\n${message}`;
}

function findFirstLeaf(node: IdePaneNode): IdePaneLeaf | undefined {
  return node.type === 'leaf' ? node : (findFirstLeaf(node.first) ?? findFirstLeaf(node.second));
}

function findLeaf(node: IdePaneNode, paneId: string): IdePaneLeaf | undefined {
  if (node.type === 'leaf') {
    return node.id === paneId ? node : undefined;
  }

  return findLeaf(node.first, paneId) ?? findLeaf(node.second, paneId);
}

function findLeafContainingTab(node: IdePaneNode, tabId: string): IdePaneLeaf | undefined {
  if (node.type === 'leaf') {
    return node.tabs.some((tab) => tab.id === tabId) ? node : undefined;
  }

  return findLeafContainingTab(node.first, tabId) ?? findLeafContainingTab(node.second, tabId);
}

function updateLeaf(node: IdePaneNode, paneId: string, updater: (leaf: IdePaneLeaf) => IdePaneNode): IdePaneNode {
  if (node.type === 'leaf') {
    return node.id === paneId ? updater(node) : node;
  }

  return {
    ...node,
    first: updateLeaf(node.first, paneId, updater),
    second: updateLeaf(node.second, paneId, updater),
  };
}

function flattenTabs(node: IdePaneNode): IdePaneTab[] {
  if (node.type === 'leaf') {
    return node.tabs;
  }

  return [...flattenTabs(node.first), ...flattenTabs(node.second)];
}

interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  onStreamingChange?: (streaming: boolean) => void;
  messages?: Message[];
  description?: string;
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  input?: string;
  model?: string;
  setModel?: (model: string) => void;
  provider?: ProviderInfo;
  setProvider?: (provider: ProviderInfo) => void;
  providerList?: ProviderInfo[];
  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt?: () => void;
  importChat?: (description: string, messages: Message[]) => Promise<void>;
  exportChat?: () => void;
  uploadedFiles?: File[];
  setUploadedFiles?: (files: File[]) => void;
  imageDataList?: string[];
  setImageDataList?: (dataList: string[]) => void;
  actionAlert?: ActionAlert;
  clearAlert?: () => void;
  supabaseAlert?: SupabaseAlert;
  clearSupabaseAlert?: () => void;
  deployAlert?: DeployAlert;
  clearDeployAlert?: () => void;
  llmErrorAlert?: LlmErrorAlertType;
  clearLlmErrorAlert?: () => void;
  data?: JSONValue[] | undefined;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  append?: (message: Message) => void;
  resetChat?: () => void;
  designScheme?: DesignScheme;
  setDesignScheme?: (scheme: DesignScheme) => void;
  selectedElement?: ElementInfo | null;
  setSelectedElement?: (element: ElementInfo | null) => void;
  addToolResult?: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
  onWebSearchResult?: (result: string) => void;
  projectIdeMode?: boolean;
  projectId?: string;
}

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      textareaRef,
      showChat = true,
      chatStarted = false,
      isStreaming = false,
      onStreamingChange,
      model,
      setModel,
      provider,
      setProvider,
      providerList,
      input = '',
      enhancingPrompt,
      handleInputChange,

      // promptEnhanced,
      enhancePrompt,
      sendMessage,
      handleStop,
      importChat,
      exportChat,
      uploadedFiles = [],
      setUploadedFiles,
      imageDataList = [],
      setImageDataList,
      messages,
      actionAlert,
      clearAlert,
      deployAlert,
      clearDeployAlert,
      supabaseAlert,
      clearSupabaseAlert,
      llmErrorAlert,
      clearLlmErrorAlert,
      data,
      chatMode,
      setChatMode,
      append,
      resetChat,
      designScheme,
      setDesignScheme,
      selectedElement,
      setSelectedElement,
      addToolResult = () => {
        console.warn('Tool result ignored because addToolResult is not available in this render path.');
      },
      onWebSearchResult,
      projectIdeMode = false,
      projectId,
    },
    ref,
  ) => {
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;
    const [searchParams, setSearchParams] = useSearchParams();
    const layout = useResponsiveLayout();
    const useMobileIde = layout.isMobile || layout.isTabletPortrait;

    const [mobilePanel, setMobilePanel] = useState<'chat' | 'files' | 'editor' | 'terminal' | 'preview' | 'deploy'>(
      'chat',
    );
    const { state: mobileIdeLocalState, setActivePanel: persistMobilePanel } = useMobileIdePersistence(
      projectIdeMode ? projectId : undefined,
    );
    const setMobileIdePanel = useCallback(
      (panel: (typeof MOBILE_IDE_PANELS)[number]) => {
        setMobilePanel(panel);
        persistMobilePanel(panel);

        if (panel !== 'chat') {
          workbenchStore.setShowWorkbench(true);
        }
      },
      [persistMobilePanel],
    );
    const goToAdjacentMobilePanel = useCallback(
      (direction: 1 | -1) => {
        const currentIndex = MOBILE_IDE_PANELS.indexOf(mobilePanel);
        const nextIndex = Math.min(Math.max(currentIndex + direction, 0), MOBILE_IDE_PANELS.length - 1);
        const nextPanel = MOBILE_IDE_PANELS[nextIndex];

        if (nextPanel && nextPanel !== mobilePanel) {
          setMobileIdePanel(nextPanel);
        }
      },
      [mobilePanel, setMobileIdePanel],
    );
    const mobileSwipeHandlers = useSwipeGesture({
      onSwipeLeft: () => {
        if (useMobileIde) {
          goToAdjacentMobilePanel(1);
        }
      },
      onSwipeRight: () => {
        if (useMobileIde) {
          goToAdjacentMobilePanel(-1);
        }
      },
      threshold: 64,
      preventScroll: useMobileIde,
    });

    const [isOnline, setIsOnline] = useState(true);
    const [apiKeys, setApiKeys] = useState<Record<string, string>>(getApiKeysFromCookies());
    const [modelList, setModelList] = useState<ModelInfo[]>([]);
    const [isModelSettingsCollapsed, setIsModelSettingsCollapsed] = useState(projectIdeMode);
    const [isListening, setIsListening] = useState(false);
    const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
    const [transcript, setTranscript] = useState('');
    const [isModelLoading, setIsModelLoading] = useState<string | undefined>('all');
    const [progressAnnotations, setProgressAnnotations] = useState<ProgressAnnotation[]>([]);
    const expoUrl = useStore(expoUrlAtom);
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const projectFiles = useStore(workbenchStore.files);
    const runtimePreviews = useStore(workbenchStore.previews);
    const workspaceStatus = useStore(workbenchStore.workspaceStatus);
    const workspaceLoading = useStore(workbenchStore.workspaceLoading);
    const workspaceError = useStore(workbenchStore.workspaceError);
    const workspaceLogs = useStore(workbenchStore.workspaceLogs);
    const quotaWarning = useStore(workbenchStore.quotaWarning);
    const billingUpgradePrompt = useStore(workbenchStore.billingUpgradePrompt);
    const previewServerState = useStore(workbenchStore.previewServerState);
    const projectFilesPanelRequest = useStore(workbenchStore.projectFilesPanelRequest);
    const selectedFile = useStore(workbenchStore.selectedFile);
    const currentView = useStore(workbenchStore.currentView);
    const currentDocument = useStore(workbenchStore.currentDocument);
    const unsavedFiles = useStore(workbenchStore.unsavedFiles);
    const theme = useStore(themeStore);
    const DEFAULT_RIGHT_PANEL_WIDTH = 240;
    const MIN_RIGHT_PANEL_WIDTH = 180;
    const MAX_RIGHT_PANEL_WIDTH = 300;
    const [rightPanelOpen, setRightPanelOpen] = useState(true);
    const [rightPanelMode, setRightPanelMode] = useState<'files' | 'preview-logs'>('files');
    const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH);
    const [workspaceTabs, setWorkspaceTabs] = useState<IdeWorkspacePanel[]>(['editor']);
    const [activeWorkspacePanel, setActiveWorkspacePanel] = useState<IdeWorkspacePanel>('editor');
    const [paneTree, setPaneTree] = useState<IdePaneNode>(() => cloneDefaultPaneTree());
    const [activePaneId, setActivePaneId] = useState('pane-main');
    const [paneDropTarget, setPaneDropTarget] = useState<string | null>(null);
    const [agentWidth, setAgentWidth] = useState(420);
    const [terminalBottomOpen, setTerminalBottomOpen] = useState(false);
    const [terminalBottomHeight, setTerminalBottomHeight] = useState(240);
    const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile' | 'custom'>('desktop');
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [commandPaletteMode, setCommandPaletteMode] = useState<'all' | 'tools' | 'files'>('all');
    const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
    const [commandPaletteIndex, setCommandPaletteIndex] = useState(0);
    const [conversationHistoryOpen, setConversationHistoryOpen] = useState(false);
    const [conversationHistoryQuery, setConversationHistoryQuery] = useState('');
    const [projectAgentExecutionMode, setProjectAgentExecutionMode] = useState<ProjectAgentExecutionMode>('agent');
    const [projectPlanFirst, setProjectPlanFirst] = useState(false);
    const [projectSnapshots, setProjectSnapshots] = useState<ProjectSnapshot[]>([]);

    const [archivedProjectConversations, setArchivedProjectConversations] = useState<
      Array<{ id: string; title?: string; messages: Message[]; createdAt?: string; updatedAt?: string }>
    >([]);

    const [rollbackTarget, setRollbackTarget] = useState<ProjectConversationCheckpoint | null>(null);
    const [rollbackDatabase, setRollbackDatabase] = useState(false);
    const [rollbackBusy, setRollbackBusy] = useState(false);
    const [projectBackendState, setProjectBackendState] = useState<ProjectIdeBackendState>({});

    const [cursorPositions, setCursorPositions] = useState<
      Record<string, { line: number; column: number; offset?: number }>
    >({});

    const [scrollPositions, setScrollPositions] = useState<Record<string, number>>({});
    const [recentTabIds, setRecentTabIds] = useState<string[]>([]);
    const [closedTabs, setClosedTabs] = useState<IdePaneTab[]>([]);
    const [agentToolAction, setAgentToolAction] = useState<AgentToolAction | null>(null);
    const [projectStateReady, setProjectStateReady] = useState(!projectIdeMode || !projectId);
    const restoredProjectId = useRef<string | undefined>(undefined);
    const pendingProjectSelectedFile = useRef<string | undefined>(undefined);
    const scrollUpdateFrame = useRef<number | null>(null);
    const activeProjectPanel = searchParams.get('panel') || '';

    const activeMobileServicePanel = useMemo<IdeManagementPanel>(() => {
      return isIdeManagementPanel(activeProjectPanel) ? activeProjectPanel : 'deployments';
    }, [activeProjectPanel]);

    const firstProjectFile = useMemo(() => {
      return Object.entries(projectFiles).find(([, file]) => file?.type === 'file')?.[0];
    }, [projectFiles]);
    const projectFilePaths = useMemo(
      () => Object.keys(projectFiles).filter((filePath) => projectFiles[filePath]?.type === 'file'),
      [projectFiles],
    );

    const recentProjectFiles = useMemo(() => projectFilePaths.slice(0, 5), [projectFilePaths]);

    const backendLockedItems = useMemo(
      () =>
        Object.entries(projectFiles)
          .filter(([, file]) => file?.isLocked && !file.lockedByFolder)
          .map(([filePath, file]) => ({
            path: filePath,
            type: (file?.type === 'folder' ? 'folder' : 'file') as 'file' | 'folder',
          })),
      [projectFiles],
    );

    const backendDeletedPaths = useMemo(() => workbenchStore.getDeletedPaths(), [projectFiles]);

    const projectRuntimeState = useMemo<ProjectIdeBackendState>(() => {
      if (!runtimePreviews.length) {
        return projectBackendState;
      }

      return {
        ...projectBackendState,
        workspace: {
          ...(projectBackendState.workspace ?? {}),
          status: projectBackendState.workspace?.status ?? 'running',
        },
        ports: runtimePreviews.map((preview) => ({
          port: preview.port,
          ready: preview.ready,
          type: 'open',
          url: preview.baseUrl,
        })),
      };
    }, [projectBackendState, runtimePreviews]);
    const runtimeStatusSummary = useMemo(
      () =>
        runtimeStatusText({
          workspaceStatus,
          workspaceLoading,
          workspaceError,
        }),
      [workspaceError, workspaceLoading, workspaceStatus],
    );
    const runtimePortSummary = useMemo(
      () =>
        previewPortText({
          previews: runtimePreviews,
          workspaceLoading,
          workspaceError,
          previewServerState,
        }),
      [previewServerState, runtimePreviews, workspaceError, workspaceLoading],
    );
    const runtimeDevServerSummary = useMemo(
      () =>
        devServerStatusText({
          previews: runtimePreviews,
          workspaceLoading,
          workspaceError,
          logs: workspaceLogs,
          previewServerState,
        }),
      [previewServerState, runtimePreviews, workspaceError, workspaceLoading, workspaceLogs],
    );
    const workspaceStatusLabel = useMemo(() => {
      if (workspaceError) {
        return 'Error';
      }

      if (workspaceLoading) {
        return 'Starting';
      }

      return workspaceStatus?.status ?? 'Not started';
    }, [workspaceError, workspaceLoading, workspaceStatus]);
    const workspaceStatusTitle = useMemo(
      () =>
        [
          `Workspace: ${workspaceStatusLabel}`,
          workspaceError,
          quotaWarning,
          billingUpgradePrompt,
          workspaceLogs.length > 0 ? `${workspaceLogs.length} log lines` : undefined,
        ]
          .filter(Boolean)
          .join(' | '),
      [billingUpgradePrompt, quotaWarning, workspaceError, workspaceLogs.length, workspaceStatusLabel],
    );
    const projectConversationCheckpoints = useMemo<ProjectConversationCheckpoint[]>(() => {
      if (!projectIdeMode || !projectId) {
        return [];
      }

      const conversationSources = [
        ...archivedProjectConversations.map((conversation) => ({
          id: conversation.id,
          title: conversation.title ?? 'Project conversation',
          messages: conversation.messages,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
        })),
        {
          id: `project:${projectId}`,
          title: 'Current project conversation',
          messages: messages ?? [],
          createdAt: undefined,
          updatedAt: undefined,
        },
      ].filter((conversation) => conversation.messages.length);

      const checkpoints: ProjectConversationCheckpoint[] = [];

      let checkpointNumber = 0;

      conversationSources.forEach((conversation) => {
        let lastUserMessage: Message | undefined;

        const assistantCheckpointsBeforeConversation = checkpoints.length;

        conversation.messages.forEach((message, index) => {
          if (message.role === 'user') {
            lastUserMessage = message;
            return;
          }

          if (message.role !== 'assistant') {
            return;
          }

          checkpointNumber += 1;

          const createdAt = messageCreatedAt(message) ?? messageCreatedAt(lastUserMessage) ?? conversation.updatedAt;
          const snapshot = projectSnapshots[checkpointNumber - 1] ?? projectSnapshots[projectSnapshots.length - 1];
          const title = shortContent(lastUserMessage?.content, `Checkpoint ${checkpointNumber}`);
          const description = shortContent(message.content, 'Agent response checkpoint');

          checkpoints.push({
            id: `${conversation.id}:${message.id ?? index}`,
            title,
            description,
            messageId: message.id,
            messageIndex: index,
            conversationId: conversation.id,
            conversationTitle: conversation.title,
            createdAt,
            ageLabel: timeAgo(createdAt ?? snapshot?.createdAt ?? conversation.createdAt),
            commitSha: snapshot?.id?.slice(0, 8),
            snapshot,
            messages: conversation.messages.slice(0, index + 1),
          });
        });

        if (checkpoints.length === assistantCheckpointsBeforeConversation && conversation.messages.length) {
          const lastMessage = conversation.messages[conversation.messages.length - 1];
          const firstUserMessage = conversation.messages.find((message) => message.role === 'user');

          const createdAt =
            messageCreatedAt(lastMessage) ?? messageCreatedAt(firstUserMessage) ?? conversation.updatedAt;

          const snapshot = projectSnapshots[checkpointNumber] ?? projectSnapshots[projectSnapshots.length - 1];

          checkpoints.push({
            id: `${conversation.id}:${lastMessage.id ?? 'latest'}`,
            title: shortContent(firstUserMessage?.content ?? lastMessage.content, conversation.title),
            description:
              lastMessage.role === 'user'
                ? 'Waiting for the agent response'
                : shortContent(lastMessage.content, 'Project conversation checkpoint'),
            messageId: lastMessage.id,
            messageIndex: conversation.messages.length - 1,
            conversationId: conversation.id,
            conversationTitle: conversation.title,
            createdAt,
            ageLabel: timeAgo(createdAt ?? snapshot?.createdAt ?? conversation.createdAt),
            commitSha: snapshot?.id?.slice(0, 8),
            snapshot,
            messages: conversation.messages,
          });
        }
      });

      if (!checkpoints.length && messages?.length) {
        const sourceMessages = messages;
        const lastMessage = sourceMessages[sourceMessages.length - 1];
        const createdAt = messageCreatedAt(lastMessage);
        const snapshot = projectSnapshots[0];

        checkpoints.push({
          id: `${lastMessage.id ?? 'current'}`,
          title: shortContent(sourceMessages.find((message) => message.role === 'user')?.content, 'Current chat'),
          description: 'Current project conversation',
          messageId: lastMessage.id,
          messageIndex: sourceMessages.length - 1,
          conversationId: `project:${projectId}`,
          conversationTitle: 'Current project conversation',
          createdAt,
          ageLabel: timeAgo(createdAt ?? snapshot?.createdAt),
          commitSha: snapshot?.id?.slice(0, 8),
          snapshot,
          messages: sourceMessages,
        });
      }

      return checkpoints.reverse();
    }, [archivedProjectConversations, messages, projectId, projectIdeMode, projectSnapshots]);
    const filteredProjectConversationCheckpoints = useMemo(() => {
      const query = conversationHistoryQuery.trim().toLowerCase();

      if (!query) {
        return projectConversationCheckpoints;
      }

      return projectConversationCheckpoints.filter((checkpoint) => {
        const searchable = [
          checkpoint.title,
          checkpoint.description,
          checkpoint.conversationTitle,
          checkpoint.commitSha,
          checkpoint.ageLabel,
          ...checkpoint.messages.map((message) => message.content),
        ]
          .filter(Boolean)
          .join('\n')
          .toLowerCase();

        return searchable.includes(query);
      });
    }, [conversationHistoryQuery, projectConversationCheckpoints]);
    const projectAgentSuggestions = useMemo(
      () =>
        buildProjectAgentSuggestions({
          files: projectFiles,
          selectedFile,
          messages,
          backendState: projectBackendState,
          runtimeState: projectRuntimeState,
          workspaceLogs,
          activePanel: activeWorkspacePanel,
          chatStarted,
        }),
      [
        activeWorkspacePanel,
        chatStarted,
        messages,
        projectBackendState,
        projectFiles,
        projectRuntimeState,
        selectedFile,
        workspaceLogs,
      ],
    );
    useEffect(() => {
      setProjectStateReady(!projectIdeMode || !projectId);
      restoredProjectId.current = undefined;
      pendingProjectSelectedFile.current = undefined;
    }, [projectIdeMode, projectId]);

    useEffect(() => {
      if (!projectIdeMode || !projectId) {
        return;
      }

      try {
        setConversationHistoryQuery(localStorage.getItem(`vibecore.agentHistorySearch.${projectId}`) ?? '');
      } catch {
        setConversationHistoryQuery('');
      }
    }, [projectId, projectIdeMode]);

    useEffect(() => {
      if (!projectIdeMode || !projectId) {
        return;
      }

      try {
        const storageKey = `vibecore.agentHistorySearch.${projectId}`;

        if (conversationHistoryQuery.trim()) {
          localStorage.setItem(storageKey, conversationHistoryQuery);
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch {
        // Search persistence is best-effort and must never block the IDE.
      }
    }, [conversationHistoryQuery, projectId, projectIdeMode]);

    useEffect(() => {
      return () => {
        if (scrollUpdateFrame.current !== null) {
          window.cancelAnimationFrame(scrollUpdateFrame.current);
          scrollUpdateFrame.current = null;
        }
      };
    }, []);

    useEffect(() => {
      workbenchStore.setDocuments(projectFiles);
    }, [projectFiles]);

    useEffect(() => {
      if (!projectIdeMode || !projectId) {
        return undefined;
      }

      let cancelled = false;

      async function loadProjectBackendState() {
        try {
          const [overviewResponse, collaboratorsResponse] = await Promise.all([
            fetch(`/api/projects/${projectId}/ide-panel/overview`, { headers: { accept: 'application/json' } }),
            fetch(`/api/projects/${projectId}/ide-panel/collaborators`, { headers: { accept: 'application/json' } }),
          ]);

          const overview = (overviewResponse.ok ? await overviewResponse.json() : {}) as {
            data?: ProjectIdeBackendState;
          };
          const collaborators = (collaboratorsResponse.ok ? await collaboratorsResponse.json() : {}) as {
            data?: { collaborators?: ProjectIdeBackendState['collaborators'] };
          };

          if (!cancelled) {
            setProjectBackendState({
              ...(overview.data ?? {}),
              collaborators: collaborators.data?.collaborators ?? [],
            });
          }
        } catch (error) {
          if (!cancelled) {
            console.error('Failed to load project IDE backend state', error);
          }
        }
      }

      void loadProjectBackendState();

      const interval = window.setInterval(loadProjectBackendState, 15000);

      return () => {
        cancelled = true;
        window.clearInterval(interval);
      };
    }, [projectIdeMode, projectId]);

    useEffect(() => {
      if (!projectIdeMode || !projectId) {
        setProjectSnapshots([]);
        setArchivedProjectConversations([]);

        return undefined;
      }

      let cancelled = false;

      const safeProjectId = projectId;

      async function loadProjectHistory() {
        try {
          const [response, memory] = await Promise.all([
            fetch(`/api/projects/${safeProjectId}/ide-panel/snapshots`, {
              headers: { accept: 'application/json' },
            }),
            getProjectIdeMemory(safeProjectId).catch(() => undefined),
          ]);
          const payload = (response.ok ? await response.json() : {}) as {
            data?: { snapshots?: ProjectSnapshot[] };
          };

          if (!cancelled) {
            setProjectSnapshots([...(payload.data?.snapshots ?? [])].reverse());
            setArchivedProjectConversations(
              (memory?.chat?.conversations ?? []).filter(
                (conversation) => conversation && Array.isArray(conversation.messages),
              ),
            );
          }
        } catch (error) {
          if (!cancelled) {
            console.error('Failed to load project snapshots for conversation history', error);
          }
        }
      }

      void loadProjectHistory();

      return () => {
        cancelled = true;
      };
    }, [projectIdeMode, projectId]);

    useEffect(() => {
      if (!projectIdeMode || !projectId || restoredProjectId.current === projectId) {
        return undefined;
      }

      let cancelled = false;
      restoredProjectId.current = projectId;

      getProjectIdeMemory(projectId)
        .then((memory) => {
          if (cancelled) {
            return;
          }

          const ui = memory.ui;

          if (typeof ui?.rightPanelOpen === 'boolean') {
            setRightPanelOpen(ui.rightPanelOpen);
          }

          if (ui?.rightPanelMode === 'preview-logs') {
            setRightPanelMode('preview-logs');
          }

          if (typeof ui?.rightPanelWidth === 'number') {
            setRightPanelWidth(Math.min(MAX_RIGHT_PANEL_WIDTH, Math.max(MIN_RIGHT_PANEL_WIDTH, ui.rightPanelWidth)));
          }

          const restoredTabs = Array.isArray(ui?.workspaceTabs)
            ? ui.workspaceTabs.filter((panel: string) => isIdeWorkspacePanel(panel))
            : [];

          if (restoredTabs.length) {
            setWorkspaceTabs(restoredTabs);
          }

          if (ui?.activeWorkspacePanel && isIdeWorkspacePanel(ui.activeWorkspacePanel)) {
            setActiveWorkspacePanel(ui.activeWorkspacePanel);
          }

          if (ui?.paneTree && typeof ui.paneTree === 'object') {
            setPaneTree(normalizePaneTree(ui.paneTree));
          }

          setActivePaneId('pane-main');

          if (typeof ui?.agentWidth === 'number') {
            setAgentWidth(Math.min(640, Math.max(360, ui.agentWidth)));
          }

          if (typeof ui?.terminalBottomOpen === 'boolean') {
            setTerminalBottomOpen(ui.terminalBottomOpen);
          }

          if (typeof ui?.terminalBottomHeight === 'number') {
            setTerminalBottomHeight(Math.min(600, Math.max(100, ui.terminalBottomHeight)));
          }

          if (ui?.cursorPositions && typeof ui.cursorPositions === 'object') {
            setCursorPositions(ui.cursorPositions);
          }

          if (ui?.scrollPositions && typeof ui.scrollPositions === 'object') {
            setScrollPositions(ui.scrollPositions);
          }

          if (Array.isArray(ui?.recentTabIds)) {
            setRecentTabIds(ui.recentTabIds.filter((tabId: string) => typeof tabId === 'string'));
          }

          if (Array.isArray(ui?.closedTabs)) {
            setClosedTabs(
              ui.closedTabs.filter((tab: IdePaneTab) => tab && isIdeWorkspacePanel(tab.panel)).slice(0, 20),
            );
          }

          if (
            ui?.mobilePanel &&
            ['chat', 'files', 'editor', 'terminal', 'preview', 'deploy'].includes(ui.mobilePanel)
          ) {
            setMobilePanel(ui.mobilePanel);
          }

          if (ui?.currentView) {
            workbenchStore.currentView.set(ui.currentView as any);
          }

          if (typeof ui?.showWorkbench === 'boolean') {
            workbenchStore.setShowWorkbench(ui.showWorkbench);
          } else {
            workbenchStore.setShowWorkbench(true);
          }

          if (ui?.selectedFile) {
            if (projectFiles[ui.selectedFile]?.type === 'file') {
              workbenchStore.setSelectedFile(ui.selectedFile);
              pendingProjectSelectedFile.current = undefined;
            } else {
              pendingProjectSelectedFile.current = ui.selectedFile;
            }
          }

          if (Array.isArray(ui?.lockedItems)) {
            ui.lockedItems.forEach((item: { path?: string; type?: string }) => {
              if (!item?.path) {
                return;
              }

              if (item.type === 'folder') {
                workbenchStore.lockFolder(item.path);
              } else {
                workbenchStore.lockFile(item.path);
              }
            });
          }

          if (Array.isArray(ui?.deletedPaths)) {
            workbenchStore.setDeletedPaths(ui.deletedPaths.filter((filePath: unknown) => typeof filePath === 'string'));
          }
        })
        .catch((error) => {
          console.error('Failed to restore project IDE state', error);
        })
        .finally(() => {
          if (!cancelled) {
            setProjectStateReady(true);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [projectFiles, projectIdeMode, projectId]);

    useEffect(() => {
      const pendingSelectedFile = pendingProjectSelectedFile.current;

      if (!projectIdeMode || !pendingSelectedFile || projectFiles[pendingSelectedFile]?.type !== 'file') {
        return;
      }

      workbenchStore.setSelectedFile(pendingSelectedFile);
      pendingProjectSelectedFile.current = undefined;
    }, [projectFiles, projectIdeMode]);

    useEffect(() => {
      if (!projectIdeMode || !rightPanelOpen) {
        return;
      }

      void workbenchStore.loadRuntimeFiles('.').catch((error) => {
        console.error('Failed to refresh right files panel:', error);
      });
    }, [projectIdeMode, rightPanelOpen]);

    useEffect(() => {
      if (!projectIdeMode || !rightPanelOpen || rightPanelMode !== 'files' || projectFilePaths.length > 0) {
        return undefined;
      }

      let attempts = 0;

      const interval = window.setInterval(() => {
        attempts += 1;

        void workbenchStore.loadRuntimeFiles('.').catch((error) => {
          console.error('Failed to retry right files panel refresh:', error);
        });

        if (attempts >= 20 || Object.values(workbenchStore.files.get()).some((entry) => entry?.type === 'file')) {
          window.clearInterval(interval);
        }
      }, 1500);

      return () => window.clearInterval(interval);
    }, [projectFilePaths.length, projectIdeMode, rightPanelMode, rightPanelOpen]);

    useEffect(() => {
      if (!projectIdeMode) {
        return undefined;
      }

      const syncIconTitles = () => {
        const tooltipTargets = document.querySelectorAll<HTMLElement>(
          [
            '.bolt-responsive-ide button[aria-label]',
            '.bolt-responsive-ide [role="button"][aria-label]',
            '.bolt-responsive-ide [role="separator"][aria-label]',
            '.bolt-responsive-ide input[aria-label]',
            '.bolt-responsive-ide select[aria-label]',
          ].join(','),
        );

        tooltipTargets.forEach((target) => {
          const label = target.getAttribute('aria-label')?.trim();

          if (!label) {
            return;
          }

          const currentTitle = target.getAttribute('title');
          const autoTitle = target.getAttribute('data-vc-auto-title') === 'true';

          if (!currentTitle || autoTitle) {
            target.setAttribute('title', label);
            target.setAttribute('data-vc-auto-title', 'true');
          }
        });
      };

      syncIconTitles();

      const ideRoot = document.querySelector('.bolt-responsive-ide');
      const observer = new MutationObserver(syncIconTitles);

      if (ideRoot) {
        observer.observe(ideRoot, {
          attributes: true,
          attributeFilter: ['aria-label'],
          childList: true,
          subtree: true,
        });
      }

      return () => observer.disconnect();
    }, [projectIdeMode]);

    useEffect(() => {
      if (!projectIdeMode) {
        return undefined;
      }

      workbenchStore.projectFilesPanelOpen.set(rightPanelOpen);
      window.dispatchEvent(
        new CustomEvent('vibecore:project-files-panel-state', {
          detail: { open: rightPanelOpen },
        }),
      );

      return undefined;
    }, [projectIdeMode, rightPanelOpen]);

    useEffect(() => {
      if (!projectIdeMode || !projectFilesPanelRequest) {
        return;
      }

      setRightPanelOpen((currentOpen) => {
        const nextOpen =
          typeof projectFilesPanelRequest.open === 'boolean' ? projectFilesPanelRequest.open : !currentOpen;

        if (nextOpen) {
          setRightPanelMode('files');
        }

        if (!nextOpen) {
          setSearchParams({});
        }

        return nextOpen;
      });
    }, [projectFilesPanelRequest, projectIdeMode, setSearchParams]);

    useEffect(() => {
      if (!projectIdeMode) {
        return undefined;
      }

      const handleToggleFilesPanel = (event: Event) => {
        const requestedOpen = (event as CustomEvent<{ open?: boolean }>).detail?.open;

        setRightPanelOpen((currentOpen) => {
          const nextOpen = typeof requestedOpen === 'boolean' ? requestedOpen : !currentOpen;

          if (nextOpen) {
            setRightPanelMode('files');
          }

          if (!nextOpen) {
            setSearchParams({});
          }

          return nextOpen;
        });
      };

      window.addEventListener('vibecore:toggle-project-files-panel', handleToggleFilesPanel);

      return () => window.removeEventListener('vibecore:toggle-project-files-panel', handleToggleFilesPanel);
    }, [projectIdeMode, setSearchParams]);

    useEffect(() => {
      if (!projectIdeMode || !projectStateReady || selectedFile || !firstProjectFile) {
        return;
      }

      workbenchStore.setSelectedFile(firstProjectFile);
      workbenchStore.currentView.set('code');
      workbenchStore.setShowWorkbench(true);
    }, [firstProjectFile, projectIdeMode, projectStateReady, selectedFile]);

    useEffect(() => {
      if (!projectIdeMode || !projectId || !projectStateReady) {
        return undefined;
      }

      const saveTimer = window.setTimeout(() => {
        saveProjectIdeMemory(projectId, {
          ui: {
            selectedFile,
            currentView,
            rightPanelOpen,
            rightPanelMode,
            rightPanelWidth,
            workspaceTabs,
            activeWorkspacePanel,
            paneTree,
            activePaneId,
            agentWidth,
            terminalBottomOpen,
            terminalBottomHeight,
            cursorPositions,
            scrollPositions,
            recentTabIds,
            closedTabs,
            mobilePanel,
            lockedItems: backendLockedItems,
            deletedPaths: backendDeletedPaths,
            showWorkbench: true,
          },
        }).catch((error) => {
          console.error('Failed to persist project IDE state', error);
        });
      }, 400);

      return () => window.clearTimeout(saveTimer);
    }, [
      projectIdeMode,
      projectId,
      projectStateReady,
      selectedFile,
      currentView,
      rightPanelOpen,
      rightPanelMode,
      rightPanelWidth,
      workspaceTabs,
      activeWorkspacePanel,
      paneTree,
      activePaneId,
      agentWidth,
      terminalBottomOpen,
      terminalBottomHeight,
      cursorPositions,
      scrollPositions,
      recentTabIds,
      closedTabs,
      mobilePanel,
      backendLockedItems,
      backendDeletedPaths,
    ]);

    const openWorkspacePanel = useCallback(
      (
        panel: IdeWorkspacePanel,
        options: { replaceUrl?: boolean; paneId?: string; filePath?: string; preview?: boolean } = {},
      ) => {
        setWorkspaceTabs((currentTabs) => (currentTabs.includes(panel) ? currentTabs : [...currentTabs, panel]));
        setActiveWorkspacePanel(panel);

        const targetPaneId = options.paneId ?? activePaneId;
        setActivePaneId(targetPaneId);
        setPaneTree((currentTree) =>
          updateLeaf(currentTree, targetPaneId, (leaf) => {
            const existing = options.filePath
              ? leaf.tabs.find((tab) => tab.panel === panel && tab.filePath === options.filePath)
              : leaf.tabs.find((tab) => tab.panel === panel && !tab.filePath);
            const nextTab =
              existing ??
              makePaneTab(panel, {
                pinned: panel === 'preview',
                filePath: options.filePath,
                preview: options.preview,
              });
            const baseTabs =
              panel === 'editor' && options.preview
                ? leaf.tabs.filter((tab) => !(tab.panel === 'editor' && tab.preview))
                : leaf.tabs;
            const tabs = existing
              ? baseTabs.map((tab) =>
                  tab.id === existing.id ? { ...tab, preview: options.preview ?? tab.preview } : tab,
                )
              : [...baseTabs, nextTab];

            return { ...leaf, tabs, activeTabId: nextTab.id };
          }),
        );

        if (panel === 'editor' && options.filePath) {
          workbenchStore.setSelectedFile(options.filePath);
          workbenchStore.currentView.set('code');
          workbenchStore.setShowWorkbench(true);
        }

        if (panel === 'preview') {
          workbenchStore.currentView.set('preview');
          workbenchStore.setShowWorkbench(true);
        }

        if (panel === 'terminal') {
          workbenchStore.currentView.set('code');
          workbenchStore.setShowWorkbench(true);
          workbenchStore.toggleTerminal(true);
        }

        if (options.replaceUrl !== false) {
          setSearchParams(panel === 'editor' ? {} : { panel });
        }
      },
      [activePaneId, setSearchParams],
    );

    const openProjectFile = useCallback(
      (filePath: string, options: { paneId?: string; preview?: boolean } = {}) => {
        openWorkspacePanel('editor', {
          paneId: options.paneId,
          filePath,
          preview: options.preview,
        });
      },
      [openWorkspacePanel],
    );

    const openIdeTool = useCallback(
      (panel: IdeWorkspacePanel | IdeRightPanel, paneId = activePaneId) => {
        if (isIdeRightPanel(panel)) {
          setRightPanelMode('files');
          setRightPanelOpen(true);
          setSearchParams({ panel });

          return;
        }

        openWorkspacePanel(panel, { paneId });
      },
      [activePaneId, openWorkspacePanel, setSearchParams],
    );

    useEffect(() => {
      if (!projectIdeMode) {
        return undefined;
      }

      const handleOpenProjectIdePanel = (event: Event) => {
        const panel = (event as CustomEvent<{ panel?: string }>).detail?.panel;

        if (!panel) {
          return;
        }

        if (isIdeRightPanel(panel) || isIdeWorkspacePanel(panel)) {
          openIdeTool(panel);
        }
      };

      window.addEventListener('vibecore:open-project-ide-panel', handleOpenProjectIdePanel);

      return () => {
        window.removeEventListener('vibecore:open-project-ide-panel', handleOpenProjectIdePanel);
      };
    }, [openIdeTool, projectIdeMode]);

    const closeWorkspacePanel = useCallback(
      (panel: IdeWorkspacePanel, paneId = activePaneId, tabId?: string) => {
        setWorkspaceTabs((currentTabs) => {
          const nextTabs = currentTabs.filter((tab) => tab !== panel);
          const safeTabs: IdeWorkspacePanel[] = nextTabs.length ? nextTabs : ['editor'];

          if (activeWorkspacePanel === panel) {
            const nextActive = safeTabs[safeTabs.length - 1] ?? 'editor';
            setActiveWorkspacePanel(nextActive);
            setSearchParams(nextActive === 'editor' ? {} : { panel: nextActive });
          }

          return safeTabs;
        });
        setPaneTree((currentTree) =>
          updateLeaf(currentTree, paneId, (leaf) => {
            const targetTab = tabId
              ? leaf.tabs.find((tab) => tab.id === tabId)
              : leaf.tabs.find((tab) => tab.panel === panel);

            if (!targetTab || targetTab.pinned) {
              return leaf;
            }

            const tabs = leaf.tabs.filter((tab) => tab.id !== targetTab.id);

            return {
              ...leaf,
              tabs,
              activeTabId: leaf.activeTabId === targetTab.id ? tabs[tabs.length - 1]?.id : leaf.activeTabId,
            };
          }),
        );
      },
      [activeWorkspacePanel, setSearchParams],
    );

    useEffect(() => {
      if (!projectIdeMode || !projectStateReady) {
        return;
      }

      if (isIdeRightPanel(activeProjectPanel)) {
        setRightPanelOpen(true);

        return;
      }

      if (isIdeWorkspacePanel(activeProjectPanel)) {
        openWorkspacePanel(activeProjectPanel, { replaceUrl: false });

        if (useMobileIde) {
          if (activeProjectPanel === 'terminal' || activeProjectPanel === 'logs') {
            setMobileIdePanel('terminal');
          } else if (activeProjectPanel === 'preview') {
            setMobileIdePanel('preview');
          } else if (activeProjectPanel === 'files') {
            setMobileIdePanel('files');
          } else if (activeProjectPanel === 'editor') {
            setMobileIdePanel('editor');
          } else if (isIdeManagementPanel(activeProjectPanel)) {
            setMobileIdePanel('deploy');
          }
        }
      }
    }, [activeProjectPanel, openWorkspacePanel, projectIdeMode, projectStateReady, setMobileIdePanel, useMobileIde]);

    const onProjectEditorSave = useCallback(() => {
      workbenchStore.saveCurrentDocument().catch(() => undefined);
    }, []);

    const startAgentResize = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();

        const startX = event.clientX;
        const startWidth = agentWidth;

        const onMove = (moveEvent: MouseEvent) => {
          const nextWidth = Math.min(640, Math.max(360, startWidth + moveEvent.clientX - startX));
          setAgentWidth(nextWidth);
        };

        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      },
      [agentWidth],
    );

    const startTerminalResize = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();

        const startY = event.clientY;
        const startHeight = terminalBottomHeight;

        const onMove = (moveEvent: MouseEvent) => {
          const nextHeight = Math.min(600, Math.max(100, startHeight + startY - moveEvent.clientY));
          setTerminalBottomHeight(nextHeight);
        };

        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      },
      [terminalBottomHeight],
    );

    const startRightPanelResize = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();

        const startX = event.clientX;
        const startWidth = rightPanelWidth;

        const onMove = (moveEvent: MouseEvent) => {
          const nextWidth = Math.min(
            MAX_RIGHT_PANEL_WIDTH,
            Math.max(MIN_RIGHT_PANEL_WIDTH, startWidth + startX - moveEvent.clientX),
          );
          setRightPanelWidth(nextWidth);
        };

        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      },
      [rightPanelWidth],
    );

    useEffect(() => {
      if (!projectIdeMode || useMobileIde) {
        return undefined;
      }

      const onKeyDown = (event: KeyboardEvent) => {
        const command = event.metaKey || event.ctrlKey;

        if (!command) {
          return;
        }

        const key = event.key.toLowerCase();

        if (event.shiftKey && key === 't') {
          event.preventDefault();

          const [tab, ...rest] = closedTabs;

          if (tab) {
            const reopenedId = `${tab.id}-reopen-${Date.now()}`;
            setClosedTabs(rest);
            setPaneTree((currentTree) =>
              updateLeaf(currentTree, activePaneId, (leaf) => ({
                ...leaf,
                tabs: [...leaf.tabs, { ...tab, id: reopenedId }],
                activeTabId: reopenedId,
              })),
            );
            setActiveWorkspacePanel(tab.panel);
            setRecentTabIds((ids) => [reopenedId, ...ids.filter((id) => id !== reopenedId)].slice(0, 20));

            if (tab.filePath) {
              workbenchStore.setSelectedFile(tab.filePath);
            }
          }
        } else if (key === 'k' || (event.shiftKey && key === 'p')) {
          event.preventDefault();
          setCommandPaletteMode('all');
          setCommandPaletteQuery('');
          setCommandPaletteIndex(0);
          setCommandPaletteOpen(true);
        } else if (key === 't') {
          event.preventDefault();
          setCommandPaletteMode('tools');
          setCommandPaletteQuery('');
          setCommandPaletteIndex(0);
          setCommandPaletteOpen(true);
        } else if (key === 'p') {
          event.preventDefault();
          setCommandPaletteMode('files');
          setCommandPaletteQuery('');
          setCommandPaletteIndex(0);
          setCommandPaletteOpen(true);
        } else if (key === 'w') {
          event.preventDefault();

          const leaf = findLeaf(paneTree, activePaneId) ?? findFirstLeaf(paneTree);
          const tab = leaf?.tabs.find((item) => item.id === leaf.activeTabId);

          if (leaf && tab) {
            setClosedTabs((items) => [tab, ...items.filter((item) => item.id !== tab.id)].slice(0, 20));
            closeWorkspacePanel(tab.panel, leaf.id, tab.id);
          }
        } else if (key === 'j') {
          event.preventDefault();
          setTerminalBottomOpen((value) => !value);
        } else if (key === '`') {
          event.preventDefault();
          setTerminalBottomOpen(true);
        } else if (key === 'b') {
          event.preventDefault();
          textareaRef?.current?.focus();
          setAgentWidth((width) => Math.min(640, Math.max(420, width)));
        } else if (key === ',') {
          event.preventDefault();
          openWorkspacePanel('settings');
        } else if (key === 's') {
          event.preventDefault();
          onProjectEditorSave();
        } else if (/^[1-9]$/.test(key)) {
          event.preventDefault();

          const leaf = findLeaf(paneTree, activePaneId) ?? findFirstLeaf(paneTree);
          const tab = leaf?.tabs[Number(key) - 1];

          if (leaf && tab) {
            setPaneTree((currentTree) =>
              updateLeaf(currentTree, leaf.id, (currentLeaf) => ({ ...currentLeaf, activeTabId: tab.id })),
            );
            setActivePaneId(leaf.id);
            setActiveWorkspacePanel(tab.panel);
            setRecentTabIds((ids) => [tab.id, ...ids.filter((id) => id !== tab.id)].slice(0, 20));
          }
        } else if (key === 'tab') {
          event.preventDefault();

          const tabs = flattenTabs(paneTree);
          const currentIndex = tabs.findIndex((tab) => tab.id === recentTabIds[0]);
          const nextTab = tabs[(currentIndex + 1) % Math.max(tabs.length, 1)];

          if (nextTab) {
            const nextLeaf = findLeafContainingTab(paneTree, nextTab.id);

            if (nextLeaf) {
              setPaneTree((currentTree) =>
                updateLeaf(currentTree, nextLeaf.id, (leaf) => ({ ...leaf, activeTabId: nextTab.id })),
              );
              setActivePaneId(nextLeaf.id);
              setActiveWorkspacePanel(nextTab.panel);
              setRecentTabIds((ids) => [nextTab.id, ...ids.filter((id) => id !== nextTab.id)].slice(0, 20));
            }
          }
        }
      };

      window.addEventListener('keydown', onKeyDown);

      return () => window.removeEventListener('keydown', onKeyDown);
    }, [
      activePaneId,
      closedTabs,
      closeWorkspacePanel,
      onProjectEditorSave,
      openWorkspacePanel,
      paneTree,
      projectIdeMode,
      recentTabIds,
      useMobileIde,
    ]);

    useEffect(() => {
      if (expoUrl) {
        setQrModalOpen(true);
      }
    }, [expoUrl]);

    useEffect(() => {
      if (data) {
        const progressList = data.filter(
          (x) => typeof x === 'object' && (x as any).type === 'progress',
        ) as ProgressAnnotation[];
        setProgressAnnotations(progressList);
      }
    }, [data]);
    useEffect(() => {
      console.log(transcript);
    }, [transcript]);

    useEffect(() => {
      onStreamingChange?.(isStreaming);
    }, [isStreaming, onStreamingChange]);

    useEffect(() => {
      if (
        !projectIdeMode ||
        !useMobileIde ||
        !mobileIdeLocalState.activePanel ||
        !MOBILE_IDE_PANELS.includes(mobileIdeLocalState.activePanel as any)
      ) {
        return;
      }

      setMobilePanel(mobileIdeLocalState.activePanel as (typeof MOBILE_IDE_PANELS)[number]);
    }, [mobileIdeLocalState.activePanel, projectIdeMode, useMobileIde]);

    useEffect(() => {
      const updateOnlineState = () => setIsOnline(navigator.onLine);
      updateOnlineState();
      window.addEventListener('online', updateOnlineState);
      window.addEventListener('offline', updateOnlineState);

      return () => {
        window.removeEventListener('online', updateOnlineState);
        window.removeEventListener('offline', updateOnlineState);
      };
    }, []);

    useEffect(() => {
      if (!useMobileIde) {
        return undefined;
      }

      const onKeyDown = (event: KeyboardEvent) => {
        const index = Number(event.key) - 1;

        if ((event.metaKey || event.ctrlKey) && index >= 0 && index < MOBILE_IDE_PANELS.length) {
          event.preventDefault();
          setMobileIdePanel(MOBILE_IDE_PANELS[index]);
        }
      };

      window.addEventListener('keydown', onKeyDown);

      return () => window.removeEventListener('keydown', onKeyDown);
    }, [setMobileIdePanel, useMobileIde]);

    useEffect(() => {
      if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((result) => result[0])
            .map((result) => result.transcript)
            .join('');

          setTranscript(transcript);

          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: transcript },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };

        setRecognition(recognition);
      }
    }, []);

    useEffect(() => {
      if (typeof window !== 'undefined') {
        let parsedApiKeys: Record<string, string> | undefined = {};

        try {
          parsedApiKeys = getApiKeysFromCookies();
          setApiKeys(parsedApiKeys);
        } catch (error) {
          console.error('Error loading API keys from cookies:', error);
          Cookies.remove('apiKeys');
        }

        setIsModelLoading('all');
        fetch('/api/models')
          .then((response) => response.json())
          .then((data) => {
            const typedData = data as { modelList: ModelInfo[] };
            setModelList(typedData.modelList);
          })
          .catch((error) => {
            console.error('Error fetching model list:', error);
          })
          .finally(() => {
            setIsModelLoading(undefined);
          });
      }
    }, [providerList, provider]);

    const onApiKeysChange = async (providerName: string, apiKey: string) => {
      const newApiKeys = { ...apiKeys, [providerName]: apiKey };
      setApiKeys(newApiKeys);
      Cookies.set('apiKeys', JSON.stringify(newApiKeys));

      setIsModelLoading(providerName);

      let providerModels: ModelInfo[] = [];

      try {
        const response = await fetch(`/api/models/${encodeURIComponent(providerName)}`);
        const data = await response.json();
        providerModels = (data as { modelList: ModelInfo[] }).modelList;
      } catch (error) {
        console.error('Error loading dynamic models for:', providerName, error);
      }

      // Only update models for the specific provider
      setModelList((prevModels) => {
        const otherModels = prevModels.filter((model) => model.provider !== providerName);
        return [...otherModels, ...providerModels];
      });
      setIsModelLoading(undefined);
    };

    const startListening = () => {
      if (recognition) {
        recognition.start();
        setIsListening(true);
      }
    };

    const stopListening = () => {
      if (recognition) {
        recognition.stop();
        setIsListening(false);
      }
    };

    const handleSendMessage = (event: React.UIEvent, messageInput?: string) => {
      if (sendMessage) {
        sendMessage(event, messageInput);
        setSelectedElement?.(null);

        if (recognition) {
          recognition.abort(); // Stop current recognition
          setTranscript(''); // Clear transcript
          setIsListening(false);

          // Clear the input by triggering handleInputChange with empty value
          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: '' },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        }
      }
    };

    const handleFileUpload = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];

        if (file) {
          const reader = new FileReader();

          reader.onload = (e) => {
            const base64Image = e.target?.result as string;
            setUploadedFiles?.([...uploadedFiles, file]);
            setImageDataList?.([...imageDataList, base64Image]);
          };
          reader.readAsDataURL(file);
        }
      };

      input.click();
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;

      if (!items) {
        return;
      }

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();

          const file = item.getAsFile();

          if (file) {
            const reader = new FileReader();

            reader.onload = (e) => {
              const base64Image = e.target?.result as string;
              setUploadedFiles?.([...uploadedFiles, file]);
              setImageDataList?.([...imageDataList, base64Image]);
            };
            reader.readAsDataURL(file);
          }

          break;
        }
      }
    };

    const handleProjectAgentSendMessage = useCallback(
      (event: React.UIEvent, messageInput?: string) => {
        const rawMessage = messageInput ?? input;

        if (projectIdeMode) {
          const action = inferAgentToolAction(rawMessage);

          if (action) {
            setAgentToolAction(action);
          }

          const mentionedFiles = resolveMentionedProjectFiles(rawMessage, projectFilePaths);

          const agentMessage = buildProjectAgentPrompt({
            message: rawMessage,
            mode: projectAgentExecutionMode,
            planFirst: projectPlanFirst,
            mentionedFiles,
          });

          handleSendMessage?.(event, agentMessage);

          return;
        }

        handleSendMessage?.(event, messageInput);
      },
      [handleSendMessage, input, projectAgentExecutionMode, projectFilePaths, projectIdeMode, projectPlanFirst],
    );

    const viewProjectCheckpoint = useCallback(
      async (checkpoint: ProjectConversationCheckpoint) => {
        setConversationHistoryOpen(false);

        if (projectId && checkpoint.conversationId !== `project:${projectId}`) {
          await saveProjectIdeMemory(projectId, {
            chat: {
              id: `project:${projectId}`,
              description: checkpoint.conversationTitle,
              messages: checkpoint.messages,
              archivedMessages: [],
            },
          }).catch((error) => console.error('Failed to load archived project conversation', error));
          window.location.hash = checkpoint.messageId ? `chat-message-${checkpoint.messageId}` : '';
          window.location.reload();

          return;
        }

        window.requestAnimationFrame(() => {
          const element = checkpoint.messageId
            ? document.getElementById(`chat-message-${checkpoint.messageId}`)
            : undefined;

          element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          element?.classList.add('bolt-project-chat-jump-highlight');
          window.setTimeout(() => element?.classList.remove('bolt-project-chat-jump-highlight'), 1600);
        });
      },
      [projectId],
    );

    const openCheckpointChanges = useCallback(
      (checkpoint: ProjectConversationCheckpoint) => {
        setConversationHistoryOpen(false);
        openWorkspacePanel('git');
        setSearchParams({
          panel: 'git',
          commit: checkpoint.commitSha ?? checkpoint.snapshot?.id ?? checkpoint.id,
        });
      },
      [openWorkspacePanel, setSearchParams],
    );

    const confirmProjectRollback = useCallback(async () => {
      if (!projectId || !rollbackTarget) {
        return;
      }

      setRollbackBusy(true);

      try {
        if (rollbackTarget.snapshot?.id) {
          const form = new FormData();
          form.set('intent', 'restore');
          form.set('snapshotId', rollbackTarget.snapshot.id);
          form.set('restoreDatabase', rollbackDatabase ? 'true' : 'false');

          await fetch(`/api/projects/${projectId}/ide-panel/snapshots`, {
            method: 'POST',
            body: form,
            credentials: 'include',
          });
        }

        await saveProjectIdeMemory(projectId, {
          chat: {
            id: `project:${projectId}`,
            description: rollbackTarget.title,
            messages: rollbackTarget.messages,
            archivedMessages: [],
          },
        });

        window.location.reload();
      } catch (error) {
        console.error('Failed to rollback project checkpoint', error);
      } finally {
        setRollbackBusy(false);
      }
    }, [projectId, rollbackDatabase, rollbackTarget]);

    const agentPanel = (
      <div
        data-testid="ide-agent-panel"
        aria-live={projectIdeMode ? 'polite' : undefined}
        className={classNames(styles.Chat, 'flex h-full min-h-0 flex-col flex-grow', {
          'lg:min-w-[var(--chat-min-width)]': !projectIdeMode,
          'min-w-0 overflow-hidden bolt-project-agent-panel': projectIdeMode,
          hidden: useMobileIde && mobilePanel !== 'chat',
        })}
      >
        {!chatStarted && (
          <div id="intro" className="mt-[16vh] max-w-2xl mx-auto text-center px-4 lg:px-0">
            <h1 className="text-3xl lg:text-6xl font-bold text-bolt-elements-textPrimary mb-4 animate-fade-in">
              Where ideas begin
            </h1>
            <p className="text-md lg:text-xl mb-8 text-bolt-elements-textSecondary animate-fade-in animation-delay-200">
              Bring ideas to life in seconds or get help on existing projects.
            </p>
          </div>
        )}
        <StickToBottom
          className={classNames('pt-6 px-2 sm:px-6 relative', {
            'h-full flex flex-col modern-scrollbar': chatStarted,
          })}
          resize="smooth"
          initial="smooth"
        >
          <StickToBottom.Content
            className="flex flex-col gap-4 relative "
            role={projectIdeMode ? 'log' : undefined}
            aria-live={projectIdeMode ? 'polite' : undefined}
            aria-relevant={projectIdeMode ? 'additions text' : undefined}
            aria-label={projectIdeMode ? 'Agent conversation history' : undefined}
          >
            <ClientOnly>
              {() => {
                return chatStarted ? (
                  <Messages
                    className="flex flex-col w-full flex-1 max-w-chat pb-4 mx-auto z-1"
                    messages={messages}
                    isStreaming={isStreaming}
                    append={append}
                    chatMode={chatMode}
                    setChatMode={setChatMode}
                    provider={provider}
                    model={model}
                    projectIdeMode={projectIdeMode}
                    addToolResult={addToolResult}
                  />
                ) : null;
              }}
            </ClientOnly>
            <ScrollToBottom />
          </StickToBottom.Content>
          <div
            className={classNames('my-auto flex flex-col gap-2 w-full max-w-chat mx-auto z-prompt mb-6', {
              'sticky bottom-2': chatStarted,
            })}
          >
            <div className="flex flex-col gap-2">
              {deployAlert && (
                <DeployChatAlert
                  alert={deployAlert}
                  clearAlert={() => clearDeployAlert?.()}
                  postMessage={(message: string | undefined) => {
                    sendMessage?.({} as any, message);
                    clearSupabaseAlert?.();
                  }}
                />
              )}
              {supabaseAlert && (
                <SupabaseChatAlert
                  alert={supabaseAlert}
                  clearAlert={() => clearSupabaseAlert?.()}
                  postMessage={(message) => {
                    sendMessage?.({} as any, message);
                    clearSupabaseAlert?.();
                  }}
                />
              )}
              {actionAlert && (
                <ChatAlert
                  alert={actionAlert}
                  clearAlert={() => clearAlert?.()}
                  postMessage={(message) => {
                    sendMessage?.({} as any, message);
                    clearAlert?.();
                  }}
                />
              )}
              {llmErrorAlert && <LlmErrorAlert alert={llmErrorAlert} clearAlert={() => clearLlmErrorAlert?.()} />}
            </div>
            {progressAnnotations && <ProgressCompilation data={progressAnnotations} />}
            {projectIdeMode && isStreaming && (
              <div className="vc-sr-only" role="status" aria-live="polite">
                Agent is thinking
              </div>
            )}
            {projectIdeMode && agentToolAction && (
              <div className="bolt-project-agent-action-card" role="region" aria-label={agentToolAction.title}>
                <div>
                  <span className={agentToolAction.icon} aria-hidden />
                  <span>
                    <strong>{agentToolAction.title}</strong>
                    <small>{agentToolAction.description}</small>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    openIdeTool(agentToolAction.panel);
                    setAgentToolAction(null);
                  }}
                >
                  Open →
                </button>
              </div>
            )}
            {projectIdeMode && projectPlanFirst && (
              <div
                className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs text-bolt-elements-textSecondary"
                role="status"
              >
                <strong className="text-bolt-elements-textPrimary">Plan first enabled.</strong> The agent must return a
                reviewable plan and wait for approval before applying changes or running commands.
              </div>
            )}
            {projectIdeMode && (
              <div className="bolt-project-agent-suggestions" aria-label="Agent suggestions">
                {projectAgentSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    title={`${suggestion.label}: ${suggestion.reason}`}
                    aria-label={`${suggestion.label}. ${suggestion.reason}`}
                    onClick={(event) => handleProjectAgentSendMessage(event, suggestion.prompt)}
                    disabled={isStreaming}
                  >
                    <span className={suggestion.icon} aria-hidden />
                    <span>{suggestion.label}</span>
                  </button>
                ))}
              </div>
            )}
            <ChatBox
              isModelSettingsCollapsed={isModelSettingsCollapsed}
              setIsModelSettingsCollapsed={setIsModelSettingsCollapsed}
              provider={provider}
              setProvider={setProvider}
              providerList={providerList || (PROVIDER_LIST as ProviderInfo[])}
              model={model}
              setModel={setModel}
              modelList={modelList}
              apiKeys={apiKeys}
              isModelLoading={isModelLoading}
              onApiKeysChange={onApiKeysChange}
              uploadedFiles={uploadedFiles}
              setUploadedFiles={setUploadedFiles}
              imageDataList={imageDataList}
              setImageDataList={setImageDataList}
              textareaRef={textareaRef}
              input={input}
              handleInputChange={handleInputChange}
              handlePaste={handlePaste}
              TEXTAREA_MIN_HEIGHT={TEXTAREA_MIN_HEIGHT}
              TEXTAREA_MAX_HEIGHT={TEXTAREA_MAX_HEIGHT}
              isStreaming={isStreaming}
              handleStop={handleStop}
              handleSendMessage={projectIdeMode ? handleProjectAgentSendMessage : handleSendMessage}
              enhancingPrompt={enhancingPrompt}
              enhancePrompt={enhancePrompt}
              isListening={isListening}
              startListening={startListening}
              stopListening={stopListening}
              chatStarted={chatStarted}
              exportChat={exportChat}
              qrModalOpen={qrModalOpen}
              setQrModalOpen={setQrModalOpen}
              handleFileUpload={handleFileUpload}
              chatMode={chatMode}
              setChatMode={setChatMode}
              designScheme={designScheme}
              setDesignScheme={setDesignScheme}
              selectedElement={selectedElement}
              setSelectedElement={setSelectedElement}
              onWebSearchResult={onWebSearchResult}
              projectIdeMode={projectIdeMode}
              placeholder={projectIdeMode ? 'Describe what you want to build...' : undefined}
            />
          </div>
        </StickToBottom>
        <div className="flex flex-col justify-center">
          {!chatStarted && (
            <div className="flex justify-center gap-2">
              {ImportButtons(importChat)}
              <GitCloneButton importChat={importChat} />
            </div>
          )}
          <div className="flex flex-col gap-5">
            {!chatStarted &&
              ExamplePrompts((event, messageInput) => {
                if (isStreaming) {
                  handleStop?.();
                  return;
                }

                handleSendMessage?.(event, messageInput);
              })}
            {!chatStarted && <StarterTemplates />}
          </div>
        </div>
      </div>
    );

    const selectPaneTab = useCallback(
      (paneId: string, tabId: string, panel: IdeWorkspacePanel) => {
        const selectedTab = findLeaf(paneTree, paneId)?.tabs.find((tab) => tab.id === tabId);
        setPaneTree((currentTree) => updateLeaf(currentTree, paneId, (leaf) => ({ ...leaf, activeTabId: tabId })));
        setActivePaneId(paneId);
        setActiveWorkspacePanel(panel);
        setRecentTabIds((ids) => [tabId, ...ids.filter((id) => id !== tabId)].slice(0, 20));
        setSearchParams(panel === 'editor' ? {} : { panel });

        if (panel === 'editor' && selectedTab?.filePath) {
          workbenchStore.setSelectedFile(selectedTab.filePath);
          workbenchStore.currentView.set('code');
          workbenchStore.setShowWorkbench(true);
        }

        if (panel === 'preview') {
          workbenchStore.currentView.set('preview');
          workbenchStore.setShowWorkbench(true);
        }

        if (panel === 'terminal') {
          workbenchStore.currentView.set('code');
          workbenchStore.setShowWorkbench(true);
          workbenchStore.toggleTerminal(true);
        }
      },
      [paneTree, setSearchParams],
    );

    const closePaneTabs = useCallback((paneId: string, mode: 'all' | 'others' | 'right', tabId?: string) => {
      setPaneTree((currentTree) =>
        updateLeaf(currentTree, paneId, (leaf) => {
          const targetIndex = tabId ? leaf.tabs.findIndex((tab) => tab.id === tabId) : -1;

          const tabs = leaf.tabs.filter((tab, index) => {
            if (tab.pinned) {
              return true;
            }

            if (mode === 'all') {
              return false;
            }

            if (mode === 'others') {
              return tab.id === tabId;
            }

            return targetIndex < 0 || index <= targetIndex;
          });

          const safeTabs = tabs;
          const activeTabId = safeTabs.some((tab) => tab.id === leaf.activeTabId) ? leaf.activeTabId : safeTabs[0]?.id;

          return { ...leaf, tabs: safeTabs, activeTabId };
        }),
      );
    }, []);

    const splitPaneRight = useCallback((paneId: string, tabId?: string) => {
      let nextActivePaneId: string | undefined;

      setPaneTree((currentTree) =>
        updateLeaf(currentTree, paneId, (leaf) => {
          const targetTab =
            leaf.tabs.find((tab) => tab.id === tabId) ??
            leaf.tabs.find((tab) => tab.id === leaf.activeTabId) ??
            leaf.tabs[leaf.tabs.length - 1];

          if (!targetTab || leaf.tabs.length < 2) {
            return leaf;
          }

          const remainingTabs = leaf.tabs.filter((tab) => tab.id !== targetTab.id);
          const nextPaneId = `pane-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          nextActivePaneId = nextPaneId;

          return {
            type: 'split',
            id: `split-${leaf.id}-${nextPaneId}`,
            direction: 'horizontal',
            first: {
              ...leaf,
              tabs: remainingTabs,
              activeTabId: remainingTabs.some((tab) => tab.id === leaf.activeTabId)
                ? leaf.activeTabId
                : remainingTabs[remainingTabs.length - 1]?.id,
            },
            second: {
              type: 'leaf',
              id: nextPaneId,
              tabs: [targetTab],
              activeTabId: targetTab.id,
            },
          };
        }),
      );

      if (nextActivePaneId) {
        setActivePaneId(nextActivePaneId);
      }
    }, []);

    const swapPaneTabs = useCallback(
      (sourcePaneId: string, sourceTabId: string, targetPaneId: string, targetTabId?: string) => {
        if (sourcePaneId === targetPaneId) {
          return;
        }

        const sourceLeaf = findLeaf(paneTree, sourcePaneId);
        const targetLeaf = findLeaf(paneTree, targetPaneId);
        const sourceTab = sourceLeaf?.tabs.find((tab) => tab.id === sourceTabId);

        const targetTab =
          targetLeaf?.tabs.find((tab) => tab.id === targetTabId) ??
          targetLeaf?.tabs.find((tab) => tab.id === targetLeaf.activeTabId) ??
          targetLeaf?.tabs[0];

        if (!sourceLeaf || !targetLeaf || !sourceTab || !targetTab) {
          return;
        }

        setPaneTree((currentTree) => {
          const withTargetInSource = updateLeaf(currentTree, sourcePaneId, (leaf) => ({
            ...leaf,
            tabs: leaf.tabs.map((tab) => (tab.id === sourceTab.id ? targetTab : tab)),
            activeTabId: targetTab.id,
          }));

          return updateLeaf(withTargetInSource, targetPaneId, (leaf) => ({
            ...leaf,
            tabs: leaf.tabs.map((tab) => (tab.id === targetTab.id ? sourceTab : tab)),
            activeTabId: sourceTab.id,
          }));
        });

        setActivePaneId(targetPaneId);
        setActiveWorkspacePanel(sourceTab.panel);
        setRecentTabIds((ids) => [sourceTab.id, ...ids.filter((id) => id !== sourceTab.id)].slice(0, 20));
        setSearchParams(sourceTab.panel === 'editor' ? {} : { panel: sourceTab.panel });
      },
      [paneTree, setSearchParams],
    );

    const clearPaneDropTarget = useCallback(() => setPaneDropTarget(null), []);

    const renderPaneContent = useCallback(
      (panel: IdeWorkspacePanel) => {
        if (panel === 'editor') {
          return (
            <div
              className="bolt-project-editor-tool min-h-0 flex-1 overflow-hidden"
              data-testid="responsive-code-editor"
            >
              <div className="bolt-project-editor-toolbar">
                <span>{currentDocument?.filePath?.replace(WORK_DIR, '') || 'No file selected'}</span>
                <button type="button" onClick={() => workbenchStore.resetCurrentDocument()} disabled={!currentDocument}>
                  Format
                </button>
                <button type="button" onClick={onProjectEditorSave} disabled={!currentDocument}>
                  Save
                </button>
              </div>
              {currentDocument && !currentDocument.isBinary ? (
                <EditorAdapter
                  className="bolt-project-editor-adapter"
                  value={currentDocument.value}
                  filePath={currentDocument.filePath}
                  theme={theme === 'dark' ? 'dark' : 'light'}
                  onSave={onProjectEditorSave}
                  onChange={(update) => {
                    workbenchStore.setCurrentDocumentContent(update.value);

                    const filePath = currentDocument.filePath;

                    let line = 1;
                    let lastLineStart = 0;

                    for (let index = 0; index < update.value.length; index += 1) {
                      if (update.value.charCodeAt(index) === 10) {
                        line += 1;
                        lastLineStart = index + 1;
                      }
                    }

                    setCursorPositions((positions) => ({
                      ...positions,
                      [filePath]: {
                        line,
                        column: update.value.length - lastLineStart,
                        offset: update.value.length,
                      },
                    }));
                  }}
                />
              ) : (
                <ProjectWelcomeState
                  files={recentProjectFiles}
                  onOpenTool={openIdeTool}
                  onOpenFile={(filePath) => openProjectFile(filePath, { preview: false })}
                />
              )}
            </div>
          );
        }

        if (panel === 'files') {
          return (
            <ProjectFilesTool
              files={projectFiles}
              selectedFile={selectedFile}
              unsavedFiles={unsavedFiles}
              onFilePreview={(filePath) => openProjectFile(filePath, { preview: true })}
              onFileOpen={(filePath) => openProjectFile(filePath, { preview: false })}
            />
          );
        }

        if (panel === 'search') {
          return <Search />;
        }

        if (panel === 'locks') {
          return <LockManager />;
        }

        if (panel === 'preview') {
          return (
            <div className="bolt-project-webview-tool">
              <div className="bolt-project-webview-frame" data-preview-device={previewDevice}>
                <div className="bolt-project-webview-viewport">
                  <Preview
                    setSelectedElement={setSelectedElement}
                    projectId={projectId}
                    previewDevice={previewDevice}
                    onPreviewDeviceChange={setPreviewDevice}
                    onOpenLogsRight={() => {
                      setRightPanelMode('preview-logs');
                      setRightPanelOpen(true);
                      setTerminalBottomOpen(false);
                    }}
                  />
                </div>
              </div>
            </div>
          );
        }

        if (panel === 'terminal') {
          return <ProjectTerminalPanel projectId={projectId} />;
        }

        return <ProjectIdeServicePanel projectId={projectId} panel={panel} />;
      },
      [
        currentDocument,
        onProjectEditorSave,
        openIdeTool,
        openProjectFile,
        previewDevice,
        projectFiles,
        projectId,
        recentProjectFiles,
        selectedFile,
        setSelectedElement,
        theme,
        unsavedFiles,
      ],
    );

    const renderPaneLeaf = useCallback(
      (leaf: IdePaneLeaf) => {
        const activeTab = leaf.tabs.find((tab) => tab.id === leaf.activeTabId) ?? leaf.tabs[0];

        const canAcceptPaneDrop = (event: React.DragEvent) =>
          Array.from(event.dataTransfer.types).includes('application/x-vibecore-tab-id');
        const activatePaneDrop = (event: React.DragEvent) => {
          if (!canAcceptPaneDrop(event)) {
            return;
          }

          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';

          if (paneDropTarget !== leaf.id) {
            setPaneDropTarget(leaf.id);
          }
        };

        return (
          <div
            key={leaf.id}
            className="bolt-project-pane-leaf"
            data-pane-id={leaf.id}
            data-active={activePaneId === leaf.id}
            data-drop-target={paneDropTarget === leaf.id ? 'true' : undefined}
            onMouseDown={() => setActivePaneId(leaf.id)}
            onDragEnter={activatePaneDrop}
            onDragOver={activatePaneDrop}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setPaneDropTarget((target) => (target === leaf.id ? null : target));
              }
            }}
            onDrop={(event) => {
              const sourcePaneId = event.dataTransfer.getData('application/x-vibecore-pane-id');
              const sourceTabId = event.dataTransfer.getData('application/x-vibecore-tab-id');

              if (sourcePaneId && sourceTabId && sourcePaneId !== leaf.id) {
                event.preventDefault();
                event.stopPropagation();
                swapPaneTabs(sourcePaneId, sourceTabId, leaf.id, activeTab?.id);
              }

              setPaneDropTarget(null);
            }}
          >
            <IdeTabBar
              activePanel={activeTab?.panel ?? 'editor'}
              activeTabId={activeTab?.id}
              tabs={leaf.tabs.map((tab) => ({
                ...tab,
                label:
                  tab.panel === 'editor'
                    ? tab.filePath?.replace(WORK_DIR, '') ||
                      currentDocument?.filePath?.replace(WORK_DIR, '') ||
                      'Editor'
                    : panelTitle(tab.panel),
                icon: tab.panel === 'editor' ? 'i-ph:code' : panelIcon(tab.panel),
                preview: tab.preview,
                dirty:
                  tab.panel === 'editor' &&
                  !!currentDocument &&
                  !!(tab.filePath ?? currentDocument.filePath) &&
                  unsavedFiles instanceof Set &&
                  unsavedFiles.has(tab.filePath ?? currentDocument.filePath),
                onSave: tab.panel === 'editor' ? onProjectEditorSave : undefined,
                closable: !tab.pinned,
              }))}
              onSelect={(tabId, panel) => selectPaneTab(leaf.id, tabId, panel)}
              onClose={(tabId, panel) => {
                const tab = leaf.tabs.find((item) => item.id === tabId);

                if (tab) {
                  setClosedTabs((items) => [tab, ...items.filter((item) => item.id !== tab.id)].slice(0, 20));
                }

                closeWorkspacePanel(panel, leaf.id, tabId);
              }}
              onOpenTool={(panel) => openIdeTool(panel, leaf.id)}
              onCloseOthers={(tabId) => closePaneTabs(leaf.id, 'others', tabId)}
              onCloseToRight={(tabId) => closePaneTabs(leaf.id, 'right', tabId)}
              onCloseAll={() => closePaneTabs(leaf.id, 'all')}
              onSplitActiveRight={(tabId) => splitPaneRight(leaf.id, tabId)}
              onSwapTab={(sourcePaneId, sourceTabId, targetTabId) =>
                swapPaneTabs(sourcePaneId, sourceTabId, leaf.id, targetTabId)
              }
              onDragEnd={clearPaneDropTarget}
              recentFiles={recentProjectFiles}
              onOpenFile={(filePath, preview) => openProjectFile(filePath, { paneId: leaf.id, preview })}
            />
            <div
              className="bolt-project-pane-content"
              data-pane-id={leaf.id}
              ref={(element) => {
                if (element && scrollPositions[leaf.id] && element.scrollTop !== scrollPositions[leaf.id]) {
                  element.scrollTop = scrollPositions[leaf.id];
                }
              }}
              onScroll={(event) => {
                const scrollTop = event.currentTarget.scrollTop;
                const paneId = leaf.id;

                if (scrollUpdateFrame.current !== null) {
                  window.cancelAnimationFrame(scrollUpdateFrame.current);
                }

                scrollUpdateFrame.current = window.requestAnimationFrame(() => {
                  setScrollPositions((positions) => ({ ...positions, [paneId]: scrollTop }));
                  scrollUpdateFrame.current = null;
                });
              }}
            >
              {activeTab ? (
                renderPaneContent(activeTab.panel)
              ) : (
                <ProjectWelcomeState
                  files={recentProjectFiles}
                  onOpenTool={openIdeTool}
                  onOpenFile={(filePath) => openProjectFile(filePath, { paneId: leaf.id, preview: false })}
                />
              )}
            </div>
          </div>
        );
      },
      [
        activePaneId,
        clearPaneDropTarget,
        closePaneTabs,
        closeWorkspacePanel,
        currentDocument,
        onProjectEditorSave,
        openIdeTool,
        paneDropTarget,
        recentProjectFiles,
        renderPaneContent,
        selectPaneTab,
        splitPaneRight,
        scrollPositions,
        swapPaneTabs,
        unsavedFiles,
      ],
    );

    const renderPaneNode = useCallback(
      (node: IdePaneNode): React.ReactNode => {
        if (node.type === 'leaf') {
          return renderPaneLeaf(node);
        }

        return (
          <div key={node.id} className="bolt-project-pane-split" data-direction={node.direction}>
            {renderPaneNode(node.first)}
            <div className="bolt-project-pane-split-divider" aria-hidden />
            {renderPaneNode(node.second)}
          </div>
        );
      },
      [renderPaneLeaf],
    );

    const projectIdePanels = (
      <div
        className="bolt-project-ide-panels"
        style={
          {
            '--project-agent-width': `${agentWidth}px`,
            '--project-right-panel-width': rightPanelOpen ? `${rightPanelWidth}px` : '0px',
          } as React.CSSProperties
        }
      >
        <section className="bolt-project-ide-panel bolt-project-agent-shell" aria-label="AI agent">
          <div className="bolt-project-agent-header">
            <div className="bolt-project-agent-avatar" aria-hidden>
              <span className="i-ph:sparkle" />
            </div>
            <span className="bolt-project-agent-title">Agent</span>
            <div className="bolt-project-agent-mode" role="group" aria-label="Agent mode">
              {PROJECT_AGENT_EXECUTION_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={projectAgentExecutionMode === mode.id}
                  title={mode.description}
                  onClick={() => {
                    setProjectAgentExecutionMode(mode.id);
                    setChatMode?.(mode.chatMode);
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <div className="bolt-project-agent-mode" role="group" aria-label="Execution guardrails">
              <button
                type="button"
                aria-pressed={projectPlanFirst}
                title="When enabled, the agent must return a plan and wait for approval before executing changes."
                onClick={() => setProjectPlanFirst((enabled) => !enabled)}
              >
                Plan first
              </button>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <ThemeSwitch
                size="lg"
                title="Switch light/dark theme"
                className="bolt-project-ide-icon-button"
                iconClassName="text-[14px]"
              />
              <button
                type="button"
                className="bolt-project-ide-icon-button"
                aria-label="Conversation history"
                onClick={() => setConversationHistoryOpen((value) => !value)}
              >
                <span className="i-ph:clock" aria-hidden />
              </button>
              <button type="button" className="bolt-project-ide-icon-button" aria-label="New chat" onClick={resetChat}>
                <span className="i-ph:plus" aria-hidden />
              </button>
              <button
                type="button"
                className="bolt-project-ide-icon-button"
                aria-label="Agent settings"
                onClick={() => openWorkspacePanel('settings')}
              >
                <span className="i-ph:sliders-horizontal" aria-hidden />
              </button>
            </div>
          </div>
          {conversationHistoryOpen && (
            <div className="bolt-project-conversation-history" role="dialog" aria-label="Project agent history">
              <div className="bolt-project-conversation-history-head">
                <div>
                  <strong>Agent history</strong>
                  <span>
                    {filteredProjectConversationCheckpoints.length} of {projectConversationCheckpoints.length}{' '}
                    checkpoints
                  </span>
                </div>
                <button
                  type="button"
                  className="bolt-project-ide-icon-button"
                  aria-label="Close history"
                  onClick={() => setConversationHistoryOpen(false)}
                >
                  <span className="i-ph:x" aria-hidden />
                </button>
              </div>
              <label className="bolt-project-conversation-history-search">
                <span className="i-ph:magnifying-glass" aria-hidden />
                <input
                  type="search"
                  value={conversationHistoryQuery}
                  placeholder="Search checkpoints, commits, prompts, or agent replies"
                  aria-label="Search agent checkpoints"
                  onChange={(event) => setConversationHistoryQuery(event.currentTarget.value)}
                />
                {conversationHistoryQuery && (
                  <button
                    type="button"
                    aria-label="Clear history search"
                    onClick={() => setConversationHistoryQuery('')}
                  >
                    <span className="i-ph:x" aria-hidden />
                  </button>
                )}
              </label>
              <div className="bolt-project-conversation-history-list">
                {filteredProjectConversationCheckpoints.map((checkpoint) => {
                  const rollbackAvailable = checkpoint.snapshot || checkpoint.messages.length;

                  return (
                    <article key={checkpoint.id} className="bolt-project-history-checkpoint">
                      <div className="bolt-project-history-checkpoint-main">
                        <strong>{checkpoint.title}</strong>
                        <span>{checkpoint.description}</span>
                        <small>
                          {checkpoint.ageLabel}
                          {checkpoint.commitSha ? ` • ${checkpoint.commitSha}` : ''}
                        </small>
                      </div>
                      <div className="bolt-project-history-checkpoint-actions">
                        <button
                          type="button"
                          aria-label={`View chat at checkpoint ${checkpoint.title}`}
                          onClick={() => viewProjectCheckpoint(checkpoint)}
                        >
                          View Chat
                        </button>
                        <button
                          type="button"
                          disabled={!rollbackAvailable}
                          aria-label={`Rollback to checkpoint ${checkpoint.title}`}
                          onClick={() => {
                            setRollbackDatabase(false);
                            setRollbackTarget(checkpoint);
                          }}
                        >
                          Rollback here
                        </button>
                        <button
                          type="button"
                          aria-label={`Review diff for checkpoint ${checkpoint.title}`}
                          onClick={() => openCheckpointChanges(checkpoint)}
                        >
                          Review diff
                        </button>
                      </div>
                    </article>
                  );
                })}
                {!projectConversationCheckpoints.length && (
                  <div className="bolt-project-history-empty">No project agent history yet.</div>
                )}
                {projectConversationCheckpoints.length > 0 && !filteredProjectConversationCheckpoints.length && (
                  <div className="bolt-project-history-empty">No checkpoints match this search.</div>
                )}
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-hidden">{agentPanel}</div>
          <div
            className="bolt-project-agent-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize AI agent panel"
            onMouseDown={startAgentResize}
          />
        </section>
        <div className="bolt-project-workspace-shell">
          <section className="bolt-project-ide-panel" aria-label="Editor and preview">
            <div className="bolt-project-main-stack">
              <div
                className="bolt-project-main-panes"
                style={
                  {
                    '--project-terminal-bottom-height': terminalBottomOpen ? `${terminalBottomHeight}px` : '0px',
                  } as React.CSSProperties
                }
              >
                {renderPaneNode(paneTree)}
              </div>
              {terminalBottomOpen && (
                <div
                  className="bolt-project-bottom-terminal-shell"
                  style={{ '--project-terminal-height': `${terminalBottomHeight}px` } as React.CSSProperties}
                >
                  <div
                    className="bolt-project-terminal-resize-handle"
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="Resize pinned terminal"
                    onMouseDown={startTerminalResize}
                  />
                  <div className="bolt-project-bottom-terminal-frame">
                    <ProjectBottomTerminal
                      projectId={projectId}
                      terminalHeight={terminalBottomHeight}
                      onClose={() => setTerminalBottomOpen(false)}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
        {rightPanelOpen && (
          <aside
            className="bolt-project-right-panel-shell"
            aria-label={rightPanelMode === 'files' ? 'Project files panel' : 'Preview logs panel'}
            style={{ '--project-right-panel-width': `${rightPanelWidth}px` } as React.CSSProperties}
          >
            <div
              className="bolt-project-right-resize-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize right panel"
              onMouseDown={startRightPanelResize}
            />
            <div className="bolt-project-right-files-header">
              <span className={rightPanelMode === 'files' ? 'i-ph:files' : 'i-ph:terminal-window'} aria-hidden />
              <span>{rightPanelMode === 'files' ? 'Files' : 'Preview logs'}</span>
              <button
                type="button"
                className="bolt-project-ide-icon-button ml-auto"
                aria-label="Close right panel"
                onClick={() => {
                  setRightPanelOpen(false);
                  setSearchParams({});
                }}
              >
                <span className="i-ph:x" aria-hidden />
              </button>
            </div>
            <div className="bolt-project-right-panel-content">
              {rightPanelMode === 'files' ? (
                <ProjectFilesTool
                  files={projectFiles}
                  selectedFile={selectedFile}
                  unsavedFiles={unsavedFiles}
                  onFilePreview={(filePath) => openProjectFile(filePath, { preview: true })}
                  onFileOpen={(filePath) => openProjectFile(filePath, { preview: false })}
                />
              ) : (
                <ProjectIdeServicePanel projectId={projectId} panel="logs" />
              )}
            </div>
          </aside>
        )}
      </div>
    );

    const commandPaletteEntries = useMemo(
      () =>
        [
          ...projectFilePaths.slice(0, 20).map((filePath) => ({
            id: `file:${filePath}`,
            section: 'Files',
            title: filePath.replace(WORK_DIR, '') || filePath,
            description: 'Open project file',
            shortcut: '⌘P',
            icon: 'i-ph:file-code',
            kind: 'file' as const,
            filePath,
          })),
          ...[
            ['files', 'Files', 'Browse project files', '⌘P'],
            ['search', 'Search', 'Find in files', ''],
            ['terminal', 'Terminal', 'Workspace shell', '⌘`'],
            ['preview', 'Webview', 'App preview', '⌘⇧V'],
            ['database', 'Database', 'SQL browser', ''],
            ['object-storage', 'Object Storage', 'File storage', ''],
            ['env', 'Env vars', 'Environment variables', ''],
            ['secrets', 'Secrets', 'Encrypted project secrets', ''],
            ['git', 'Git', 'Version control', ''],
            ['packages', 'Packages', 'Dependencies manager', ''],
            ['integrations', 'Integrations', 'Connected services', ''],
            ['workflows', 'Workflows', 'Task automation', ''],
            ['deployments', 'Deployments', 'Publish your app', ''],
            ['security', 'Security', 'Security scanner', ''],
            ['monitoring', 'Monitoring', 'App metrics', ''],
            ['extensions', 'Extensions', 'Marketplace', ''],
            ['snapshots', 'Snapshots', 'Create or restore checkpoints', ''],
            ['settings', 'Settings', 'Project settings', '⌘,'],
          ].map(([panel, title, description, shortcut]) => ({
            id: `tool:${panel}`,
            section: 'Tools',
            title,
            description,
            shortcut,
            icon: panelIcon(panel),
            kind: 'tool' as const,
            panel: panel as IdeWorkspacePanel | IdeRightPanel,
          })),
          ...[
            ['run', 'Run app', 'Open preview runtime', ''],
            ['stop', 'Stop app', 'Open logs to stop runtime process', ''],
            ['deploy', 'Deploy', 'Open deployment panel', ''],
            ['theme', 'Toggle theme', 'Use existing theme controls', ''],
            ['reset-layout', 'Reset layout', 'Restore default IDE layout', ''],
          ].map(([command, title, description, shortcut]) => ({
            id: `command:${command}`,
            section: 'Commands',
            title,
            description,
            shortcut,
            icon: 'i-ph:command',
            kind: 'command' as const,
            command,
          })),
          ...flattenTabs(paneTree).map((tab) => ({
            id: `recent:${tab.id}`,
            section: 'Recent',
            title: tab.filePath?.replace(WORK_DIR, '') || panelTitle(tab.panel),
            description: 'Focus open tab',
            shortcut: '',
            icon: tab.panel === 'editor' ? 'i-ph:code' : panelIcon(tab.panel),
            kind: 'recent' as const,
            tabId: tab.id,
          })),
        ]
          .filter((entry) => {
            if (commandPaletteMode === 'files' && entry.kind !== 'file') {
              return false;
            }

            if (commandPaletteMode === 'tools' && entry.kind !== 'tool') {
              return false;
            }

            const query = commandPaletteQuery.trim().toLowerCase();

            if (!query) {
              return true;
            }

            return `${entry.title} ${entry.description} ${entry.section}`.toLowerCase().includes(query);
          })
          .slice(0, 60),
      [commandPaletteMode, commandPaletteQuery, paneTree, projectFilePaths],
    );

    const runCommandPaletteEntry = (entry = commandPaletteEntries[commandPaletteIndex]) => {
      if (!entry) {
        return;
      }

      if (entry.kind === 'file') {
        openProjectFile(entry.filePath, { preview: false });
      } else if (entry.kind === 'tool') {
        openIdeTool(entry.panel);
      } else if (entry.kind === 'recent') {
        const leaf = findLeafContainingTab(paneTree, entry.tabId);
        const tab = leaf?.tabs.find((item) => item.id === entry.tabId);

        if (leaf && tab) {
          selectPaneTab(leaf.id, tab.id, tab.panel);
        }
      } else if (entry.kind === 'command') {
        if (entry.command === 'reset-layout') {
          setPaneTree(cloneDefaultPaneTree());
          setActivePaneId('pane-main');
        } else if (entry.command === 'deploy') {
          openWorkspacePanel('deployments');
        } else if (entry.command === 'run') {
          openWorkspacePanel('preview');
          void workbenchStore.startPreviewServer();
        } else if (entry.command === 'stop') {
          void workbenchStore.stopPreviewServer();
          openWorkspacePanel('logs');
        } else if (entry.command === 'theme') {
          themeStore.set(theme === 'dark' ? 'light' : 'dark');
        }
      }

      setCommandPaletteOpen(false);
      setCommandPaletteQuery('');
      setCommandPaletteIndex(0);
    };

    const commandPaletteSections = useMemo(
      () =>
        (['Files', 'Tools', 'Commands', 'Recent'] as const).map((name) => ({
          name,
          entries: commandPaletteEntries.filter((entry) => entry.section === name),
        })),
      [commandPaletteEntries],
    );

    const baseChat = (
      <div
        ref={ref}
        className={classNames(styles.BaseChat, 'relative flex h-full w-full overflow-hidden bolt-responsive-ide', {
          'bolt-responsive-ide-mobile': useMobileIde,
          'bolt-responsive-ide-tablet-landscape': layout.isTabletLandscape,
          'bolt-responsive-ide-desktop': layout.isDesktop,
        })}
        style={
          projectIdeMode && !useMobileIde
            ? ({ '--project-agent-width': `${agentWidth}px` } as React.CSSProperties)
            : undefined
        }
        data-chat-visible={showChat}
        data-mobile-panel={mobilePanel}
        {...(useMobileIde ? mobileSwipeHandlers : {})}
      >
        {!projectIdeMode && <ClientOnly>{() => <Menu />}</ClientOnly>}
        <div className="bolt-connection-status" role="status" aria-live="polite" data-online={isOnline}>
          {!isOnline ? 'Offline mode: edits stay local until the workspace connection returns.' : 'Connection healthy'}
        </div>
        {commandPaletteOpen && (
          <div className="bolt-project-command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
            <input
              autoFocus
              placeholder="Search tools, files, and commands..."
              aria-label="Search commands"
              value={commandPaletteQuery}
              onChange={(event) => {
                setCommandPaletteQuery(event.currentTarget.value);
                setCommandPaletteIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setCommandPaletteOpen(false);
                } else if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setCommandPaletteIndex((index) => Math.min(index + 1, Math.max(commandPaletteEntries.length - 1, 0)));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setCommandPaletteIndex((index) => Math.max(index - 1, 0));
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  runCommandPaletteEntry();
                }
              }}
            />
            {commandPaletteSections.map((section) => (
              <React.Fragment key={section.name}>
                <div className="bolt-project-command-section">{section.name}</div>
                {section.entries.map((entry) => {
                  const index = commandPaletteEntries.findIndex((item) => item.id === entry.id);

                  return (
                    <button
                      key={entry.id}
                      type="button"
                      aria-current={commandPaletteIndex === index ? 'page' : undefined}
                      onClick={() => {
                        runCommandPaletteEntry(entry);
                      }}
                    >
                      <span className={entry.icon} aria-hidden />
                      <span>
                        <strong>{entry.title}</strong>
                        <small>{entry.description}</small>
                      </span>
                      <kbd>{entry.shortcut || '↵'}</kbd>
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
            {!commandPaletteEntries.length && (
              <div className="px-4 py-6 text-sm text-bolt-elements-textTertiary">
                No matching command, tool, or file.
              </div>
            )}
            <footer>↑↓ navigate · ↵ select · esc close</footer>
          </div>
        )}
        <div
          className={classNames('flex w-full h-full min-h-0', {
            'overflow-hidden': projectIdeMode && !useMobileIde,
            'flex-col lg:flex-row overflow-y-auto': !projectIdeMode || useMobileIde,
          })}
        >
          {projectIdeMode && !useMobileIde ? (
            projectIdePanels
          ) : (
            <>
              {agentPanel}
              {useMobileIde && mobilePanel === 'deploy' ? (
                <PanelBoundary title={IDE_TOOL_DESCRIPTIONS[activeMobileServicePanel] ?? 'Project tools'}>
                  <div className="bolt-workbench-mobile fixed top-[calc(var(--header-height)+3rem+env(safe-area-inset-top,0px))] bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] left-0 z-0 w-full px-2">
                    <div className="h-full overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
                      <ProjectIdeServicePanel projectId={projectId} panel={activeMobileServicePanel} />
                    </div>
                  </div>
                </PanelBoundary>
              ) : (
                <ClientOnly>
                  {() => (
                    <PanelBoundary title="Workbench">
                      <Suspense fallback={<PanelLoading title="Loading workspace panels..." />}>
                        <LazyWorkbench
                          chatStarted={chatStarted || useMobileIde}
                          isStreaming={isStreaming}
                          setSelectedElement={setSelectedElement}
                          mobilePanel={
                            mobilePanel === 'chat' ? 'editor' : mobilePanel === 'deploy' ? 'editor' : mobilePanel
                          }
                          projectId={projectId}
                        />
                      </Suspense>
                    </PanelBoundary>
                  )}
                </ClientOnly>
              )}
            </>
          )}
        </div>
        <nav className="bolt-mobile-tabbar" aria-label="IDE panels">
          <ThemeSwitch size="lg" title="Switch light/dark theme" className="bolt-mobile-theme-switch" />
          {[
            ['chat', 'i-ph:chat-circle-text', 'Chat'],
            ['files', 'i-ph:files', 'Files'],
            ['editor', 'i-ph:code', 'Editor'],
            ['terminal', 'i-ph:terminal-window', 'Terminal'],
            ['preview', 'i-ph:browser', 'Preview'],
            ['deploy', 'i-ph:rocket-launch', 'Deploy'],
          ].map(([id, icon, label]) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              aria-current={mobilePanel === id ? 'page' : undefined}
              onClick={() => {
                setMobileIdePanel(id as typeof mobilePanel);
              }}
            >
              <span className={icon} aria-hidden />
              <span>{id === 'deploy' ? 'Ship' : label}</span>
            </button>
          ))}
        </nav>
        {projectIdeMode && (
          <footer
            className={classNames('bolt-project-statusbar', {
              'bolt-project-statusbar-mobile': useMobileIde,
            })}
            aria-label="IDE status"
          >
            <div>
              <span className="i-ph:git-branch" aria-hidden />
              <span>{projectBackendState.git?.branch ?? 'main'}</span>
              <span>
                ↑{projectBackendState.git?.ahead ?? 0} ↓{projectBackendState.git?.behind ?? 0}
              </span>
              <span className="i-ph:x-circle text-bolt-elements-icon-error" aria-hidden />
              <span>0</span>
              <span className="i-ph:warning text-bolt-elements-icon-warning" aria-hidden />
              <span>{projectBackendState.git?.changedFiles?.length ?? 0}</span>
              <button
                type="button"
                className="bolt-project-statusbar-workspace"
                onClick={() => {
                  if (useMobileIde) {
                    setMobileIdePanel('terminal');

                    return;
                  }

                  setTerminalBottomOpen(true);
                }}
                title={workspaceStatusTitle}
              >
                <span
                  className="bolt-project-statusbar-runtime-dot"
                  data-state={
                    workspaceError
                      ? 'error'
                      : workspaceLoading
                        ? 'starting'
                        : (workspaceStatus?.status?.toLowerCase() ?? 'stopped')
                  }
                  aria-hidden
                />
                <span>Workspace: {workspaceStatusLabel}</span>
                {quotaWarning ? <span>{quotaWarning}</span> : null}
                {billingUpgradePrompt ? <span>{billingUpgradePrompt}</span> : null}
                {workspaceError ? <span>{workspaceError}</span> : null}
              </button>
              {workspaceLogs.length > 0 ? (
                <button
                  type="button"
                  className="bolt-project-statusbar-logs"
                  onClick={() => {
                    if (useMobileIde) {
                      setMobileIdePanel('terminal');

                      return;
                    }

                    setTerminalBottomOpen((value) => !value);
                  }}
                  title={
                    useMobileIde
                      ? 'Show workspace logs'
                      : terminalBottomOpen
                        ? 'Hide workspace logs'
                        : 'Show workspace logs'
                  }
                >
                  <span className="i-ph:list-magnifying-glass" aria-hidden />
                  <span>{!useMobileIde && terminalBottomOpen ? 'Hide logs' : 'Show logs'}</span>
                </button>
              ) : null}
              <button
                type="button"
                className="bolt-project-statusbar-runtime"
                aria-label={
                  workspaceError
                    ? 'Crashed runtime'
                    : workspaceLoading
                      ? 'Building runtime'
                      : workspaceStatus?.status?.toLowerCase() === 'running'
                        ? `Running on ${runtimePortSummary}`
                        : 'Stopped runtime'
                }
                onClick={() => {
                  if (useMobileIde) {
                    setMobileIdePanel('preview');

                    return;
                  }

                  openWorkspacePanel('preview');
                }}
                title="Open preview"
              >
                <span
                  className="bolt-project-statusbar-runtime-dot"
                  data-state={
                    workspaceError
                      ? 'error'
                      : workspaceLoading
                        ? 'starting'
                        : (workspaceStatus?.status?.toLowerCase() ?? 'stopped')
                  }
                  aria-hidden
                />
                <span>{runtimeStatusSummary}</span>
                <span>{runtimePortSummary}</span>
                <span>{runtimeDevServerSummary}</span>
              </button>
            </div>
            <div>
              <ThemeSwitch
                size="sm"
                title="Switch light/dark theme"
                className="bolt-project-statusbar-theme"
                iconClassName="text-[11px]"
              />
              <span>
                {currentDocument?.filePath && cursorPositions[currentDocument.filePath]
                  ? `Ln ${cursorPositions[currentDocument.filePath].line}, Col ${
                      cursorPositions[currentDocument.filePath].column
                    }`
                  : 'Ln 1, Col 1'}
              </span>
              <span>Spaces: 2</span>
              <span>UTF-8</span>
              <span>{fileTypeLabel(currentDocument?.filePath)}</span>
              <button
                type="button"
                aria-label="Toggle terminal"
                onClick={() => setTerminalBottomOpen((value) => !value)}
              >
                <span className="i-ph:terminal-window" aria-hidden />
              </button>
              <button type="button" aria-label="Toggle agent" onClick={() => textareaRef?.current?.focus()}>
                <span className="i-ph:sparkle" aria-hidden />
              </button>
            </div>
          </footer>
        )}
        {rollbackTarget && (
          <div
            className="bolt-project-rollback-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rollback-title"
          >
            <div className="bolt-project-rollback-dialog">
              <div className="bolt-project-rollback-body">
                <h2 id="rollback-title">Rollback to checkpoint</h2>
                <div className="bolt-project-rollback-screenshot" aria-label="Screenshot taken by the Agent">
                  <span className="i-ph:image" aria-hidden />
                  <strong>Screenshot</strong>
                  <small>Screenshot taken by the Agent</small>
                  <em>Preview expired</em>
                </div>
                <section>
                  <span className="bolt-project-rollback-label">Target checkpoint</span>
                  <h3>{rollbackTarget.title}</h3>
                  <p>{rollbackTarget.description}</p>
                  <small>
                    {rollbackTarget.ageLabel}
                    {rollbackTarget.commitSha ? ` • ${rollbackTarget.commitSha}` : ''}
                  </small>
                </section>
                <section>
                  <span className="bolt-project-rollback-label">What will be impacted</span>
                  <div className="bolt-project-rollback-impact">
                    <strong>Files</strong>
                    <p>
                      All files in your app will be restored to the state they were in at the time of this checkpoint.
                    </p>
                    <strong>Agent memory</strong>
                    <p>The Agent's memory will reset to what it knew about your app at the time of this checkpoint.</p>
                    <strong>Tasks</strong>
                    <p>All in-progress tasks will finish but will require review</p>
                  </div>
                </section>
                <section>
                  <span className="bolt-project-rollback-label">Additional rollback options</span>
                  <label className="bolt-project-rollback-option">
                    <input
                      type="checkbox"
                      checked={rollbackDatabase}
                      onChange={(event) => setRollbackDatabase(event.currentTarget.checked)}
                    />
                    <span>
                      <strong>Database</strong>
                      <small>
                        Your development database will be restored to the time of this checkpoint. This will not affect
                        your production database.
                      </small>
                    </span>
                  </label>
                </section>
              </div>
              <footer>
                <button type="button" onClick={() => setRollbackTarget(null)} disabled={rollbackBusy}>
                  Cancel
                </button>
                <button type="button" onClick={confirmProjectRollback} disabled={rollbackBusy}>
                  {rollbackBusy ? 'Rolling back...' : 'Rollback to this checkpoint'}
                </button>
              </footer>
            </div>
          </div>
        )}
      </div>
    );

    return <Tooltip.Provider delayDuration={500}>{baseChat}</Tooltip.Provider>;
  },
);

function ProjectIdeServicePanel({ projectId, panel }: { projectId?: string; panel: string }) {
  const [payload, setPayload] = useState<any>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const selectedFile = useStore(workbenchStore.selectedFile);

  const collaborationRealtime = useProjectCollaboration({
    projectId,
    enabled: panel === 'collaborators' && Boolean(projectId),
    filePath: selectedFile,
    mode: 'editing',
  });

  const title = panelTitle(panel);

  const rendersEmptyStateActions =
    panel === 'deployments' ||
    panel === 'env' ||
    panel === 'secrets' ||
    panel === 'snapshots' ||
    panel === 'domains' ||
    panel === 'integrations' ||
    panel === 'workflows';

  const fetchPanel = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    let response = await fetch(input, init);

    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const retryMs = Math.min(5000, Math.max(750, Number(retryAfter ?? 1) * 1000 || 1200));
      await new Promise((resolve) => window.setTimeout(resolve, retryMs));
      response = await fetch(input, init);
    }

    return response;
  }, []);

  const loadPanel = useCallback(async () => {
    if (!projectId) {
      return;
    }

    setBusy(true);
    setError(undefined);

    try {
      const response = await fetchPanel(`/api/projects/${projectId}/ide-panel/${panel}`, {
        headers: { accept: 'application/json' },
      });
      const result = (await response.json()) as {
        error?: { code: string; message: string; retryable: boolean } | string;
        status?: 'ok' | 'empty' | 'error';
      };

      if (!response.ok) {
        const message = typeof result.error === 'string' ? result.error : result.error?.message;
        throw new Error(message ?? 'Unable to load IDE panel');
      }

      if (result.status === 'error' && typeof result.error === 'object' && result.error) {
        setError(`[${result.error.code}] ${result.error.message}`);
      }

      setPayload(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load IDE panel');
      setPayload(undefined);
    } finally {
      setBusy(false);
    }
  }, [fetchPanel, panel, projectId]);

  useEffect(() => {
    void loadPanel();
  }, [loadPanel]);

  useEffect(() => {
    if (panel !== 'collaborators' || !collaborationRealtime.snapshot) {
      return;
    }

    setPayload((current: any) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        data: {
          ...(current.data ?? {}),
          presence: collaborationRealtime.snapshot?.presence ?? current.data?.presence ?? [],
          comments: collaborationRealtime.snapshot?.comments ?? current.data?.comments ?? [],
          realtime: {
            status: collaborationRealtime.snapshot?.status,
            error: collaborationRealtime.snapshot?.error,
            lastEvent: collaborationRealtime.snapshot?.lastEvent,
          },
        },
      };
    });
  }, [collaborationRealtime.snapshot, panel]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;

    if (!projectId) {
      return;
    }

    setBusy(true);
    setError(undefined);

    try {
      const response = await fetchPanel(`/api/projects/${projectId}/ide-panel/${panel}`, {
        method: 'POST',
        body: new FormData(form),
      });

      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? 'Panel action failed');
      }

      form.reset();
      await loadPanel();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Panel action failed');
    } finally {
      setBusy(false);
    }
  }

  const data = payload?.data ?? {};
  const project = payload?.project ?? {};

  return (
    <div className="bolt-project-service-panel" data-testid="ide-service-panel" data-panel={panel}>
      <div className="bolt-project-ide-panel-header">
        <span className={panelIcon(panel)} aria-hidden />
        <h2 className="m-0 text-sm font-semibold">{title}</h2>
        <button
          type="button"
          className="ml-auto rounded border border-bolt-elements-borderColor px-2 py-0.5 text-[11px] text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
          onClick={() => void loadPanel()}
          disabled={busy}
        >
          {busy ? 'Loading' : 'Refresh'}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {error ? (
          <div
            className="mb-4 flex items-start gap-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
            role="alert"
          >
            <span className="flex-1">{error}</span>
            <button
              type="button"
              className="rounded border border-red-500/40 px-2 py-0.5 text-[11px] hover:bg-red-500/20"
              onClick={() => void loadPanel()}
              disabled={busy}
            >
              Retry
            </button>
          </div>
        ) : null}
        {busy && !payload ? (
          <div
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-sm text-bolt-elements-textSecondary"
            role="status"
          >
            Loading {title.toLowerCase()} from backend&hellip;
          </div>
        ) : payload?.status === 'empty' && !error && !rendersEmptyStateActions ? (
          <div className="rounded-lg border border-dashed border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6 text-center text-sm text-bolt-elements-textSecondary">
            <div className="mb-1 font-medium text-bolt-elements-textPrimary">No {title.toLowerCase()} yet</div>
            <div className="text-[12px]">Once your workspace produces data, it will appear here automatically.</div>
          </div>
        ) : (
          <ProjectIdePanelContent
            panel={panel}
            data={data}
            project={project}
            projectId={projectId}
            onSubmit={submit}
            busy={busy}
            reload={loadPanel}
          />
        )}
      </div>
    </div>
  );
}

function ProjectBottomTerminal({
  projectId,
  terminalHeight,
  onClose,
}: {
  projectId?: string;
  terminalHeight: number;
  onClose: () => void;
}) {
  const [active, setActive] = useState<'terminal' | 'output' | 'problems' | 'debug'>('terminal');
  const workspaceStatus = useStore(workbenchStore.workspaceStatus);
  const backendSessionId = workspaceStatus?.id ?? projectId ?? 'no-workspace';
  const workspaceLabel = workspaceStatus ? `${workspaceStatus.status} workspace` : 'No backend workspace';

  const terminalTabs = [
    ['terminal', 'Terminal', 'i-ph:terminal-window'],
    ['output', 'Output', 'i-ph:list-bullets'],
    ['problems', 'Problems', 'i-ph:warning-circle'],
    ['debug', 'Debug Console', 'i-ph:bug'],
  ] as const;

  return (
    <section className="bolt-project-bottom-terminal" aria-label="Pinned terminal">
      <div className="bolt-project-bottom-terminal-tabs">
        <div className="bolt-project-bottom-terminal-tabs-left" aria-label="Pinned terminal views">
          {terminalTabs.map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              aria-current={active === id ? 'page' : undefined}
              onClick={() => setActive(id as any)}
            >
              <span className={icon} aria-hidden />
              {label}
            </button>
          ))}
        </div>
        <div className="bolt-project-bottom-terminal-meta">
          <span className="bolt-project-bottom-terminal-status" data-state={workspaceStatus?.status ?? 'offline'}>
            <span aria-hidden />
            {workspaceLabel}
          </span>
          <span className="bolt-project-bottom-terminal-size">{terminalHeight}px</span>
          <select
            className="bolt-project-bottom-terminal-session"
            aria-label="Backend runtime session"
            value={backendSessionId}
            onChange={() => undefined}
          >
            <option value={backendSessionId}>{workspaceLabel}</option>
          </select>
          <button
            type="button"
            aria-label="Refresh runtime logs"
            onClick={() => {
              setActive('terminal');
              void workbenchStore.refreshRuntimePorts().catch(() => undefined);
            }}
          >
            <span className="i-ph:arrow-clockwise" aria-hidden />
          </button>
          <button type="button" aria-label="Close terminal panel" onClick={onClose}>
            <span className="i-ph:x" aria-hidden />
          </button>
        </div>
      </div>
      <div className="bolt-project-bottom-terminal-content">
        {active === 'terminal' ? (
          <ClientOnly fallback={<PanelLoading title="Loading terminal..." />}>
            {() => (
              <PanelBoundary title="Terminal">
                <Suspense fallback={<PanelLoading title="Loading terminal..." />}>
                  <PanelGroup direction="vertical" className="h-full">
                    <LazyTerminalTabs panelDefaultSize={100} />
                  </PanelGroup>
                </Suspense>
              </PanelBoundary>
            )}
          </ClientOnly>
        ) : active === 'output' ? (
          <ProjectIdeServicePanel projectId={projectId} panel="logs" />
        ) : active === 'problems' ? (
          <ProjectIdeServicePanel projectId={projectId} panel="activity" />
        ) : (
          <ProjectIdeServicePanel projectId={projectId} panel="monitoring" />
        )}
      </div>
    </section>
  );
}

function ProjectTerminalPanel({ projectId }: { projectId?: string }) {
  const [activeTab, setActiveTab] = useState<'shell' | 'environment' | 'scripts' | 'connections'>('shell');
  const [payload, setPayload] = useState<any>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set(['.', '/workspace']));
  const [showEnvForm, setShowEnvForm] = useState(false);
  const [showSshForm, setShowSshForm] = useState(false);
  const [showScriptForm, setShowScriptForm] = useState(false);
  const [customScript, setCustomScript] = useState('');
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const data = payload?.data ?? {};
  const envVars = data.envVars ?? [];
  const secrets = data.secrets ?? [];
  const terminalState = data.terminalState ?? {};
  const sshConnections = terminalState.sshConnections ?? [];
  const scriptRuns = terminalState.scriptRuns ?? [];
  const runtimeFiles = Array.isArray(data.runtimeFiles) ? data.runtimeFiles : [];
  const runtimeProcesses = Array.isArray(data.runtimeProcesses) ? data.runtimeProcesses : [];
  const runtimePorts = Array.isArray(data.runtimePorts) ? data.runtimePorts : [];
  const workspace = data.workspace ?? data.runtimeStatus;
  const workspaceId = data.workspaceId ?? workspace?.id ?? projectId;

  const loadPanel = useCallback(async () => {
    if (!projectId) {
      return;
    }

    setBusy(true);
    setError(undefined);

    try {
      const response = await fetch(`/api/projects/${projectId}/ide-panel/terminal`, {
        headers: { accept: 'application/json' },
      });

      const result = (await response.json()) as any;

      if (!response.ok) {
        throw new Error(result?.error?.message ?? result?.error ?? 'Unable to load terminal panel');
      }

      if (result.status === 'error' && result.error) {
        setError(result.error.message ?? 'Terminal panel returned an error');
      }

      setPayload(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load terminal panel');
    } finally {
      setBusy(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadPanel();
  }, [loadPanel]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!projectId) {
      return;
    }

    const form = event.currentTarget;
    setBusy(true);
    setError(undefined);
    setMessage('');

    try {
      const response = await fetch(`/api/projects/${projectId}/ide-panel/terminal`, {
        method: 'POST',
        body: new FormData(form),
      });

      const result = (await response.json().catch(() => ({}))) as any;

      if (!response.ok) {
        throw new Error(result.error ?? 'Terminal action failed');
      }

      form.reset();
      setShowEnvForm(false);
      setShowSshForm(false);
      setShowScriptForm(false);
      setCustomScript('');
      setMessage('Action applied to the workspace backend.');
      await loadPanel();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Terminal action failed');
    } finally {
      setBusy(false);
    }
  }

  function toggleDir(path: string) {
    setExpandedDirs((current) => {
      const next = new Set(current);

      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  }

  async function copyValue(value: string, label: string) {
    await navigator.clipboard?.writeText(value);
    setMessage(`${label} copied.`);
  }

  async function revealSecret(key: string) {
    if (!projectId) {
      return;
    }

    if (revealedSecrets[key]) {
      setRevealedSecrets((current) => {
        const next = { ...current };
        delete next[key];

        return next;
      });
      return;
    }

    const response = await fetch(
      `/api/projects/${projectId}/ide-panel/secrets?reveal=true&confirm=1&key=${encodeURIComponent(key)}`,
      { headers: { accept: 'application/json' } },
    );

    const result = (await response.json()) as any;

    if (!response.ok || result.status === 'error') {
      setError(result?.error?.message ?? result?.error ?? 'Unable to reveal secret');
      return;
    }

    const secret = result.data?.secrets?.find((item: any) => item.key === key);
    setRevealedSecrets((current) => ({ ...current, [key]: secret?.value ?? '' }));
  }

  function renderFileTree(nodes: any[], depth = 0) {
    return nodes.map((node) => {
      const directory = node.type === 'directory';
      const expanded = expandedDirs.has(node.path);

      return (
        <div key={node.path}>
          <button
            type="button"
            className="bolt-terminal-file-node"
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            onClick={() => directory && toggleDir(node.path)}
            data-testid={`terminal-file-node-${node.name}`}
          >
            <span
              className={directory ? (expanded ? 'i-ph:caret-down' : 'i-ph:caret-right') : 'i-ph:file-code'}
              aria-hidden
            />
            {directory && <span className={expanded ? 'i-ph:folder-open' : 'i-ph:folder'} aria-hidden />}
            <span>{node.name}</span>
          </button>
          {directory && expanded && node.children?.length ? (
            <div>{renderFileTree(node.children, depth + 1)}</div>
          ) : null}
        </div>
      );
    });
  }

  return (
    <div className="bolt-project-terminal-hub" data-testid="terminal-hub-panel">
      <header className="bolt-terminal-hub-head">
        <div>
          <h3>Shell Environment</h3>
          <p>
            Live workspace shell, runtime files, processes, ports, project environment and SSH checks for{' '}
            {workspaceId ?? 'this project'}.
          </p>
        </div>
        <div>
          <button type="button" onClick={() => void loadPanel()} disabled={busy}>
            <span className="i-ph:arrows-clockwise" aria-hidden />
            {busy ? 'Refreshing' : 'Refresh'}
          </button>
          <form onSubmit={submit}>
            <input type="hidden" name="intent" value="restart-workspace" />
            <PanelButton disabled={busy} variant="outline">
              Restart
            </PanelButton>
          </form>
          <form onSubmit={submit}>
            <input type="hidden" name="intent" value="stop-workspace" />
            <PanelButton disabled={busy} variant="outline">
              Stop
            </PanelButton>
          </form>
        </div>
      </header>

      {error ? <div className="bolt-project-empty-panel terminal-error">{error}</div> : null}
      {message ? <div className="bolt-project-empty-panel terminal-message">{message}</div> : null}

      <div className="bolt-terminal-hub-grid">
        <aside className="bolt-terminal-sidebar">
          <section data-testid="card-file-navigator">
            <h4>
              <span className="i-ph:files" aria-hidden />
              File Navigator
            </h4>
            <small>Workspace root</small>
            <div className="bolt-terminal-file-tree">
              {runtimeFiles.length ? (
                renderFileTree(runtimeFiles)
              ) : (
                <div className="bolt-project-empty-panel">No files loaded.</div>
              )}
            </div>
          </section>

          <section>
            <h4>
              <span className="i-ph:hard-drives" aria-hidden />
              Runtime
            </h4>
            <PanelRows
              rows={[
                ['Workspace', workspaceId ?? 'none'],
                ['Status', workspace?.status ?? data.runtimeStatus?.status ?? 'unknown'],
                ['Ports', runtimePorts.length ? runtimePorts.map((port: any) => `:${port.port}`).join(', ') : 'none'],
                ['Processes', String(runtimeProcesses.length)],
              ]}
              empty="No runtime details."
            />
          </section>

          <section data-testid="card-ssh-connections">
            <div className="bolt-terminal-section-head">
              <h4>
                <span className="i-ph:wifi-high" aria-hidden />
                SSH Connections
              </h4>
              <button
                type="button"
                onClick={() => setShowSshForm((value) => !value)}
                data-testid="button-ssh-connections"
              >
                Add
              </button>
            </div>
            {showSshForm ? (
              <form onSubmit={submit} className="bolt-terminal-compact-form" data-testid="dialog-ssh">
                <input type="hidden" name="intent" value="add-ssh" />
                <PanelInput name="name" placeholder="Production bastion" required />
                <PanelInput name="host" placeholder="host.example.com" required />
                <PanelInput name="port" placeholder="22" defaultValue="22" />
                <PanelInput name="username" placeholder="deploy" required />
                <textarea name="privateKey" placeholder="Optional private key stored as a project secret" />
                <PanelButton disabled={busy} data-testid="button-add-ssh">
                  Save SSH
                </PanelButton>
              </form>
            ) : null}
            <div className="bolt-terminal-ssh-list">
              {sshConnections.map((connection: any) => (
                <article key={connection.id} data-testid={`ssh-connection-${connection.id}`}>
                  <span
                    className={connection.status === 'connected' ? 'i-ph:wifi-high' : 'i-ph:wifi-slash'}
                    aria-hidden
                  />
                  <div>
                    <strong>{connection.name}</strong>
                    <small>
                      {connection.username}@{connection.host}:{connection.port}
                    </small>
                    {connection.lastError ? (
                      <small className="terminal-error-text">{connection.lastError}</small>
                    ) : null}
                  </div>
                  <form onSubmit={submit}>
                    <input
                      type="hidden"
                      name="intent"
                      value={connection.status === 'connected' ? 'disconnect-ssh' : 'connect-ssh'}
                    />
                    <input type="hidden" name="connectionId" value={connection.id} />
                    <PanelButton disabled={busy} variant="outline">
                      {connection.status === 'connected' ? 'Disconnect' : 'Connect'}
                    </PanelButton>
                  </form>
                </article>
              ))}
              {!sshConnections.length ? (
                <div className="bolt-project-empty-panel">No SSH connections configured.</div>
              ) : null}
            </div>
          </section>
        </aside>

        <main className="bolt-terminal-main">
          <nav className="bolt-terminal-tabs" data-testid="tabs-shell">
            {[
              ['shell', 'Shell', 'i-ph:terminal-window'],
              ['environment', 'Environment', 'i-ph:key'],
              ['scripts', 'Scripts', 'i-ph:lightning'],
              ['connections', 'Processes', 'i-ph:activity'],
            ].map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                aria-current={activeTab === id ? 'page' : undefined}
                onClick={() => setActiveTab(id as any)}
                data-testid={`tab-${id}`}
              >
                <span className={icon} aria-hidden />
                {label}
              </button>
            ))}
          </nav>

          {activeTab === 'shell' && (
            <section className="bolt-terminal-live-card" data-testid="card-shell-terminal">
              <div className="bolt-terminal-live-toolbar">
                <strong>Interactive workspace shell</strong>
                <small>{workspace?.status ?? 'runtime status loading'}</small>
              </div>
              <ClientOnly fallback={<PanelLoading title="Loading terminal..." />}>
                {() => (
                  <PanelBoundary title="Terminal">
                    <Suspense fallback={<PanelLoading title="Loading terminal..." />}>
                      <PanelGroup direction="vertical" className="h-full">
                        <LazyTerminalTabs panelDefaultSize={100} />
                      </PanelGroup>
                    </Suspense>
                  </PanelBoundary>
                )}
              </ClientOnly>
            </section>
          )}

          {activeTab === 'environment' && (
            <section className="bolt-terminal-card" data-testid="card-env-vars">
              <div className="bolt-terminal-section-head">
                <div>
                  <strong>Environment Variables</strong>
                  <small>Project variables and encrypted secrets loaded from backend stores.</small>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEnvForm((value) => !value)}
                  data-testid="button-add-env-var"
                >
                  Add Variable
                </button>
              </div>
              {showEnvForm ? (
                <form onSubmit={submit} className="bolt-terminal-env-form" data-testid="dialog-add-env">
                  <input type="hidden" name="intent" value="add-env" />
                  <PanelInput name="key" placeholder="MY_VARIABLE" required data-testid="input-env-key" />
                  <PanelInput name="value" placeholder="Value" data-testid="input-env-value" />
                  <select name="isSecret" defaultValue="false" data-testid="switch-env-secret">
                    <option value="false">Plain variable</option>
                    <option value="true">Encrypted secret</option>
                  </select>
                  <PanelButton disabled={busy} data-testid="button-save-env">
                    Save Variable
                  </PanelButton>
                </form>
              ) : null}
              <div className="bolt-terminal-env-list">
                {envVars.map((envVar: any) => (
                  <article key={envVar.key} data-testid={`env-var-${envVar.key}`}>
                    <span className="i-ph:brackets-curly" aria-hidden />
                    <div>
                      <strong>{envVar.key}</strong>
                      <small>{envVar.value || 'empty value'}</small>
                    </div>
                    <button type="button" onClick={() => void copyValue(envVar.value ?? '', envVar.key)}>
                      Copy
                    </button>
                    <form onSubmit={submit}>
                      <input type="hidden" name="intent" value="delete-env" />
                      <input type="hidden" name="key" value={envVar.key} />
                      <input type="hidden" name="isSecret" value="false" />
                      <PanelButton disabled={busy} variant="outline">
                        Delete
                      </PanelButton>
                    </form>
                  </article>
                ))}
                {secrets.map((secret: any) => (
                  <article key={secret.key} data-testid={`env-var-${secret.key}`}>
                    <span className="i-ph:lock" aria-hidden />
                    <div>
                      <strong>{secret.key}</strong>
                      <small>{revealedSecrets[secret.key] ?? '••••••••'}</small>
                    </div>
                    <button type="button" onClick={() => void revealSecret(secret.key)}>
                      {revealedSecrets[secret.key] ? 'Hide' : 'Reveal'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyValue(revealedSecrets[secret.key] ?? secret.key, secret.key)}
                    >
                      Copy
                    </button>
                    <form onSubmit={submit}>
                      <input type="hidden" name="intent" value="delete-env" />
                      <input type="hidden" name="key" value={secret.key} />
                      <input type="hidden" name="isSecret" value="true" />
                      <PanelButton disabled={busy} variant="outline">
                        Delete
                      </PanelButton>
                    </form>
                  </article>
                ))}
                {!envVars.length && !secrets.length ? (
                  <div className="bolt-project-empty-panel">No environment variables.</div>
                ) : null}
              </div>
            </section>
          )}

          {activeTab === 'scripts' && (
            <section className="bolt-terminal-card" data-testid="card-script-runner">
              <div className="bolt-terminal-section-head">
                <div>
                  <strong>Script Runner</strong>
                  <small>Runs commands through the runtime command API with abuse prevention.</small>
                </div>
                <button
                  type="button"
                  onClick={() => setShowScriptForm((value) => !value)}
                  data-testid="button-create-script"
                >
                  New Script
                </button>
              </div>
              {showScriptForm ? (
                <form onSubmit={submit} className="bolt-terminal-script-editor" data-testid="dialog-script-editor">
                  <input type="hidden" name="intent" value="run-script" />
                  <PanelInput name="name" placeholder="Custom script" data-testid="input-script-name" />
                  <textarea
                    name="script"
                    placeholder="#!/bin/sh&#10;echo ready"
                    value={customScript}
                    onChange={(event) => setCustomScript(event.target.value)}
                    data-testid="textarea-script-content"
                  />
                  <PanelButton disabled={busy || !customScript.trim()} data-testid="button-run-custom-script">
                    Run Script
                  </PanelButton>
                </form>
              ) : null}
              <div className="bolt-terminal-script-grid">
                {TERMINAL_SCRIPT_TEMPLATES.map(([id, name, description, script]) => (
                  <article key={id} data-testid={`script-template-${id}`}>
                    <div>
                      <span className="i-ph:lightning" aria-hidden />
                      <strong>{name}</strong>
                      <p>{description}</p>
                      <code>$ {script}</code>
                    </div>
                    <form onSubmit={submit}>
                      <input type="hidden" name="intent" value="run-script" />
                      <input type="hidden" name="name" value={name} />
                      <input type="hidden" name="script" value={script} />
                      <PanelButton disabled={busy} variant="outline" data-testid={`button-run-${id}`}>
                        Run
                      </PanelButton>
                    </form>
                  </article>
                ))}
              </div>
              <div className="bolt-terminal-runs">
                {scriptRuns.map((run: any) => (
                  <details key={run.id} open={run.id === scriptRuns[0]?.id}>
                    <summary>
                      <span data-status={run.status}>{run.status}</span>
                      <strong>{run.name}</strong>
                      <small>{run.finishedAt ? new Date(run.finishedAt).toLocaleString() : run.startedAt}</small>
                    </summary>
                    <pre>{run.output || 'No output captured.'}</pre>
                  </details>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'connections' && (
            <section className="bolt-terminal-card" data-testid="card-runtime-processes">
              <div className="bolt-terminal-section-head">
                <div>
                  <strong>Processes and Ports</strong>
                  <small>Live process and preview port state from the workspace agent.</small>
                </div>
              </div>
              <div className="bolt-terminal-process-list">
                {runtimeProcesses.map((process: any) => (
                  <article key={process.id}>
                    <span className="i-ph:activity" aria-hidden />
                    <div>
                      <strong>{process.command}</strong>
                      <small>{process.startedAt ?? process.status}</small>
                    </div>
                    <form onSubmit={submit}>
                      <input type="hidden" name="intent" value="stop-process" />
                      <input type="hidden" name="processId" value={process.id} />
                      <PanelButton disabled={busy} variant="outline">
                        Stop
                      </PanelButton>
                    </form>
                  </article>
                ))}
                {!runtimeProcesses.length ? (
                  <div className="bolt-project-empty-panel">No runtime processes reported.</div>
                ) : null}
              </div>
              <div className="bolt-terminal-port-grid">
                {runtimePorts.map((port: any) => (
                  <a key={port.port} href={port.url} target="_blank" rel="noreferrer">
                    <span className="i-ph:link" aria-hidden />
                    Port {port.port}
                    <small>{port.ready === false ? 'not ready' : 'ready'}</small>
                  </a>
                ))}
                {!runtimePorts.length ? <div className="bolt-project-empty-panel">No preview ports open.</div> : null}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function ProjectFilesTool({
  files,
  selectedFile,
  unsavedFiles,
  onFilePreview,
  onFileOpen,
}: {
  files: any;
  selectedFile?: string;
  unsavedFiles?: Set<string>;
  onFilePreview: (filePath: string) => void;
  onFileOpen: (filePath: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const fileCount = Object.values(files ?? {}).filter((entry: any) => entry?.type === 'file').length;

  const filteredFiles = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();

    if (!trimmedQuery) {
      return files;
    }

    return Object.fromEntries(
      Object.entries(files ?? {}).filter(([filePath]) => filePath.toLowerCase().includes(trimmedQuery)),
    );
  }, [files, query]);

  async function createEntry(kind: 'file' | 'folder') {
    const value = window.prompt(kind === 'file' ? 'New file path' : 'New folder path');
    const normalized = value?.trim();

    if (!normalized) {
      return;
    }

    const target = normalized.startsWith(WORK_DIR) ? normalized : `${WORK_DIR}/${normalized.replace(/^\/+/, '')}`;

    if (kind === 'file') {
      onFileOpen(target);
      await workbenchStore.createFile(target, '');
    } else {
      await workbenchStore.createFolder(target);
    }
  }

  return (
    <div className="bolt-project-files-tool">
      <div className="bolt-project-files-header">
        <span className="bolt-project-files-count">{fileCount} files</span>
        <button type="button" aria-label="New file" onClick={() => void createEntry('file')}>
          <span className="i-ph:file-plus" aria-hidden />
        </button>
        <button type="button" aria-label="New folder" onClick={() => void createEntry('folder')}>
          <span className="i-ph:folder-plus" aria-hidden />
        </button>
        <button type="button" aria-label="Refresh files" onClick={() => void workbenchStore.loadRuntimeFiles('.')}>
          <span className="i-ph:arrow-clockwise" aria-hidden />
        </button>
        <button type="button" aria-label="Collapse all files" onClick={() => setCollapsed((value) => !value)}>
          <span className="i-ph:caret-double-up" aria-hidden />
        </button>
      </div>
      <label className="bolt-project-files-search">
        <span>Search</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Filter files"
          aria-label="Search files"
        />
      </label>
      <FileTree
        key={collapsed ? 'collapsed' : 'expanded'}
        className="bolt-project-file-tree"
        files={filteredFiles}
        hideRoot
        collapsed={collapsed}
        unsavedFiles={unsavedFiles}
        rootFolder={WORK_DIR}
        selectedFile={selectedFile}
        onFileSelect={(filePath) => {
          workbenchStore.setSelectedFile(filePath);
          workbenchStore.currentView.set('code');
          workbenchStore.setShowWorkbench(true);
        }}
        onFilePreview={onFilePreview}
        onFileOpen={onFileOpen}
      />
    </div>
  );
}

function IdeTabBar({
  activePanel: _activePanel,
  activeTabId,
  tabs,
  trailing,
  onSelect,
  onClose,
  onOpenTool,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
  onSplitActiveRight,
  onSwapTab,
  onDragEnd,
  recentFiles = [],
  onOpenFile,
}: {
  activePanel: IdeWorkspacePanel;
  activeTabId?: string;
  tabs: Array<{
    id: string;
    panel: IdeWorkspacePanel;
    label: string;
    icon: string;
    pinned?: boolean;
    preview?: boolean;
    dirty?: boolean;
    closable?: boolean;
    onSave?: () => void;
  }>;
  trailing?: React.ReactNode;
  onSelect: (tabId: string, panel: IdeWorkspacePanel) => void;
  onClose?: (tabId: string, panel: IdeWorkspacePanel) => void;
  onOpenTool?: (panel: IdeWorkspacePanel | IdeRightPanel) => void;
  onCloseOthers?: (tabId: string) => void;
  onCloseToRight?: (tabId: string) => void;
  onCloseAll?: () => void;
  onSplitActiveRight?: (tabId?: string) => void;
  onSwapTab?: (sourcePaneId: string, sourceTabId: string, targetTabId?: string) => void;
  onDragEnd?: () => void;
  recentFiles?: string[];
  onOpenFile?: (filePath: string, preview: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 44 });
  const [toolQuery, setToolQuery] = useState('');

  const tools: Array<[IdeWorkspacePanel | IdeRightPanel, string, string, string, string, string]> = [
    ['overview', 'Overview', 'Project summary', 'i-ph:gauge', 'var(--vc-ide-accent-action)', 'Workspace'],
    ['editor', 'Code', 'Code editor', 'i-ph:code', 'var(--vc-ide-accent-action)', 'Workspace'],
    ['files', 'Files', 'Browse project files', 'i-ph:files', 'var(--vc-ide-accent-warning)', 'Workspace'],
    ['search', 'Search', 'Find in files', 'i-ph:magnifying-glass', 'var(--vc-ide-accent-action)', 'Workspace'],
    ['locks', 'Locks', 'Locked files', 'i-ph:lock', 'var(--vc-ide-accent-warning)', 'Workspace'],
    ['terminal', 'Terminal', 'Workspace shell', 'i-ph:terminal-window', 'var(--vc-ide-accent-success)', 'Runtime'],
    ['logs', 'Logs', 'Runtime logs', 'i-ph:list-magnifying-glass', 'var(--vc-ide-accent-success)', 'Runtime'],
    ['preview', 'Webview', 'App preview', 'i-ph:browser', 'var(--vc-ide-accent-action)', 'Runtime'],
    ['database', 'Database', 'SQL browser', 'i-ph:database', 'var(--vc-ide-accent-ai-start)', 'Data'],
    ['object-storage', 'Object Storage', 'File storage', 'i-ph:package', 'var(--vc-ide-accent-warning)', 'Data'],
    [
      'env',
      'Env vars',
      'Environment variables',
      'i-ph:brackets-curly',
      'var(--vc-ide-accent-warning)',
      'Configuration',
    ],
    ['secrets', 'Secrets', 'Encrypted project secrets', 'i-ph:lock', 'var(--vc-ide-accent-warning)', 'Configuration'],
    ['git', 'Git', 'Version control', 'i-ph:git-branch', 'var(--vc-ide-accent-success)', 'Project'],
    ['packages', 'Packages', 'Dependencies manager', 'i-ph:cube', 'var(--vc-ide-accent-warning)', 'Project'],
    [
      'integrations',
      'Integrations',
      'Connected services',
      'i-ph:plugs-connected',
      'var(--vc-ide-accent-success)',
      'Project',
    ],
    ['workflows', 'Workflows', 'Task automation', 'i-ph:git-branch', 'var(--vc-ide-accent-success)', 'Project'],
    [
      'deployments',
      'Deployments',
      'Publish your app',
      'i-ph:rocket-launch',
      'var(--vc-ide-accent-ai-start)',
      'Delivery',
    ],
    ['security', 'Security', 'Security scanner', 'i-ph:shield-check', 'var(--vc-ide-accent-error)', 'Security'],
    ['monitoring', 'Monitoring', 'App metrics', 'i-ph:chart-line', 'var(--vc-ide-accent-action)', 'Delivery'],
    ['extensions', 'Extensions', 'Marketplace', 'i-ph:puzzle-piece', 'var(--vc-ide-text-secondary)', 'Project'],
    ['snapshots', 'Snapshots', 'Rollback points', 'i-ph:stack', 'var(--vc-ide-accent-ai-start)', 'Project'],
    ['activity', 'Activity', 'Project timeline', 'i-ph:activity', 'var(--vc-ide-accent-action)', 'Team'],
    ['collaborators', 'Collaborators', 'Team access', 'i-ph:users', 'var(--vc-ide-text-secondary)', 'Team'],
    ['domains', 'Domains', 'Custom domains', 'i-ph:globe', 'var(--vc-ide-accent-action)', 'Delivery'],
    ['settings', 'Settings', 'Project settings', 'i-ph:gear', 'var(--vc-ide-text-secondary)', 'Configuration'],
  ];

  const normalizedToolQuery = toolQuery.trim().toLowerCase();

  const filteredRecentFiles = recentFiles
    .filter((filePath) => !normalizedToolQuery || filePath.toLowerCase().includes(normalizedToolQuery))
    .slice(0, 5);
  const filteredTools = tools.filter(
    ([id, title, description, , , category]) =>
      !normalizedToolQuery || [id, title, description, category].join(' ').toLowerCase().includes(normalizedToolQuery),
  );
  const toolGroups = Array.from(
    filteredTools
      .reduce((groups, tool) => {
        const category = normalizedToolQuery ? 'Matches' : tool[5];
        const groupTools = groups.get(category) ?? [];

        groupTools.push(tool);
        groups.set(category, groupTools);

        return groups;
      }, new Map<string, typeof filteredTools>())
      .entries(),
  );

  return (
    <div className="bolt-project-tabbar">
      <div
        className="bolt-project-tabs"
        role="tablist"
        onDragOver={(event) => {
          if (onSwapTab) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          const sourcePaneId = event.dataTransfer.getData('application/x-vibecore-pane-id');
          const sourceTabId = event.dataTransfer.getData('application/x-vibecore-tab-id');

          if (sourcePaneId && sourceTabId) {
            event.preventDefault();
            onSwapTab?.(sourcePaneId, sourceTabId, activeTabId);
          }
        }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            data-tab-id={tab.id}
            data-testid={`tab-${tab.id}`}
            data-pinned={tab.pinned ? 'true' : undefined}
            aria-label={tab.label}
            aria-selected={activeTabId === tab.id}
            className="bolt-project-tab"
            draggable
            onDragStart={(event) => {
              const pane = event.currentTarget.closest('[data-pane-id]') as HTMLElement | null;
              const paneId = pane?.dataset.paneId;

              if (!paneId) {
                event.preventDefault();
                return;
              }

              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('application/x-vibecore-pane-id', paneId);
              event.dataTransfer.setData('application/x-vibecore-tab-id', tab.id);
            }}
            onDragEnd={onDragEnd}
            onDragOver={(event) => {
              if (onSwapTab) {
                event.preventDefault();
              }
            }}
            onDrop={(event) => {
              const sourcePaneId = event.dataTransfer.getData('application/x-vibecore-pane-id');
              const sourceTabId = event.dataTransfer.getData('application/x-vibecore-tab-id');

              if (sourcePaneId && sourceTabId) {
                event.preventDefault();
                event.stopPropagation();
                onSwapTab?.(sourcePaneId, sourceTabId, tab.id);
              }
            }}
          >
            <button
              type="button"
              className="bolt-project-tab-main"
              title={tab.label}
              onClick={() => onSelect(tab.id, tab.panel)}
            >
              <span className={tab.pinned ? 'i-ph:push-pin-simple' : tab.icon} aria-hidden />
              <span className={tab.preview || tab.dirty ? 'italic' : ''}>{tab.label}</span>
            </button>
            {tab.dirty ? (
              <button
                type="button"
                className="bolt-project-tab-save"
                aria-label={`Save ${tab.label}`}
                onClick={(event) => {
                  event.preventDefault();
                  tab.onSave?.();
                }}
              >
                ●
              </button>
            ) : tab.closable && onClose ? (
              <button
                type="button"
                className="bolt-project-tab-close"
                aria-label={`Close ${tab.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab.id, tab.panel);
                }}
              >
                ×
              </button>
            ) : (
              <span className="bolt-project-tab-close" aria-hidden>
                ×
              </span>
            )}
          </div>
        ))}
      </div>
      {trailing}
      <div className="bolt-project-tool-popover">
        <button
          type="button"
          className="bolt-project-tab-action bolt-project-add-tab-action"
          aria-label="Open tool"
          title="Add tab"
          data-testid="tab-add"
          aria-expanded={open}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();

            const rect = event.currentTarget.getBoundingClientRect();
            const menuWidth = 320;
            const menuMaxHeight = 480;
            const viewportPadding = 8;

            const left = Math.min(
              Math.max(viewportPadding, rect.left),
              Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
            );

            const top = Math.min(rect.bottom + 4, Math.max(44, window.innerHeight - menuMaxHeight - viewportPadding));

            setMenuPosition({ left, top });
            setOpen(true);
          }}
          onClick={(event) => event.preventDefault()}
        >
          <span className="i-ph:plus" aria-hidden />
          <span>Add Tab</span>
          <span className="i-ph:caret-down" aria-hidden />
        </button>
        {open && (
          <div
            className="bolt-project-tool-menu"
            style={{
              left: menuPosition.left,
              top: menuPosition.top,
              maxHeight: '480px',
            }}
          >
            <div className="bolt-project-tool-menu-header">
              <div className="bolt-project-tool-search">
                <span className="i-ph:magnifying-glass" aria-hidden />
                <input
                  placeholder="Search tools and files..."
                  aria-label="Search tools and files"
                  value={toolQuery}
                  onChange={(event) => setToolQuery(event.target.value)}
                />
              </div>
            </div>
            <div className="bolt-project-tool-menu-body">
              {!normalizedToolQuery && (
                <>
                  <div className="bolt-project-tool-section">RECENT FILES</div>
                  {filteredRecentFiles.map((filePath) => (
                    <button
                      key={`recent-file-${filePath}`}
                      type="button"
                      className="bolt-project-tool-item"
                      onClick={(event) => {
                        onOpenFile?.(filePath, false);

                        if (event.nativeEvent.isTrusted) {
                          window.setTimeout(() => setOpen(false), 0);
                        } else {
                          setOpen(false);
                        }
                      }}
                    >
                      <span className="i-ph:file-code" aria-hidden />
                      <span>
                        <strong>{filePath.split('/').pop() || filePath}</strong>
                        <small>{filePath.replace(WORK_DIR, '')}</small>
                      </span>
                      <span className="bolt-project-tool-item-chevron i-ph:caret-right" aria-hidden />
                    </button>
                  ))}
                </>
              )}
              <div className="bolt-project-tool-section">TOOLS</div>
              {toolGroups.map(([category, groupTools]) => (
                <div key={category} className="bolt-project-tool-group">
                  <div className="bolt-project-tool-section">{category}</div>
                  {groupTools.map(([id, title, description, icon, color]) => (
                    <button
                      key={id}
                      type="button"
                      className="bolt-project-tool-item"
                      data-testid={`feature-${id}`}
                      onClick={(event) => {
                        onOpenTool?.(id);

                        if (event.nativeEvent.isTrusted) {
                          window.setTimeout(() => setOpen(false), 0);
                        } else {
                          setOpen(false);
                        }
                      }}
                    >
                      <span className={icon} style={{ color }} aria-hidden />
                      <span>
                        <strong>{title}</strong>
                        <small>{description}</small>
                      </span>
                      {tabs.some((tab) => tab.panel === id) && <em>Open</em>}
                      <span className="bolt-project-tool-item-chevron i-ph:caret-right" aria-hidden />
                    </button>
                  ))}
                </div>
              ))}
              {!filteredTools.length && (
                <div className="bolt-project-tool-empty">
                  <span className="i-ph:sparkle" aria-hidden />
                  <strong>No features found</strong>
                  <small>Try a different search term.</small>
                </div>
              )}
            </div>
            <div className="bolt-project-tool-footer">
              {filteredTools.length} feature{filteredTools.length === 1 ? '' : 's'} available
              {normalizedToolQuery ? ` matching "${toolQuery.trim()}"` : ''}
            </div>
          </div>
        )}
      </div>
      <div className="bolt-project-tool-popover">
        <button
          type="button"
          className="bolt-project-tab-action"
          aria-label="Tab actions"
          title="Tab actions"
          aria-expanded={actionsOpen}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => setActionsOpen((value) => !value)}
        >
          <span className="i-ph:dots-three" aria-hidden />
        </button>
        {actionsOpen && (
          <div className="bolt-project-tab-actions-menu">
            <button
              type="button"
              onClick={() => {
                onCloseOthers?.(activeTabId ?? tabs[0]?.id);
                setActionsOpen(false);
              }}
            >
              Close others
            </button>
            <button
              type="button"
              onClick={() => {
                onCloseToRight?.(activeTabId ?? tabs[0]?.id);
                setActionsOpen(false);
              }}
            >
              Close to right
            </button>
            <button
              type="button"
              onClick={() => {
                onCloseAll?.();
                setActionsOpen(false);
              }}
            >
              Close all
            </button>
            <button
              type="button"
              onClick={() => {
                onCloseAll?.();
                setActionsOpen(false);
              }}
            >
              Close saved
            </button>
            <button
              type="button"
              onClick={() => {
                onSplitActiveRight?.(activeTabId ?? tabs[0]?.id);
                setActionsOpen(false);
              }}
            >
              Split active right
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectWelcomeState({
  files,
  onOpenTool,
  onOpenFile,
}: {
  files: string[];
  onOpenTool?: (panel: IdeWorkspacePanel | IdeRightPanel) => void;
  onOpenFile?: (filePath: string) => void;
}) {
  const shortcuts: Array<[string, string, string, IdeWorkspacePanel | IdeRightPanel]> = [
    ['i-ph:files', 'Open Files', '⌘P', 'files'],
    ['i-ph:terminal-window', 'Open Terminal', '⌘`', 'terminal'],
    ['i-ph:browser', 'View Preview', '⌘⇧V', 'preview'],
    ['i-ph:command', 'All Commands', '⌘K', 'settings'],
  ];

  return (
    <div className="bolt-project-welcome">
      <div className="bolt-project-welcome-logo">
        <span className="i-ph:sparkle" aria-hidden />
      </div>
      <h2>Bienvenue dans votre projet</h2>
      <p>Ouvrez un outil ou demandez à l'agent de commencer.</p>
      <div className="bolt-project-welcome-grid">
        {shortcuts.map(([icon, label, shortcut, panel]) => (
          <button key={label} type="button" className="bolt-project-welcome-card" onClick={() => onOpenTool?.(panel)}>
            <span className={icon} aria-hidden />
            <strong>{label}</strong>
            <small>{shortcut}</small>
          </button>
        ))}
      </div>
      <div className="bolt-project-welcome-recents">
        <span>Récents</span>
        {files.length ? (
          files.map((file) => (
            <button key={file} type="button" onClick={() => onOpenFile?.(file)}>
              <span className="i-ph:file-code" aria-hidden />
              {file.replace(WORK_DIR, '')}
            </button>
          ))
        ) : (
          <small>No files loaded yet.</small>
        )}
      </div>
    </div>
  );
}

function ProjectIdePanelContent({
  panel,
  data,
  project,
  projectId,
  onSubmit,
  busy,
  reload,
}: {
  panel: string;
  data: any;
  project: any;
  projectId?: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  reload?: () => void | Promise<void>;
}) {
  if (panel === 'overview') {
    const rows = [
      ['Project', project.name ?? project.id],
      [
        'Workspace',
        data.workspace ? `${data.workspace.status} / ${data.workspace.runtimeMode}` : 'No workspace record',
      ],
      ['Files', String(data.files?.length ?? 0)],
      ['Branch', data.git?.branch ?? project.gitDefaultBranch ?? 'main'],
    ];

    return <PanelRows rows={rows} events={data.recentActivity} empty="No project activity yet." />;
  }

  if (panel === 'database') {
    return <ProjectDatabasePanel data={data} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'object-storage') {
    return <ProjectObjectStoragePanel data={data} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'packages') {
    return <ProjectPackagesPanel data={data} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'monitoring') {
    return <ProjectMonitoringPanel data={data} reload={reload} busy={busy} />;
  }

  if (panel === 'extensions') {
    return <ProjectExtensionsPanel data={data} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'integrations') {
    return <ProjectIntegrationsPanel data={data} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'workflows') {
    return <ProjectWorkflowsPanel data={data} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'security') {
    return <ProjectSecurityPanel data={data} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'logs') {
    return <ProjectLogsPanel data={data} reload={reload} busy={busy} />;
  }

  if (panel === 'snapshots') {
    const snapshots = data.snapshots ?? [];

    return (
      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <PanelRows
          rows={snapshots.map((snapshot: any) => [
            snapshot.label ?? snapshot.kind,
            `${snapshot.kind} - ${snapshot.byteLength ?? 0} bytes`,
          ])}
          empty="No snapshots yet."
        />
        <div className="grid gap-3">
          <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-bolt-elements-borderColor p-3">
            <input name="intent" value="create" type="hidden" />
            <PanelInput name="label" placeholder="Manual checkpoint" />
            <PanelButton disabled={busy}>Create snapshot</PanelButton>
          </form>
          {snapshots.map((snapshot: any) => (
            <form key={snapshot.id} onSubmit={onSubmit}>
              <input name="intent" value="restore" type="hidden" />
              <input name="snapshotId" value={snapshot.id} type="hidden" />
              <PanelButton disabled={busy} variant="outline">
                Restore {snapshot.label ?? snapshot.id}
              </PanelButton>
            </form>
          ))}
        </div>
      </div>
    );
  }

  if (panel === 'deployments') {
    const deployments = data.deployments ?? [];
    const latestDeployment = deployments[0];

    const inferredFramework = detectFrameworkFromDeployConfig({
      buildCommand: latestDeployment?.buildCommand,
      outputDirectory: latestDeployment?.outputDirectory,
    });

    return (
      <div className="bolt-project-deploy-tool">
        <section className="bolt-project-deploy-history">
          <div className="bolt-project-deploy-summary">
            <div>
              <span>Latest status</span>
              <strong>{latestDeployment?.status ?? 'No deployment'}</strong>
            </div>
            <div>
              <span>Environment</span>
              <strong>{latestDeployment?.environment ?? 'preview'}</strong>
            </div>
            <div>
              <span>Framework</span>
              <strong>{latestDeployment?.framework ?? inferredFramework}</strong>
            </div>
          </div>

          {deployments.length ? (
            deployments.map((deployment: any) => (
              <article key={deployment.id} className="bolt-project-deploy-card">
                <header>
                  <div>
                    <strong>
                      {deployment.provider} · {deployment.environment ?? 'preview'}
                    </strong>
                    <span>{deployment.url ?? deployment.customDomain ?? deployment.createdAt ?? 'URL pending'}</span>
                  </div>
                  <em data-status={deployment.status}>{deployment.status}</em>
                </header>
                <pre aria-label={`Deployment logs for ${deployment.id}`}>
                  {(deployment.logs ?? [])
                    .slice(-8)
                    .map((log: any) => `[${log.level ?? 'info'}] ${log.message}`)
                    .join('\n') || 'No deployment logs yet.'}
                </pre>
                <div className="bolt-project-deploy-actions">
                  {deployment.url && (
                    <a href={deployment.url} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  )}
                  <ProjectDeploymentAction
                    intent="redeploy"
                    deploymentId={deployment.id}
                    onSubmit={onSubmit}
                    busy={busy}
                  >
                    Redeploy
                  </ProjectDeploymentAction>
                  <ProjectDeploymentAction
                    intent="rollback"
                    deploymentId={deployment.id}
                    onSubmit={onSubmit}
                    busy={busy}
                  >
                    Rollback
                  </ProjectDeploymentAction>
                  <ProjectDeploymentAction intent="cancel" deploymentId={deployment.id} onSubmit={onSubmit} busy={busy}>
                    Cancel
                  </ProjectDeploymentAction>
                </div>
              </article>
            ))
          ) : (
            <div className="bolt-project-empty-panel">No deployments yet. Create one from the wizard.</div>
          )}
        </section>

        <form onSubmit={onSubmit} className="bolt-project-deploy-wizard">
          <h3>Deployment wizard</h3>
          <p>
            Uses the existing Bolt build defaults and records the SaaS deployment with quotas, audit logs and redacted
            output.
          </p>
          <label>
            Provider
            <select name="provider" defaultValue="static">
              {BOLT_DEPLOY_PROVIDERS.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Environment
            <select name="environment" defaultValue="preview">
              <option value="preview">Preview</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </label>
          <PanelInput name="buildCommand" defaultValue={DEFAULT_DEPLOY_BUILD_COMMAND} />
          <PanelInput name="outputDirectory" defaultValue={DEFAULT_DEPLOY_OUTPUT_DIRECTORY} />
          <PanelInput name="framework" placeholder={`Auto: ${inferredFramework}`} />
          <PanelInput name="branch" placeholder={project.gitDefaultBranch ?? 'main'} />
          <PanelInput name="repositoryUrl" defaultValue={project.gitRepositoryUrl ?? ''} />
          <PanelInput name="customDomain" />
          <textarea name="envVars" placeholder={'KEY=value\nANOTHER_KEY=value'} />
          <PanelInput name="injectSecrets" placeholder="DATABASE_URL,STRIPE_SECRET_KEY" />
          <label className="bolt-project-checkbox-row">
            <input name="previewDeployment" type="checkbox" defaultChecked />
            Create preview URL for non-production deploys
          </label>
          <PanelButton disabled={busy}>Deploy project</PanelButton>
        </form>
      </div>
    );
  }

  if (panel === 'env') {
    return <ProjectEnvPanel data={data} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'secrets') {
    return <ProjectSecretsPanel projectId={projectId} data={data} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'collaborators') {
    const collaborators = data.collaborators ?? [];
    const presence = data.presence ?? [];
    const comments = data.comments ?? [];
    const activity = data.activity ?? [];
    const shareLinks = data.shareLinks ?? [];
    const terminalPermissions = data.terminalPermissions ?? {};
    const aiConversation = data.aiConversation ?? { shared: false, mode: 'comment' };
    const realtime = data.realtime ?? { status: 'idle' };

    const realtimeLabel =
      realtime.status === 'connected'
        ? 'Live'
        : realtime.status === 'reconnecting'
          ? 'Reconnecting'
          : realtime.status === 'error'
            ? 'Offline'
            : 'Connecting';

    return (
      <div className="bolt-project-collaboration-tool">
        <section className="bolt-project-collaboration-card">
          <div className="bolt-project-collaboration-header">
            <div>
              <h3>Presence</h3>
              <p>{presence.length} online users with live cursor and selection sync.</p>
            </div>
            <span className="bolt-project-collaboration-live">{realtimeLabel}</span>
          </div>
          {realtime.error ? <div className="bolt-project-empty-panel">{realtime.error}</div> : null}
          <div className="bolt-project-collaboration-users">
            {presence.length ? (
              presence.map((user: any) => (
                <div key={user.sessionId} className="bolt-project-collaboration-user">
                  <span className="bolt-project-collaboration-avatar">{String(user.userId ?? 'U').slice(0, 2)}</span>
                  <div>
                    <strong>{user.userId}</strong>
                    <small>
                      {user.mode ?? 'editing'} {user.filePath ? `in ${user.filePath}` : ''}
                    </small>
                  </div>
                  <em>{user.status ?? 'online'}</em>
                </div>
              ))
            ) : (
              <div className="bolt-project-empty-panel">No active presence yet.</div>
            )}
          </div>
        </section>

        <section className="bolt-project-collaboration-card">
          <div className="bolt-project-collaboration-header">
            <div>
              <h3>Role-based collaborators</h3>
              <p>Project access is enforced by the backend before editing, comments and terminal access.</p>
            </div>
          </div>
          <div className="bolt-project-collaboration-list">
            {collaborators.length ? (
              collaborators.map((collaborator: any) => (
                <div key={collaborator.id} className="bolt-project-collaboration-row">
                  <span>{collaborator.userId}</span>
                  <strong>{collaborator.roleKey}</strong>
                  <form method="post" onSubmit={onSubmit}>
                    <input type="hidden" name="intent" value="terminal-permission" />
                    <input type="hidden" name="userId" value={collaborator.userId} />
                    <input
                      type="hidden"
                      name="allowed"
                      value={terminalPermissions[collaborator.userId]?.allowed ? 'false' : 'true'}
                    />
                    <PanelButton disabled={busy} variant="outline">
                      {terminalPermissions[collaborator.userId]?.allowed ? 'Revoke terminal' : 'Allow terminal'}
                    </PanelButton>
                  </form>
                </div>
              ))
            ) : (
              <div className="bolt-project-empty-panel">No project collaborators.</div>
            )}
          </div>
          <form onSubmit={onSubmit} className="bolt-project-collaboration-form">
            <PanelInput name="userId" placeholder="User ID" required />
            <select name="roleKey" defaultValue="member">
              {['viewer', 'member', 'admin', 'owner'].map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <PanelButton disabled={busy}>Invite to project</PanelButton>
          </form>
        </section>

        <section className="bolt-project-collaboration-card">
          <div className="bolt-project-collaboration-header">
            <div>
              <h3>Comments</h3>
              <p>Members can leave file comments without requiring a file lock.</p>
            </div>
          </div>
          <div className="bolt-project-collaboration-list">
            {comments.length ? (
              comments.slice(-6).map((comment: any) => (
                <div key={comment.id} className="bolt-project-collaboration-comment">
                  <strong>
                    {comment.filePath ?? 'Project'} {comment.line ? `:${comment.line}` : ''}
                  </strong>
                  <p>{comment.body}</p>
                  <small>{comment.userId}</small>
                </div>
              ))
            ) : (
              <div className="bolt-project-empty-panel">No comments yet.</div>
            )}
          </div>
          <form onSubmit={onSubmit} className="bolt-project-collaboration-form">
            <input type="hidden" name="intent" value="comment" />
            <PanelInput name="filePath" placeholder="src/App.tsx" />
            <PanelInput name="line" placeholder="Line" />
            <PanelInput name="body" placeholder="Comment" required />
            <PanelButton disabled={busy}>Add comment</PanelButton>
          </form>
        </section>

        <section className="bolt-project-collaboration-card">
          <div className="bolt-project-collaboration-header">
            <div>
              <h3>Sharing and pair programming</h3>
              <p>Expiring links, shared AI conversation policy and read-only modes stay scoped to this project.</p>
            </div>
          </div>
          <div className="bolt-project-collaboration-grid">
            <form onSubmit={onSubmit} className="bolt-project-collaboration-form">
              <input type="hidden" name="intent" value="share-link" />
              <select name="roleKey" defaultValue="viewer">
                <option value="viewer">Read-only link</option>
                <option value="member">Pair-programming link</option>
              </select>
              <PanelInput name="expiresInMinutes" placeholder="Expires in minutes" defaultValue="1440" />
              <PanelButton disabled={busy}>Create expiring link</PanelButton>
            </form>
            <form onSubmit={onSubmit} className="bolt-project-collaboration-form">
              <input type="hidden" name="intent" value="ai-sharing" />
              <input type="hidden" name="shared" value={aiConversation.shared ? 'false' : 'true'} />
              <select name="mode" defaultValue={aiConversation.mode ?? 'comment'}>
                <option value="read-only">AI read-only</option>
                <option value="comment">AI comments</option>
                <option value="pair-programming">AI pair programming</option>
              </select>
              <PanelButton disabled={busy} variant="outline">
                {aiConversation.shared ? 'Disable shared AI' : 'Enable shared AI'}
              </PanelButton>
            </form>
          </div>
          <PanelRows
            rows={shareLinks.map((link: any) => [link.roleKey, `Expires ${link.expiresAt}`])}
            empty="No active share links."
          />
        </section>

        <section className="bolt-project-collaboration-card">
          <div className="bolt-project-collaboration-header">
            <div>
              <h3>Activity feed</h3>
              <p>Collaboration actions create audit and project activity events.</p>
            </div>
          </div>
          <PanelRows
            rows={activity
              .slice(-8)
              .map((event: any) => [event.action, event.actorUserId ? `By ${event.actorUserId}` : 'System'])}
            empty="No collaboration activity yet."
          />
        </section>
      </div>
    );
  }

  if (panel === 'domains') {
    const domains = data.domains ?? [];

    return (
      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <PanelRows
          rows={domains.map((domain: any) => [
            domain.domain,
            domain.verifiedAt ? `Verified ${domain.verifiedAt}` : 'Pending DNS verification',
          ])}
          empty="No custom domains."
        />
        <div className="grid gap-3">
          <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-bolt-elements-borderColor p-3">
            <PanelInput name="domain" required />
            <PanelButton disabled={busy}>Add domain</PanelButton>
          </form>
          {domains.map((domain: any) => (
            <form key={domain.id} onSubmit={onSubmit}>
              <input name="intent" value="verify" type="hidden" />
              <input name="domain" value={domain.domain} type="hidden" />
              <PanelButton disabled={busy} variant="outline">
                Verify {domain.domain}
              </PanelButton>
            </form>
          ))}
        </div>
      </div>
    );
  }

  if (panel === 'git') {
    return <ProjectGitPanel data={data} project={project} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'settings') {
    const settings = data.project ?? project;

    return <ProjectSettingsPanel settings={settings} data={data} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'activity') {
    return (
      <PanelRows
        rows={(data.activity ?? []).map((event: any) => [
          event.action,
          event.createdAt ? new Date(event.createdAt).toLocaleString() : 'Recorded by API',
        ])}
        empty="No activity yet."
      />
    );
  }

  return <PanelRows rows={[]} empty="Panel not available." />;
}

function ProjectSettingsPanel({
  settings,
  data,
  onSubmit,
  busy,
}: {
  settings: any;
  data: any;
  onSubmit: any;
  busy: boolean;
}) {
  const [draft, setDraft] = useState({
    name: settings.name ?? '',
    description: settings.description ?? '',
    gitRepositoryUrl: settings.gitRepositoryUrl ?? '',
    gitDefaultBranch: settings.gitDefaultBranch ?? 'main',
  });

  const [settingsTab, setSettingsTab] = useState('project');
  const [memoryDraft, setMemoryDraft] = useState('');
  const [memoryType, setMemoryType] = useState('semantic');
  const [memoryTags, setMemoryTags] = useState('');
  const [memoryError, setMemoryError] = useState<string>();
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memories, setMemories] = useState<any[]>([]);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memoryEditId, setMemoryEditId] = useState<string>();
  const [memoryEditDraft, setMemoryEditDraft] = useState('');
  const [memoryEditType, setMemoryEditType] = useState('semantic');
  const [memoryEditTags, setMemoryEditTags] = useState('');
  const accountUser = data.account?.user ?? {};
  const sessions = data.sessions?.sessions ?? [];
  const state = data.settingsState ?? {};
  const preferences = state.preferences ?? { theme: 'dark', keyboardMode: false, creditAlertThreshold: 80 };
  const notifications = state.notifications ?? {};
  const secrets = data.secrets ?? [];
  const billing = data.billing ?? {};
  const aiUsage = data.aiUsage?.usage ?? [];

  const providers = [
    ['openai', 'OpenAI', 'OPENAI_API_KEY'],
    ['anthropic', 'Anthropic', 'ANTHROPIC_API_KEY'],
    ['google', 'Google', 'GOOGLE_API_KEY'],
    ['openrouter', 'OpenRouter', 'OPENROUTER_API_KEY'],
  ];
  const notificationRows = [
    ['agent', 'Agent', 'Agent needs help or finished working'],
    ['billing', 'Billing', 'Plan changes, quota warnings, payment updates'],
    ['deployment', 'Deployments', 'Deployment status changes'],
    ['security', 'Security', 'Security scan results and alerts'],
    ['team', 'Team', 'Team invitations and member changes'],
    ['system', 'System', 'System updates and maintenance notices'],
  ];
  const initials =
    String(accountUser.name ?? accountUser.email ?? settings.name ?? 'VC')
      .slice(0, 2)
      .toUpperCase() || 'VC';

  useEffect(() => {
    setDraft({
      name: settings.name ?? '',
      description: settings.description ?? '',
      gitRepositoryUrl: settings.gitRepositoryUrl ?? '',
      gitDefaultBranch: settings.gitDefaultBranch ?? 'main',
    });
  }, [settings.name, settings.description, settings.gitRepositoryUrl, settings.gitDefaultBranch]);

  function updateDraft(key: keyof typeof draft) {
    return (event: any) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  }

  function parseMemoryTags(value: string) {
    return [
      ...new Set(
        value
          .split(',')
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean),
      ),
    ].slice(0, 20);
  }

  const loadMemories = useCallback(async () => {
    if (!settings.id) {
      return;
    }

    setMemoryLoading(true);
    setMemoryError(undefined);

    try {
      const response = await fetch(`/api/agent-memory?projectId=${encodeURIComponent(settings.id)}&limit=30`, {
        headers: { accept: 'application/json' },
      });
      const preferenceResponse = await fetch(
        `/api/agent-memory/preferences?projectId=${encodeURIComponent(settings.id)}`,
        {
          headers: { accept: 'application/json' },
        },
      );

      const payload = (await response.json()) as { memories?: any[]; error?: string };

      const preferencePayload = (await preferenceResponse.json().catch(() => ({}))) as {
        preference?: { enabled?: boolean };
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load agent memory');
      }

      if (!preferenceResponse.ok) {
        throw new Error(preferencePayload.error ?? 'Unable to load agent memory preference');
      }

      setMemories(payload.memories ?? []);
      setMemoryEnabled(preferencePayload.preference?.enabled !== false);
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : 'Unable to load agent memory');
    } finally {
      setMemoryLoading(false);
    }
  }, [settings.id]);

  useEffect(() => {
    if (settingsTab === 'memory') {
      void loadMemories();
    }
  }, [loadMemories, settingsTab]);

  async function saveMemory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!memoryDraft.trim()) {
      return;
    }

    setMemoryLoading(true);
    setMemoryError(undefined);

    try {
      const response = await fetch('/api/agent-memory', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          scope: 'project',
          projectId: settings.id,
          content: memoryDraft,
          memoryType,
          tags: parseMemoryTags(memoryTags),
          source: 'manual',
          force: true,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to save memory');
      }

      setMemoryDraft('');
      setMemoryTags('');
      await loadMemories();
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : 'Unable to save memory');
    } finally {
      setMemoryLoading(false);
    }
  }

  async function deleteMemory(memoryId: string) {
    setMemoryLoading(true);
    setMemoryError(undefined);

    try {
      const response = await fetch(`/api/agent-memory/${encodeURIComponent(memoryId)}`, {
        method: 'DELETE',
        headers: { accept: 'application/json' },
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to delete memory');
      }

      await loadMemories();
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : 'Unable to delete memory');
    } finally {
      setMemoryLoading(false);
    }
  }

  async function toggleMemoryEnabled(enabled: boolean) {
    setMemoryLoading(true);
    setMemoryError(undefined);

    try {
      const response = await fetch('/api/agent-memory/preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ projectId: settings.id, enabled }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        preference?: { enabled?: boolean };
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to update agent memory preference');
      }

      setMemoryEnabled(payload.preference?.enabled !== false);
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : 'Unable to update agent memory preference');
    } finally {
      setMemoryLoading(false);
    }
  }

  function startEditMemory(memory: any) {
    setMemoryEditId(memory.id);
    setMemoryEditDraft(memory.content ?? memory.summary ?? '');
    setMemoryEditType(memory.memoryType ?? 'semantic');
    setMemoryEditTags(Array.isArray(memory.tags) ? memory.tags.join(', ') : '');
  }

  async function saveEditedMemory(memoryId: string) {
    if (!memoryEditDraft.trim()) {
      return;
    }

    setMemoryLoading(true);
    setMemoryError(undefined);

    try {
      const response = await fetch(`/api/agent-memory/${encodeURIComponent(memoryId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          content: memoryEditDraft,
          memoryType: memoryEditType,
          tags: parseMemoryTags(memoryEditTags),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to update memory');
      }

      setMemoryEditId(undefined);
      setMemoryEditDraft('');
      setMemoryEditTags('');
      await loadMemories();
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : 'Unable to update memory');
    } finally {
      setMemoryLoading(false);
    }
  }

  return (
    <div className="bolt-project-settings-hub" data-testid="settings-hub-panel">
      <header>
        <div>
          <h3>Account Settings</h3>
          <p>Project, identity, security, billing, AI credentials and IDE preferences backed by platform APIs.</p>
        </div>
        <a href={`/api/projects/${settings.id}/project-action?intent=export`} target="_blank" rel="noreferrer">
          Export project
        </a>
      </header>

      <nav aria-label="Settings sections">
        {[
          ['project', 'Project'],
          ['account', 'Account'],
          ['security', 'Security'],
          ['usage', 'Usage'],
          ['ai', 'AI'],
          ['memory', 'Memory'],
          ['preferences', 'Preferences'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-current={settingsTab === id ? 'page' : undefined}
            onClick={() => setSettingsTab(id)}
            data-testid={`button-settings-tab-${id}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {settingsTab === 'project' && (
        <form onSubmit={onSubmit} className="bolt-project-settings-card">
          <h4>Project Metadata</h4>
          <PanelInput name="name" value={draft.name} onChange={updateDraft('name')} required />
          <PanelInput name="description" value={draft.description} onChange={updateDraft('description')} />
          <PanelInput
            name="gitRepositoryUrl"
            value={draft.gitRepositoryUrl}
            onChange={updateDraft('gitRepositoryUrl')}
          />
          <PanelInput
            name="gitDefaultBranch"
            value={draft.gitDefaultBranch}
            onChange={updateDraft('gitDefaultBranch')}
          />
          <PanelButton disabled={busy || !draft.name.trim()}>Save settings</PanelButton>
        </form>
      )}

      {settingsTab === 'account' && (
        <div className="bolt-project-settings-grid">
          <form onSubmit={onSubmit} className="bolt-project-settings-card">
            <input name="intent" value="profile" type="hidden" />
            <h4>Profile</h4>
            <div className="bolt-project-settings-profile">
              <span>{initials}</span>
              <div>
                <strong>{accountUser.name ?? 'User'}</strong>
                <small>{accountUser.email ?? 'No email returned by API'}</small>
              </div>
            </div>
            <PanelInput name="name" defaultValue={accountUser.name ?? ''} required />
            <PanelInput name="email" type="email" defaultValue={accountUser.email ?? ''} required />
            <PanelButton disabled={busy}>Save profile</PanelButton>
          </form>

          <section className="bolt-project-settings-card">
            <h4>Connected Accounts & Data</h4>
            <PanelRows
              rows={[
                ['Email verification', accountUser.emailVerifiedAt ? 'Verified' : 'Not verified'],
                ['GitHub', accountUser.githubId ? 'Connected' : 'Not connected'],
                ['Account export', 'JSON export includes profile, sessions, orgs, projects, usage and AI costs'],
              ]}
            />
            {!accountUser.emailVerifiedAt && (
              <form onSubmit={onSubmit}>
                <input name="intent" value="send-verification" type="hidden" />
                <PanelButton disabled={busy} variant="outline">
                  Send verification email
                </PanelButton>
              </form>
            )}
            <a href="/auth/oauth/github">Connect GitHub</a>
            <a href="/api/auth/export" target="_blank" rel="noreferrer">
              Export account JSON
            </a>
          </section>
        </div>
      )}

      {settingsTab === 'security' && (
        <div className="bolt-project-settings-grid">
          <form onSubmit={onSubmit} className="bolt-project-settings-card">
            <input name="intent" value="change-password" type="hidden" />
            <h4>Change Password</h4>
            <PanelInput name="currentPassword" type="password" placeholder="Current password" required />
            <PanelInput name="newPassword" type="password" placeholder="New password, minimum 8 characters" required />
            <PanelButton disabled={busy}>Update password</PanelButton>
            <small>Successful password changes revoke other sessions through the API.</small>
          </form>

          <section className="bolt-project-settings-card">
            <h4>Active Sessions</h4>
            <div className="bolt-project-settings-list">
              {sessions.length ? (
                sessions.slice(0, 8).map((session: any) => (
                  <form key={session.id} onSubmit={onSubmit}>
                    <input name="intent" value="revoke-session" type="hidden" />
                    <input name="sessionId" value={session.id} type="hidden" />
                    <span>
                      <strong>{session.userAgent ?? 'Session'}</strong>
                      <small>
                        {session.expiresAt ? `Expires ${new Date(session.expiresAt).toLocaleString()}` : session.id}
                      </small>
                    </span>
                    <button disabled={busy}>Revoke</button>
                  </form>
                ))
              ) : (
                <div className="bolt-project-empty-panel">No active sessions returned by API.</div>
              )}
            </div>
            <form onSubmit={onSubmit}>
              <input name="intent" value="logout-all" type="hidden" />
              <PanelButton disabled={busy} variant="outline">
                Sign out other sessions
              </PanelButton>
            </form>
          </section>

          <section className="bolt-project-settings-card danger">
            <h4>Danger Zone</h4>
            <p>
              Permanently delete this account. The API audits the request, deletes the user, and clears this session.
            </p>
            <form onSubmit={onSubmit}>
              <input name="intent" value="delete-account" type="hidden" />
              <label>
                Type DELETE MY ACCOUNT to confirm
                <input name="confirmation" placeholder="DELETE MY ACCOUNT" required />
              </label>
              <PanelButton disabled={busy} variant="outline">
                Delete account
              </PanelButton>
            </form>
          </section>
        </div>
      )}

      {settingsTab === 'usage' && (
        <div className="bolt-project-settings-grid">
          <section className="bolt-project-settings-card">
            <h4>Billing & Plan</h4>
            <PanelRows
              rows={[
                ['Plan', billing.plan?.name ?? billing.plan?.key ?? 'No billing plan returned'],
                ['Subscription', billing.subscription?.status ?? billing.error ?? 'No active subscription'],
                ['Usage events', String(billing.usage?.length ?? 0)],
                ['Limits', billing.limits ? Object.keys(billing.limits).join(', ') : 'No limits returned'],
              ]}
            />
            <a href="/billing" target="_blank" rel="noreferrer">
              Open billing management
            </a>
          </section>

          <section className="bolt-project-settings-card">
            <h4>AI Usage & Costs</h4>
            <PanelRows
              rows={
                aiUsage.length
                  ? aiUsage
                      .slice(0, 10)
                      .map((item: any) => [
                        item.provider ?? item.model ?? item.type ?? 'AI call',
                        `${item.inputTokens ?? item.promptTokens ?? 0} in / ${item.outputTokens ?? item.completionTokens ?? 0} out`,
                      ])
                  : [['Usage', data.aiUsage?.error ?? 'No AI usage recorded yet']]
              }
            />
          </section>
        </div>
      )}

      {settingsTab === 'ai' && (
        <section className="bolt-project-settings-card">
          <h4>AI Credentials per Project</h4>
          <div className="bolt-project-settings-provider-grid">
            {providers.map(([provider, label, secretKey]) => {
              const configured = secrets.some((secret: any) => secret.key === secretKey);
              const mode = state.aiCredentials?.[provider]?.mode ?? 'managed';

              return (
                <article key={provider}>
                  <div>
                    <strong>{label}</strong>
                    <small>
                      {mode === 'byok'
                        ? configured
                          ? 'BYOK key configured'
                          : 'BYOK enabled, key missing'
                        : 'Managed credits'}
                    </small>
                  </div>
                  <form onSubmit={onSubmit}>
                    <input name="intent" value="ai-credential-mode" type="hidden" />
                    <input name="provider" value={provider} type="hidden" />
                    <select name="mode" defaultValue={mode}>
                      <option value="managed">Managed</option>
                      <option value="byok">BYOK</option>
                    </select>
                    <button disabled={busy}>Save mode</button>
                  </form>
                  <form onSubmit={onSubmit}>
                    <input name="intent" value="save-ai-key" type="hidden" />
                    <input name="provider" value={provider} type="hidden" />
                    <input name="apiKey" type="password" placeholder={`${label} API key`} required />
                    <button disabled={busy}>Save key</button>
                  </form>
                  {configured && (
                    <form onSubmit={onSubmit}>
                      <input name="intent" value="delete-ai-key" type="hidden" />
                      <input name="provider" value={provider} type="hidden" />
                      <button disabled={busy}>Remove key</button>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {settingsTab === 'memory' && (
        <div className="bolt-project-settings-grid">
          <form onSubmit={saveMemory} className="bolt-project-settings-card">
            <h4>Persistent Agent Memory</h4>
            <p>
              Project-scoped memories are embedded with the configured backend provider and retrieved before future IDE
              agent runs.
            </p>
            <label className="bolt-project-memory-toggle">
              <input
                type="checkbox"
                checked={memoryEnabled}
                onChange={(event) => void toggleMemoryEnabled(event.target.checked)}
                disabled={memoryLoading}
              />
              <span>
                <strong>Use memory in future agent responses</strong>
                <small>
                  {memoryEnabled
                    ? 'Retrieval and automatic capture are enabled.'
                    : 'Stored memories stay visible but are not injected.'}
                </small>
              </span>
            </label>
            <label>
              New memory
              <textarea
                value={memoryDraft}
                onChange={(event) => setMemoryDraft(event.target.value)}
                placeholder="Example: Always push to main after validation checks pass."
                rows={5}
              />
            </label>
            <div className="bolt-project-memory-fields">
              <label>
                Type
                <select value={memoryType} onChange={(event) => setMemoryType(event.target.value)}>
                  <option value="semantic">Semantic</option>
                  <option value="procedural">Procedural</option>
                  <option value="episodic">Episodic</option>
                  <option value="working">Working</option>
                  <option value="cache">Cache</option>
                </select>
              </label>
              <label>
                Tags
                <input
                  value={memoryTags}
                  onChange={(event) => setMemoryTags(event.target.value)}
                  placeholder="validation, workflow"
                />
              </label>
            </div>
            <PanelButton disabled={memoryLoading || !memoryDraft.trim()}>Save memory</PanelButton>
            {memoryError ? (
              <div className="bolt-project-settings-memory-error" role="alert">
                <span>{memoryError}</span>
                <button type="button" onClick={() => void loadMemories()} disabled={memoryLoading}>
                  Retry
                </button>
              </div>
            ) : null}
          </form>

          <section className="bolt-project-settings-card">
            <div className="bolt-project-memory-card-header">
              <h4>Stored Memories</h4>
              <a
                href={`/api/agent-memory/export?projectId=${encodeURIComponent(settings.id)}`}
                target="_blank"
                rel="noreferrer"
              >
                Export JSON
              </a>
            </div>
            {memoryLoading && !memories.length ? (
              <div className="bolt-project-memory-skeleton" role="status">
                <span />
                <span />
                <span />
              </div>
            ) : memories.length ? (
              <div className="bolt-project-settings-list">
                {memories.map((memory) => (
                  <article key={memory.id} className="bolt-project-memory-row">
                    {memoryEditId === memory.id ? (
                      <div className="bolt-project-memory-edit">
                        <textarea
                          value={memoryEditDraft}
                          onChange={(event) => setMemoryEditDraft(event.target.value)}
                          rows={4}
                        />
                        <div className="bolt-project-memory-fields">
                          <label>
                            Type
                            <select value={memoryEditType} onChange={(event) => setMemoryEditType(event.target.value)}>
                              <option value="semantic">Semantic</option>
                              <option value="procedural">Procedural</option>
                              <option value="episodic">Episodic</option>
                              <option value="working">Working</option>
                              <option value="cache">Cache</option>
                            </select>
                          </label>
                          <label>
                            Tags
                            <input
                              value={memoryEditTags}
                              onChange={(event) => setMemoryEditTags(event.target.value)}
                              placeholder="validation, workflow"
                            />
                          </label>
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={() => void saveEditedMemory(memory.id)}
                            disabled={memoryLoading || !memoryEditDraft.trim()}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMemoryEditId(undefined);
                              setMemoryEditDraft('');
                              setMemoryEditTags('');
                            }}
                            disabled={memoryLoading}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span>
                          <strong>{memory.summary}</strong>
                          <small>
                            {memory.scope} - {memory.memoryType ?? 'semantic'} - importance{' '}
                            {Math.round((memory.importance ?? 0) * 100)}% - used {memory.accessCount ?? 0}x -{' '}
                            {memory.updatedAt ? new Date(memory.updatedAt).toLocaleString() : 'stored'}
                          </small>
                          {Array.isArray(memory.tags) && memory.tags.length ? (
                            <span className="bolt-project-memory-tags">
                              {memory.tags.map((tag: string) => (
                                <em key={tag}>{tag}</em>
                              ))}
                            </span>
                          ) : null}
                        </span>
                        <div className="bolt-project-memory-actions">
                          <button type="button" onClick={() => startEditMemory(memory)} disabled={memoryLoading}>
                            Edit
                          </button>
                          <button type="button" onClick={() => void deleteMemory(memory.id)} disabled={memoryLoading}>
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="bolt-project-empty-panel">No persistent memories stored for this project yet.</div>
            )}
          </section>
        </div>
      )}

      {settingsTab === 'preferences' && (
        <div className="bolt-project-settings-grid">
          <form onSubmit={onSubmit} className="bolt-project-settings-card">
            <input name="intent" value="preferences" type="hidden" />
            <h4>Appearance & Keyboard</h4>
            <label>
              Theme
              <select name="theme" defaultValue={preferences.theme}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
            </label>
            <label>
              Keyboard mode
              <select name="keyboardMode" defaultValue={String(Boolean(preferences.keyboardMode))}>
                <option value="false">Disabled</option>
                <option value="true">Enabled for tablet hardware keyboards</option>
              </select>
            </label>
            <label>
              Credit alert threshold
              <input
                name="creditAlertThreshold"
                type="number"
                min="10"
                max="100"
                defaultValue={preferences.creditAlertThreshold ?? 80}
              />
            </label>
            <PanelButton disabled={busy}>Save preferences</PanelButton>
          </form>

          <section className="bolt-project-settings-card">
            <h4>Notification Preferences</h4>
            <div className="bolt-project-settings-list">
              {notificationRows.map(([key, label, desc]) => {
                const enabled = notifications[key] !== false;

                return (
                  <form key={key} onSubmit={onSubmit}>
                    <input name="intent" value="notification" type="hidden" />
                    <input name="key" value={key} type="hidden" />
                    <input name="enabled" value={String(!enabled)} type="hidden" />
                    <span>
                      <strong>{label}</strong>
                      <small>{desc}</small>
                    </span>
                    <button disabled={busy}>{enabled ? 'On' : 'Off'}</button>
                  </form>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ProjectObjectStoragePanel({ data, onSubmit, busy }: { data: any; onSubmit: any; busy: boolean }) {
  const storageVars = (data.envVars ?? []).filter((item: any) => /S3|STORAGE|BUCKET|R2/i.test(item.key));
  const exportCount = (data.recentActivity ?? []).filter((event: any) => event.action === 'project.export_zip').length;
  const [prefix, setPrefix] = useState('');
  const files = (data.files ?? []) as Array<{ path?: string; sizeBytes?: number; updatedAt?: string }>;

  const objects: Array<{ key: string; size: string; status: string }> = files
    .filter((file: any) => String(file.path ?? '').startsWith(prefix))
    .slice(0, 24)
    .map((file: any) => ({
      key: String(file.path ?? ''),
      size: typeof file.sizeBytes === 'number' ? `${Math.ceil(file.sizeBytes / 1024)} KB` : 'unknown size',
      status: file.updatedAt ? new Date(file.updatedAt).toLocaleString() : 'stored',
    }));

  const [selectedObject, setSelectedObject] = useState('');

  return (
    <div className="bolt-project-managed-panel">
      <section>
        <div className="bolt-project-panel-toolbar">
          <label>
            Project file prefix
            <input value={prefix} onChange={(event) => setPrefix(event.target.value)} />
          </label>
          <button type="button" onClick={() => setSelectedObject(objects[0]?.key ?? '')} disabled={!objects.length}>
            Select first file
          </button>
        </div>
        {objects.length ? (
          <div className="bolt-project-object-grid">
            {objects.map((object) => (
              <button
                key={object.key}
                type="button"
                className={selectedObject === object.key ? 'selected' : ''}
                onClick={() => setSelectedObject(object.key)}
              >
                <strong>{object.key}</strong>
                <span>{object.size}</span>
                <em>{object.status}</em>
              </button>
            ))}
          </div>
        ) : (
          <div className="bolt-project-empty-panel">
            {prefix ? 'No backend project files match this prefix.' : 'No backend project files are stored yet.'}
          </div>
        )}
        <PanelRows
          rows={
            storageVars.length
              ? storageVars.map((item: any) => [item.key, item.updatedAt ?? 'Stored in project environment'])
              : [
                  ['Storage provider', 'No object storage bucket configured in backend env'],
                  ['Backend exports', `${exportCount} project exports recorded`],
                ]
          }
          empty="Object storage is not configured for this project."
        />
      </section>
      <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-bolt-elements-borderColor p-3">
        <input name="intent" value="config" type="hidden" />
        <PanelInput name="key" placeholder="OBJECT_STORAGE_BUCKET" defaultValue="OBJECT_STORAGE_BUCKET" required />
        <PanelInput name="value" placeholder="vibecore-project-assets" required />
        <PanelButton disabled={busy}>Save storage config</PanelButton>
        <button
          type="submit"
          name="intent"
          value="export"
          className="inline-flex h-9 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
          disabled={busy}
        >
          Export project archive
        </button>
      </form>
    </div>
  );
}

function ProjectPackagesPanel({ data, onSubmit, busy }: { data: any; onSubmit: any; busy: boolean }) {
  const [query, setQuery] = useState('');
  const storedPlan = (data.envVars ?? []).find((item: any) => item.key === 'PACKAGE_INSTALL_PLAN')?.value;

  const [pendingPackages, setPendingPackages] = useState<string[]>(
    typeof storedPlan === 'string'
      ? storedPlan
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
  );

  const packageFiles = (data.files ?? []).filter((file: any) => String(file.path ?? '').endsWith('package.json'));
  const visiblePackages = pendingPackages.filter((pkg) => pkg.toLowerCase().includes(query.toLowerCase()));

  function addPackage() {
    const value = query.trim();

    if (!value || pendingPackages.includes(value)) {
      return;
    }

    setPendingPackages((current) => [...current, value]);
    setQuery('');
  }

  return (
    <div className="bolt-project-managed-panel">
      <section>
        <div className="bolt-project-panel-toolbar">
          <label>
            Search packages
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="lucide-react" />
          </label>
          <button type="button" onClick={addPackage} disabled={!query.trim()}>
            Add to plan
          </button>
        </div>
        <div className="bolt-project-package-list">
          {visiblePackages.map((pkg) => (
            <button
              key={pkg}
              type="button"
              className="pending"
              onClick={() => setPendingPackages((items) => items.filter((item) => item !== pkg))}
            >
              <strong>{pkg}</strong>
              <span>planned - click to remove</span>
            </button>
          ))}
          {!visiblePackages.length && (
            <div className="bolt-project-empty-panel">
              {pendingPackages.length
                ? 'No planned package matches this search.'
                : 'No backend package plan saved yet.'}
            </div>
          )}
        </div>
      </section>
      <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-bolt-elements-borderColor p-3">
        <input name="intent" value="save-plan" type="hidden" />
        <input name="packages" value={pendingPackages.join(',')} type="hidden" />
        <PanelRows
          rows={[
            [
              'Package manifests',
              packageFiles.length
                ? packageFiles.map((file: any) => file.path).join(', ')
                : 'No package.json found in backend project files',
            ],
            ['Files indexed', String(data.files?.length ?? 0)],
            ['Planned installs', pendingPackages.length ? pendingPackages.join(', ') : 'No pending package changes'],
          ]}
        />
        <PanelButton disabled={busy || pendingPackages.length === 0}>Save install plan</PanelButton>
      </form>
    </div>
  );
}

function ProjectMonitoringPanel({
  data,
  reload,
  busy,
}: {
  data: any;
  reload?: () => void | Promise<void>;
  busy: boolean;
}) {
  const [windowSize, setWindowSize] = useState<'15m' | '1h' | '24h'>('1h');
  const deployments = data.deployments ?? [];
  const activityCount = data.recentActivity?.length ?? 0;
  const workspaceStatus = data.workspace?.status ?? 'inactive';

  const metrics = [
    ['Workspace', workspaceStatus, data.workspace?.runtimeMode ?? 'No runtime session'],
    ['Deployments', String(deployments.length), deployments[0]?.status ?? 'No deployment'],
    ['Activity events', String(activityCount), `${windowSize} backend view`],
    ['Tracked files', String(data.files?.length ?? 0), `${windowSize} window`],
  ];

  return (
    <div className="bolt-project-monitoring-panel">
      <div className="bolt-project-panel-toolbar">
        {(['15m', '1h', '24h'] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={windowSize === item ? 'selected' : ''}
            onClick={() => setWindowSize(item)}
          >
            {item}
          </button>
        ))}
        <button type="button" onClick={() => void reload?.()} disabled={busy}>
          {busy ? 'Refreshing' : 'Refresh metrics'}
        </button>
      </div>
      <div className="bolt-project-metric-grid">
        {metrics.map(([label, value, detail]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </div>
      <PanelRows
        rows={(data.recentActivity ?? [])
          .slice(0, 8)
          .map((event: any) => [
            event.action,
            event.createdAt ? new Date(event.createdAt).toLocaleString() : 'Recorded by API',
          ])}
        empty="No monitoring events yet."
      />
    </div>
  );
}

function ProjectExtensionsPanel({ data, onSubmit, busy }: { data: any; onSubmit: any; busy: boolean }) {
  const envInstalled = String((data.envVars ?? []).find((item: any) => item.key === 'VIBECORE_EXTENSIONS')?.value ?? '')
    .split(',')
    .map((extension) => extension.trim())
    .filter(Boolean);
  const deploymentInstalled = (data.deployments ?? [])
    .filter((deployment: any) => String(deployment.provider ?? '').startsWith('extension:'))
    .map((deployment: any) => deployment.provider.replace('extension:', ''));

  const installed = Array.from(new Set([...envInstalled, ...deploymentInstalled]));
  const [selected, setSelected] = useState(installed[0] ?? '');

  return (
    <div className="bolt-project-managed-panel">
      <section className="bolt-project-extension-catalog">
        {installed.length ? (
          installed.map((extension) => (
            <button
              key={extension}
              type="button"
              className={selected === extension ? 'selected' : ''}
              onClick={() => setSelected(extension)}
            >
              <strong>{extension}</strong>
              <span>Persisted in backend project environment</span>
              <em>Installed</em>
            </button>
          ))
        ) : (
          <div className="bolt-project-empty-panel">No backend extension records for this project.</div>
        )}
      </section>
      <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-bolt-elements-borderColor p-3">
        <input name="installedExtensions" value={installed.join(',')} type="hidden" />
        <PanelInput
          name="extension"
          placeholder="supabase, stripe, sentry"
          value={selected}
          onChange={(event: any) => setSelected(event.target.value)}
          required
        />
        <PanelRows
          rows={installed.map((name: string) => [name, 'Stored in VIBECORE_EXTENSIONS'])}
          empty="No project extensions installed yet."
        />
        <PanelButton disabled={busy || !selected.trim() || installed.includes(selected)}>
          {installed.includes(selected) ? 'Already installed' : 'Persist extension'}
        </PanelButton>
      </form>
    </div>
  );
}

function ProjectWorkflowsPanel({ data, onSubmit, busy }: { data: any; onSubmit: any; busy: boolean }) {
  const state = data.workflowsState ?? {};

  const workflows = (state.workflows ?? []).slice().sort((left: any, right: any) => {
    if (left.isGenerated !== right.isGenerated) {
      return left.isGenerated ? -1 : 1;
    }

    return String(left.name ?? '').localeCompare(String(right.name ?? ''));
  });

  const runs = state.runs ?? [];
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(workflows[0]?.id ?? null);
  const filtered = workflows.filter((workflow: any) => workflow.name.toLowerCase().includes(query.toLowerCase()));
  const agentWorkflows = filtered.filter((workflow: any) => workflow.isGenerated);
  const userWorkflows = filtered.filter((workflow: any) => !workflow.isGenerated);
  const latestRun = runs[0];
  const workspace = data.workspace;

  function WorkflowSection({ title, items, empty }: { title: string; items: any[]; empty: string }) {
    return (
      <section className="bolt-project-workflows-section">
        <h4>{title}</h4>
        {items.length ? (
          items.map((workflow) => <WorkflowItem key={workflow.id} workflow={workflow} />)
        ) : (
          <div className="bolt-project-empty-panel">{empty}</div>
        )}
      </section>
    );
  }

  function WorkflowItem({ workflow }: { workflow: any }) {
    const expanded = expandedId === workflow.id;
    const tasks = (workflow.tasks ?? []).slice().sort((left: any, right: any) => left.orderIndex - right.orderIndex);
    const workflowRuns = runs.filter((run: any) => run.workflowId === workflow.id).slice(0, 3);

    return (
      <article className="bolt-project-workflow-card" data-testid={`workflow-item-${workflow.id}`}>
        <header>
          <button type="button" onClick={() => setExpandedId(expanded ? null : workflow.id)}>
            <span className={expanded ? 'i-ph:caret-down' : 'i-ph:caret-right'} aria-hidden />
            <strong>{workflow.name}</strong>
          </button>
          <div>
            {workflow.isRunButton && <em data-kind="run-button">Run Button</em>}
            {workflow.isGenerated && <em>Generated</em>}
            {workflow.lastRunStatus && <em data-status={workflow.lastRunStatus}>{workflow.lastRunStatus}</em>}
            <form onSubmit={onSubmit}>
              <input type="hidden" name="intent" value="run-workflow" />
              <input type="hidden" name="workflowId" value={workflow.id} />
              <PanelButton disabled={busy || workflow.enabled === false}>
                <span className="i-ph:play" aria-hidden />
                Run
              </PanelButton>
            </form>
          </div>
        </header>

        <small>
          {tasks.length} task{tasks.length === 1 ? '' : 's'} · {workflow.executionMode}
          {workflow.lastRunAt ? ` · last run ${new Date(workflow.lastRunAt).toLocaleString()}` : ''}
        </small>

        {!expanded && (
          <div className="bolt-project-workflow-add-task compact">
            {[
              ['shell', 'Shell Command', 'i-ph:terminal-window'],
              ['packages', 'Install Packages', 'i-ph:package'],
              ['workflow', 'Run Workflow', 'i-ph:play-circle'],
            ].map(([taskType, label, icon]) => (
              <form key={taskType} onSubmit={onSubmit}>
                <input type="hidden" name="intent" value="add-task" />
                <input type="hidden" name="workflowId" value={workflow.id} />
                <input type="hidden" name="taskType" value={taskType} />
                <PanelButton
                  disabled={busy}
                  variant="outline"
                  data-testid={`quick-add-${taskType}-task-${workflow.id}`}
                >
                  <span className={icon} aria-hidden />
                  {label}
                </PanelButton>
              </form>
            ))}
          </div>
        )}

        {workflowRuns.length ? (
          <section className="bolt-project-workflow-runs">
            <strong>Recent runs</strong>
            {workflowRuns.map((run: any) => (
              <details key={run.id} open={run.id === latestRun?.id}>
                <summary>
                  <span data-status={run.status}>{run.status}</span>
                  <small>{new Date(run.startedAt).toLocaleString()}</small>
                </summary>
                <pre>
                  {(run.logs ?? []).map((log: any) => `[${log.level}] ${log.message}`).join('\n') ||
                    'No output captured.'}
                </pre>
              </details>
            ))}
          </section>
        ) : null}

        {expanded && (
          <div className="bolt-project-workflow-details">
            <form onSubmit={onSubmit} className="bolt-project-workflow-form">
              <input type="hidden" name="intent" value="update-workflow" />
              <input type="hidden" name="workflowId" value={workflow.id} />
              <label>
                Workflow
                <PanelInput name="name" defaultValue={workflow.name} data-testid={`workflow-name-${workflow.id}`} />
              </label>
              <label>
                Mode
                <select name="executionMode" defaultValue={workflow.executionMode}>
                  <option value="sequential">Sequential</option>
                  <option value="parallel">Parallel</option>
                </select>
              </label>
              <input type="hidden" name="enabled" value={workflow.enabled === false ? 'false' : 'true'} />
              <PanelButton disabled={busy}>Save workflow</PanelButton>
            </form>

            <div className="bolt-project-workflow-task-list">
              <div className="bolt-project-workflow-subhead">
                <strong>Tasks</strong>
                <span>{workflow.executionMode === 'parallel' ? 'Run together' : 'Run in order'}</span>
              </div>
              {tasks.map((task: any, index: number) => (
                <article key={task.id} className="bolt-project-workflow-task" data-testid={`workflow-task-${task.id}`}>
                  <div>
                    <span
                      className={
                        task.taskType === 'packages'
                          ? 'i-ph:package'
                          : task.taskType === 'workflow'
                            ? 'i-ph:play-circle'
                            : 'i-ph:terminal-window'
                      }
                      aria-hidden
                    />
                    <strong>
                      {task.taskType === 'packages'
                        ? 'Install Packages'
                        : task.taskType === 'workflow'
                          ? 'Run Workflow'
                          : 'Shell Command'}
                    </strong>
                    <small>
                      {task.taskType === 'workflow'
                        ? `Workflow #${task.targetWorkflowId ?? 'not selected'}`
                        : task.command}
                    </small>
                  </div>
                  <form onSubmit={onSubmit} className="bolt-project-workflow-task-form">
                    <input type="hidden" name="intent" value="update-task" />
                    <input type="hidden" name="workflowId" value={workflow.id} />
                    <input type="hidden" name="taskId" value={task.id} />
                    <select name="taskType" defaultValue={task.taskType} data-testid={`task-type-${task.id}`}>
                      <option value="shell">Shell Command</option>
                      <option value="packages">Install Packages</option>
                      <option value="workflow">Run Workflow</option>
                    </select>
                    <PanelInput
                      name="command"
                      defaultValue={task.command ?? ''}
                      placeholder={task.taskType === 'packages' ? 'pnpm install' : 'npm run dev'}
                      data-testid={`task-command-${task.id}`}
                    />
                    <select name="targetWorkflowId" defaultValue={task.targetWorkflowId ?? ''}>
                      <option value="">No target workflow</option>
                      {workflows
                        .filter((item: any) => item.id !== workflow.id)
                        .map((item: any) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                    <PanelButton disabled={busy}>Save task</PanelButton>
                  </form>
                  <div className="bolt-project-workflow-task-actions">
                    <form onSubmit={onSubmit}>
                      <input type="hidden" name="intent" value="move-task" />
                      <input type="hidden" name="workflowId" value={workflow.id} />
                      <input type="hidden" name="taskId" value={task.id} />
                      <input type="hidden" name="direction" value="up" />
                      <PanelButton disabled={busy || index === 0} variant="outline">
                        Up
                      </PanelButton>
                    </form>
                    <form onSubmit={onSubmit}>
                      <input type="hidden" name="intent" value="move-task" />
                      <input type="hidden" name="workflowId" value={workflow.id} />
                      <input type="hidden" name="taskId" value={task.id} />
                      <input type="hidden" name="direction" value="down" />
                      <PanelButton disabled={busy || index === tasks.length - 1} variant="outline">
                        Down
                      </PanelButton>
                    </form>
                    <form onSubmit={onSubmit}>
                      <input type="hidden" name="intent" value="delete-task" />
                      <input type="hidden" name="workflowId" value={workflow.id} />
                      <input type="hidden" name="taskId" value={task.id} />
                      <PanelButton disabled={busy} variant="outline">
                        Remove
                      </PanelButton>
                    </form>
                  </div>
                </article>
              ))}
              {!tasks.length && <div className="bolt-project-empty-panel">No tasks configured for this workflow.</div>}
            </div>

            <div className="bolt-project-workflow-add-task">
              {[
                ['shell', 'Shell Command', 'i-ph:terminal-window'],
                ['packages', 'Install Packages', 'i-ph:package'],
                ['workflow', 'Run Workflow', 'i-ph:play-circle'],
              ].map(([taskType, label, icon]) => (
                <form key={taskType} onSubmit={onSubmit}>
                  <input type="hidden" name="intent" value="add-task" />
                  <input type="hidden" name="workflowId" value={workflow.id} />
                  <input type="hidden" name="taskType" value={taskType} />
                  <PanelButton disabled={busy} variant="outline" data-testid={`add-${taskType}-task-${workflow.id}`}>
                    <span className={icon} aria-hidden />
                    {label}
                  </PanelButton>
                </form>
              ))}
            </div>

            <footer>
              <form onSubmit={onSubmit}>
                <input type="hidden" name="intent" value="set-run-button" />
                <input type="hidden" name="workflowId" value={workflow.id} />
                <PanelButton disabled={busy || workflow.isRunButton} variant="outline">
                  {workflow.isRunButton ? 'Assigned to Run Button' : 'Assign to Run Button'}
                </PanelButton>
              </form>
              {!workflow.isSystem && (
                <form onSubmit={onSubmit}>
                  <input type="hidden" name="intent" value="delete-workflow" />
                  <input type="hidden" name="workflowId" value={workflow.id} />
                  <PanelButton disabled={busy} variant="outline">
                    Delete Workflow
                  </PanelButton>
                </form>
              )}
            </footer>
          </div>
        )}
      </article>
    );
  }

  return (
    <div className="bolt-project-workflows-tool" data-testid="workflows-panel">
      <header className="bolt-project-workflows-head">
        <div>
          <h3>Workflows</h3>
          <p>
            Project automation runs against the active isolated workspace
            {workspace?.id ? ` (${workspace.id})` : ''}.
          </p>
        </div>
        <button type="button" onClick={() => setCreateOpen((value) => !value)} data-testid="new-workflow-button">
          <span className="i-ph:plus" aria-hidden />
          New Workflow
        </button>
      </header>

      <div className="bolt-project-workflows-toolbar">
        <label>
          <span className="i-ph:magnifying-glass" aria-hidden />
          <input
            placeholder="Search for a workflow..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-testid="search-workflows"
          />
        </label>
        <a href="/docs" target="_blank" rel="noreferrer">
          Configure workflows
          <span className="i-ph:arrow-square-out" aria-hidden />
        </a>
      </div>

      {createOpen && (
        <form onSubmit={onSubmit} className="bolt-project-workflow-create" data-testid="create-workflow-form">
          <input type="hidden" name="intent" value="create-workflow" />
          <PanelInput name="name" placeholder="My Workflow" required data-testid="workflow-name-input" />
          <select name="executionMode" defaultValue="sequential">
            <option value="sequential">Sequential</option>
            <option value="parallel">Parallel</option>
          </select>
          <PanelInput name="command" placeholder="npm run dev" defaultValue="npm run dev" />
          <PanelButton disabled={busy}>Create Workflow</PanelButton>
        </form>
      )}

      <WorkflowSection title="Agent Workflows" items={agentWorkflows} empty="No agent workflows yet." />
      <WorkflowSection title="My Workflows" items={userWorkflows} empty="No custom workflows yet." />
    </div>
  );
}

function ProjectIntegrationsPanel({ data, onSubmit, busy }: { data: any; onSubmit: any; busy: boolean }) {
  const state = data.integrationsState ?? {};
  const integrationState = state.integrations ?? {};
  const webhooks = state.webhooks ?? [];
  const apiKeys = state.apiKeys ?? [];
  const eventStreams = state.eventStreams ?? [];
  const secrets = data.secrets ?? [];
  const [activeTab, setActiveTab] = useState<'browse' | 'connected' | 'webhooks' | 'api-keys'>('browse');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string | null>(null);
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [showApiKeyForm, setShowApiKeyForm] = useState(false);
  const [showStreamForm, setShowStreamForm] = useState(false);

  const catalog = INTEGRATION_CATALOG.map(([id, name, description, itemCategory, icon]) => ({
    id,
    name,
    description,
    category: itemCategory,
    icon,
    ...(integrationState[id] ?? {}),
  }));

  const connected = catalog.filter((item) => item.connected);

  const filtered = catalog.filter(
    (item) =>
      (category === 'all' || item.category === category) &&
      `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase()),
  );

  const selected = catalog.find((item) => item.id === selectedIntegrationId) ?? null;
  const secretKeys = new Set(secrets.map((secret: any) => secret.key));

  function statusClass(status?: string) {
    return status === 'error' ? 'error' : status === 'syncing' ? 'syncing' : status === 'active' ? 'active' : 'idle';
  }

  return (
    <div className="bolt-project-integrations-tool" data-testid="integrations-panel">
      <header className="bolt-project-integrations-head">
        <div>
          <h3>Integration Hub</h3>
          <p>Connect project tools, webhooks, API keys and event streams through backend-persisted project config.</p>
        </div>
        <div className="bolt-project-integrations-actions">
          <button type="button" onClick={() => setShowApiKeyForm((value) => !value)}>
            <span className="i-ph:key" aria-hidden />
            API Keys
          </button>
          <button type="button" onClick={() => setShowWebhookForm((value) => !value)}>
            <span className="i-ph:webhooks-logo" aria-hidden />
            Webhooks
          </button>
          <button type="button" onClick={() => setShowStreamForm((value) => !value)}>
            <span className="i-ph:broadcast" aria-hidden />
            Event Streaming
          </button>
        </div>
      </header>

      <div className="bolt-project-integrations-layout">
        <aside className="bolt-project-integrations-sidebar">
          <section>
            <h4>Categories</h4>
            {INTEGRATION_CATEGORIES.map(([id, label, icon]) => {
              const count = id === 'all' ? catalog.length : catalog.filter((item) => item.category === id).length;

              return (
                <button
                  key={id}
                  type="button"
                  aria-current={category === id ? 'page' : undefined}
                  onClick={() => setCategory(id)}
                >
                  <span className={icon} aria-hidden />
                  <span>{label}</span>
                  <em>{count}</em>
                </button>
              );
            })}
          </section>
          <section>
            <h4>Connected</h4>
            <strong>{connected.length}</strong>
            <div className="bolt-project-integrations-connected-list">
              {connected.slice(0, 10).map((item) => (
                <button key={item.id} type="button" onClick={() => setSelectedIntegrationId(item.id)}>
                  <span className={item.icon} aria-hidden />
                  <span>{item.name}</span>
                  <i data-status={statusClass(item.status)} />
                </button>
              ))}
              {!connected.length && <small>No connected integrations yet.</small>}
            </div>
          </section>
        </aside>

        <main className="bolt-project-integrations-main">
          <div className="bolt-project-integrations-tabs">
            {[
              ['browse', 'Browse All'],
              ['connected', `Connected (${connected.length})`],
              ['webhooks', `Webhooks (${webhooks.length})`],
              ['api-keys', `API Keys (${apiKeys.length})`],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-current={activeTab === id ? 'page' : undefined}
                onClick={() => setActiveTab(id as any)}
              >
                {label}
              </button>
            ))}
            <label>
              <span className="i-ph:magnifying-glass" aria-hidden />
              <input
                placeholder="Search integrations..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          {selected ? (
            <section className="bolt-project-integration-config" data-testid="dialog-integration-config">
              <div>
                <span className={selected.icon} aria-hidden />
                <strong>{selected.name}</strong>
                <small>{selected.description}</small>
              </div>
              <form onSubmit={onSubmit}>
                <input type="hidden" name="intent" value={selected.connected ? 'disconnect' : 'connect'} />
                <input type="hidden" name="integrationId" value={selected.id} />
                <PanelInput name="apiToken" type="password" placeholder="API token, OAuth token or app password" />
                <PanelInput
                  name="organization"
                  placeholder="Organization or workspace"
                  defaultValue={selected.config?.organization ?? ''}
                />
                <PanelButton disabled={busy}>
                  {selected.connected ? `Disconnect ${selected.name}` : `Connect ${selected.name}`}
                </PanelButton>
              </form>
              <PanelRows
                rows={[
                  ['Status', selected.connected ? (selected.status ?? 'active') : 'Not connected'],
                  ['Last sync', selected.lastSync ? new Date(selected.lastSync).toLocaleString() : 'Never'],
                  [
                    'Secret stored',
                    secretKeys.has(`INTEGRATION_TOKEN_${selected.id.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`)
                      ? 'Yes'
                      : 'No token stored',
                  ],
                ]}
              />
              <button type="button" onClick={() => setSelectedIntegrationId(null)}>
                Close configuration
              </button>
            </section>
          ) : null}

          {activeTab === 'browse' && (
            <section className="bolt-project-integrations-grid" data-testid="grid-integrations">
              {filtered.map((item) => (
                <article key={item.id} data-testid={`integration-card-${item.id}`}>
                  <div>
                    <span className={item.icon} aria-hidden />
                    <div>
                      <strong>{item.name}</strong>
                      <p>{item.description}</p>
                    </div>
                    {item.connected && <em data-status={statusClass(item.status)}>{item.status ?? 'active'}</em>}
                  </div>
                  <footer>
                    <small>{item.category}</small>
                    <button
                      type="button"
                      onClick={() => setSelectedIntegrationId(item.id)}
                      data-testid={`button-connect-${item.id}`}
                    >
                      {item.connected ? 'Manage' : 'Connect'}
                    </button>
                  </footer>
                </article>
              ))}
            </section>
          )}

          {activeTab === 'connected' && (
            <section className="bolt-project-integrations-list" data-testid="list-connected">
              {connected.map((item) => (
                <article key={item.id}>
                  <span className={item.icon} aria-hidden />
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.lastSync ? `Last sync: ${new Date(item.lastSync).toLocaleString()}` : 'No sync yet'}
                    </small>
                  </div>
                  <form onSubmit={onSubmit}>
                    <input type="hidden" name="intent" value="sync" />
                    <input type="hidden" name="integrationId" value={item.id} />
                    <PanelButton disabled={busy} variant="outline">
                      Sync
                    </PanelButton>
                  </form>
                  <button type="button" onClick={() => setSelectedIntegrationId(item.id)}>
                    Configure
                  </button>
                </article>
              ))}
              {!connected.length && <div className="bolt-project-empty-panel">No connected integrations.</div>}
            </section>
          )}

          {activeTab === 'webhooks' && (
            <section className="bolt-project-integrations-list" data-testid="card-webhooks-list">
              <div className="bolt-project-integrations-section-head">
                <div>
                  <strong>Webhooks</strong>
                  <small>Outgoing endpoints persisted in project backend config.</small>
                </div>
                <button type="button" onClick={() => setShowWebhookForm((value) => !value)}>
                  Create Webhook
                </button>
              </div>
              {showWebhookForm && (
                <form onSubmit={onSubmit} className="bolt-project-integrations-form">
                  <input type="hidden" name="intent" value="create-webhook" />
                  <PanelInput name="name" placeholder="Deployment Notifications" required />
                  <PanelInput name="url" placeholder="https://example.com/webhook" required />
                  <PanelInput name="secret" type="password" placeholder="Webhook signing secret" />
                  <PanelInput name="events" placeholder="deploy.success,deploy.fail" defaultValue="all" />
                  <PanelButton disabled={busy}>Create Webhook</PanelButton>
                </form>
              )}
              {webhooks.map((webhook: any) => (
                <article key={webhook.id} data-testid={`webhook-${webhook.id}`}>
                  <span className="i-ph:webhooks-logo" aria-hidden />
                  <div>
                    <strong>{webhook.name}</strong>
                    <small>{webhook.url}</small>
                    <small>
                      {(webhook.events ?? []).join(', ')} · {webhook.successRate ?? 100}% success
                    </small>
                  </div>
                  <form onSubmit={onSubmit}>
                    <input type="hidden" name="intent" value="toggle-webhook" />
                    <input type="hidden" name="webhookId" value={webhook.id} />
                    <input type="hidden" name="active" value={webhook.active ? 'false' : 'true'} />
                    <PanelButton disabled={busy} variant="outline">
                      {webhook.active ? 'Pause' : 'Resume'}
                    </PanelButton>
                  </form>
                  <form onSubmit={onSubmit}>
                    <input type="hidden" name="intent" value="delete-webhook" />
                    <input type="hidden" name="webhookId" value={webhook.id} />
                    <PanelButton disabled={busy} variant="outline">
                      Delete
                    </PanelButton>
                  </form>
                </article>
              ))}
              {!webhooks.length && <div className="bolt-project-empty-panel">No webhooks configured.</div>}
            </section>
          )}

          {activeTab === 'api-keys' && (
            <section className="bolt-project-integrations-list" data-testid="card-api-keys-list">
              <div className="bolt-project-integrations-section-head">
                <div>
                  <strong>API Keys</strong>
                  <small>Secrets are stored in the backend secret store; only prefixes are shown here.</small>
                </div>
                <button type="button" onClick={() => setShowApiKeyForm((value) => !value)}>
                  Create API Key
                </button>
              </div>
              {showApiKeyForm && (
                <form onSubmit={onSubmit} className="bolt-project-integrations-form">
                  <input type="hidden" name="intent" value="create-api-key" />
                  <PanelInput name="name" placeholder="Production API Key" required />
                  <select name="permissions" defaultValue="read,write">
                    <option value="read">Read Only</option>
                    <option value="read,write">Read & Write</option>
                    <option value="read,write,admin">Admin</option>
                    <option value="read,deploy">Deploy</option>
                  </select>
                  <select name="environment" defaultValue="development">
                    <option value="development">Development</option>
                    <option value="production">Production</option>
                    <option value="ci">CI/CD</option>
                  </select>
                  <select name="expiration" defaultValue="never">
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                    <option value="365">1 year</option>
                    <option value="never">Never</option>
                  </select>
                  <PanelButton disabled={busy}>Generate Key</PanelButton>
                </form>
              )}
              {apiKeys.map((apiKey: any) => (
                <article key={apiKey.id} data-testid={`api-key-${apiKey.id}`}>
                  <span className="i-ph:key" aria-hidden />
                  <div>
                    <strong>{apiKey.name}</strong>
                    <small>{apiKey.prefix}••••••••••••••••••••</small>
                    <small>
                      {(apiKey.permissions ?? []).join(', ')}
                      {apiKey.expiresAt ? ` · expires ${new Date(apiKey.expiresAt).toLocaleDateString()}` : ''}
                    </small>
                  </div>
                  <form onSubmit={onSubmit}>
                    <input type="hidden" name="intent" value="revoke-api-key" />
                    <input type="hidden" name="apiKeyId" value={apiKey.id} />
                    <PanelButton disabled={busy} variant="outline">
                      Revoke
                    </PanelButton>
                  </form>
                </article>
              ))}
              {!apiKeys.length && <div className="bolt-project-empty-panel">No API keys created.</div>}
            </section>
          )}

          <section className="bolt-project-integrations-streams" data-testid="dialog-event-streaming">
            <div className="bolt-project-integrations-section-head">
              <div>
                <strong>Event Streaming</strong>
                <small>Streams are project-scoped and backed by the same persisted integration state.</small>
              </div>
              <button type="button" onClick={() => setShowStreamForm((value) => !value)}>
                Add Stream
              </button>
            </div>
            {showStreamForm && (
              <form onSubmit={onSubmit} className="bolt-project-integrations-form">
                <input type="hidden" name="intent" value="create-stream" />
                <PanelInput name="name" placeholder="Audit Logs" required />
                <select name="destination" defaultValue="AWS Kinesis">
                  <option value="AWS Kinesis">AWS Kinesis</option>
                  <option value="Apache Kafka">Apache Kafka</option>
                  <option value="Google Pub/Sub">Google Pub/Sub</option>
                  <option value="Azure Event Hub">Azure Event Hub</option>
                  <option value="Elasticsearch">Elasticsearch</option>
                </select>
                <PanelInput name="events" placeholder="auth.*,api.*" defaultValue="*" />
                <PanelButton disabled={busy}>Add Stream</PanelButton>
              </form>
            )}
            <div className="bolt-project-integrations-list compact">
              {eventStreams.map((stream: any) => (
                <article key={stream.id} data-testid={`stream-${stream.id}`}>
                  <span className="i-ph:broadcast" aria-hidden />
                  <div>
                    <strong>{stream.name}</strong>
                    <small>
                      {stream.destination} · {(stream.events ?? []).join(', ')} · {stream.throughput ?? 0}/min
                    </small>
                  </div>
                  <form onSubmit={onSubmit}>
                    <input type="hidden" name="intent" value="toggle-stream" />
                    <input type="hidden" name="streamId" value={stream.id} />
                    <input type="hidden" name="active" value={stream.active ? 'false' : 'true'} />
                    <PanelButton disabled={busy} variant="outline">
                      {stream.active ? 'Pause' : 'Resume'}
                    </PanelButton>
                  </form>
                </article>
              ))}
              {!eventStreams.length && <div className="bolt-project-empty-panel">No event streams configured.</div>}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function ProjectEnvPanel({ data, onSubmit, busy }: { data: any; onSubmit: any; busy: boolean }) {
  const envVars = data.envVars ?? [];
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ key: string; value?: string } | null>(null);
  const [message, setMessage] = useState('');

  const filtered = envVars.filter((item: any) =>
    [item.key, item.value, item.updatedAt].join(' ').toLowerCase().includes(query.toLowerCase()),
  );

  async function copyEnv(key: string, value?: string) {
    await navigator.clipboard?.writeText(value ? `${key}=${value}` : key);
    setMessage(value ? `${key} copied with value.` : `${key} copied.`);
  }

  return (
    <div className="bolt-project-managed-panel">
      <section>
        <div className="bolt-project-panel-toolbar">
          <label>
            Search variables
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="VITE_, DATABASE, API"
            />
          </label>
          <button type="button" onClick={() => setEditing({ key: 'VITE_API_URL', value: '' })}>
            New variable
          </button>
        </div>
        {message && <div className="bolt-project-empty-panel">{message}</div>}
        <div className="bolt-project-env-list">
          {filtered.length ? (
            filtered.map((item: any) => (
              <div key={item.key} className="bolt-project-env-row">
                <strong>{item.key}</strong>
                <span>{item.value || 'empty value'}</span>
                <small>{item.updatedAt ?? 'Stored in project metadata'}</small>
                <button type="button" onClick={() => setEditing({ key: item.key, value: item.value ?? '' })}>
                  Edit
                </button>
                <button type="button" onClick={() => void copyEnv(item.key, item.value)}>
                  Copy
                </button>
                <form onSubmit={onSubmit}>
                  <input name="intent" value="delete" type="hidden" />
                  <input name="key" value={item.key} type="hidden" />
                  <PanelButton disabled={busy} variant="outline">
                    Delete
                  </PanelButton>
                </form>
              </div>
            ))
          ) : (
            <div className="bolt-project-empty-panel">
              {query ? 'No environment variable matches this search.' : 'No environment variables.'}
            </div>
          )}
        </div>
      </section>
      <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-bolt-elements-borderColor p-3">
        <input name="intent" value="upsert" type="hidden" />
        <PanelInput
          name="key"
          placeholder="VITE_API_URL"
          required
          value={editing?.key ?? ''}
          onChange={(event: any) => setEditing((current) => ({ key: event.target.value, value: current?.value ?? '' }))}
        />
        <PanelInput
          name="value"
          value={editing?.value ?? ''}
          onChange={(event: any) => setEditing((current) => ({ key: current?.key ?? '', value: event.target.value }))}
        />
        <PanelButton disabled={busy || !editing?.key?.trim()}>
          {editing ? 'Save variable' : 'Create variable'}
        </PanelButton>
      </form>
    </div>
  );
}

function ProjectDatabasePanel({ data, onSubmit, busy }: { data: any; onSubmit: any; busy: boolean }) {
  const [activeTab, setActiveTab] = useState<'connection' | 'env' | 'activity' | 'backups'>('connection');
  const databaseVars = (data.envVars ?? []).filter((item: any) => /DATABASE|POSTGRES|SQL/i.test(item.key));
  const databaseBackups = (data.snapshots ?? []).filter((snapshot: any) => snapshot.kind === 'database-backup');

  const tableRows = databaseVars.length
    ? databaseVars.map((item: any) => [item.key, item.updatedAt ?? 'Stored in project environment'])
    : [['Database status', 'No database connection configured for this project']];

  return (
    <div className="bolt-project-database-tool">
      <aside>
        <strong>Database</strong>
        <PanelRows rows={tableRows} empty="No database backend variables configured." />
      </aside>
      <main>
        <div className="bolt-project-tool-tabs">
          {[
            ['connection', 'Connection'],
            ['env', 'Environment'],
            ['activity', 'Activity'],
            ['backups', 'Backups'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-current={activeTab === id ? 'page' : undefined}
              onClick={() => setActiveTab(id as any)}
            >
              {label}
            </button>
          ))}
        </div>
        {activeTab === 'connection' ? (
          <form onSubmit={onSubmit} className="bolt-project-sql-editor">
            <input name="key" value="DATABASE_URL" type="hidden" />
            <input name="value" placeholder="postgres://user:pass@host:5432/db" required />
            <PanelButton disabled={busy}>Save DATABASE_URL</PanelButton>
          </form>
        ) : activeTab === 'env' ? (
          <PanelRows rows={tableRows} empty="Database metadata is not configured for this project." />
        ) : activeTab === 'activity' ? (
          <PanelRows
            rows={(data.recentActivity ?? [])
              .filter((event: any) => String(event.action ?? '').includes('env'))
              .map((event: any) => [
                event.action,
                event.createdAt ? new Date(event.createdAt).toLocaleString() : 'Recorded by backend',
              ])}
            empty="No backend database activity recorded yet."
          />
        ) : (
          <div className="grid gap-3">
            <form onSubmit={onSubmit} className="bolt-project-inline-form">
              <input name="intent" value="create-backup" type="hidden" />
              <PanelInput name="label" placeholder="Manual database backup" />
              <PanelButton disabled={busy}>Create backup</PanelButton>
            </form>
            <PanelRows
              rows={databaseBackups.map((snapshot: any) => [
                snapshot.label ?? snapshot.id,
                snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : 'Database backup snapshot',
              ])}
              empty="No database backups yet."
            />
            {databaseBackups.map((snapshot: any) => (
              <form key={snapshot.id} onSubmit={onSubmit}>
                <input name="intent" value="restore-backup" type="hidden" />
                <input name="snapshotId" value={snapshot.id} type="hidden" />
                <PanelButton disabled={busy} variant="outline">
                  Restore {snapshot.label ?? snapshot.id}
                </PanelButton>
              </form>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ProjectSecurityPanel({ data, onSubmit, busy }: { data: any; onSubmit: any; busy: boolean }) {
  const [activeTab, setActiveTab] = useState<'active' | 'hidden' | 'settings'>('active');
  const state = data.securityState ?? {};
  const settings = state.settings ?? {};
  const scans = state.scans ?? [];
  const vulnerabilities = state.vulnerabilities ?? [];

  const visibleVulnerabilities = vulnerabilities.filter((item: any) =>
    activeTab === 'hidden' ? item.hidden : !item.hidden,
  );

  const latestScan = scans[0];

  const severityRows = ['critical', 'high', 'moderate', 'low', 'info'].map((severity) => [
    severity,
    `${vulnerabilities.filter((item: any) => item.severity === severity && !item.hidden).length} active`,
  ]);

  return (
    <div className="bolt-project-security-tool">
      <section className="bolt-project-security-summary">
        <div>
          <h3>Security and privacy scanner</h3>
          <p>Runs against the active workspace runtime and stores scan history in project backend state.</p>
        </div>
        <form onSubmit={onSubmit}>
          <input name="intent" value="scan" type="hidden" />
          <PanelButton disabled={busy}>{busy ? 'Scanning...' : 'Run scan'}</PanelButton>
        </form>
      </section>

      <div className="bolt-project-security-grid">
        <aside>
          <strong>Latest scan</strong>
          <PanelRows
            rows={[
              ['Status', latestScan?.status ?? 'No scan yet'],
              ['Scanner', latestScan?.scanner ?? 'workspace-runtime'],
              ['Summary', latestScan?.summary ?? 'Run a scan to populate security findings'],
            ]}
          />
          <strong>Severity</strong>
          <PanelRows rows={severityRows} />
        </aside>

        <main>
          <div className="bolt-project-tool-tabs">
            {[
              ['active', 'Active'],
              ['hidden', 'Hidden'],
              ['settings', 'Settings'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-current={activeTab === id ? 'page' : undefined}
                onClick={() => setActiveTab(id as any)}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'settings' ? (
            <form onSubmit={onSubmit} className="bolt-project-security-settings">
              <input name="intent" value="settings" type="hidden" />
              {[
                ['dependencyAuditEnabled', 'Dependency audit', settings.dependencyAuditEnabled !== false],
                ['secretScanEnabled', 'Secret scan', settings.secretScanEnabled !== false],
                ['privacyDetectionEnabled', 'Privacy detection', settings.privacyDetectionEnabled !== false],
              ].map(([name, label, enabled]) => (
                <label key={String(name)}>
                  <span>{label}</span>
                  <select name={String(name)} defaultValue={enabled ? 'true' : 'false'}>
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                </label>
              ))}
              <PanelButton disabled={busy}>Save scanner settings</PanelButton>
            </form>
          ) : (
            <div className="bolt-project-vulnerability-list">
              {visibleVulnerabilities.length ? (
                visibleVulnerabilities.map((vulnerability: any) => (
                  <article key={vulnerability.id} className="bolt-project-vulnerability-card">
                    <div>
                      <span data-severity={vulnerability.severity}>{vulnerability.severity}</span>
                      <strong>{vulnerability.title}</strong>
                      <p>{vulnerability.details || vulnerability.recommendation || vulnerability.source}</p>
                    </div>
                    <form onSubmit={onSubmit}>
                      <input
                        name="intent"
                        value={activeTab === 'hidden' ? 'unhide-vulnerability' : 'hide-vulnerability'}
                        type="hidden"
                      />
                      <input name="vulnerabilityId" value={vulnerability.id} type="hidden" />
                      <PanelButton disabled={busy} variant="outline">
                        {activeTab === 'hidden' ? 'Restore' : 'Hide'}
                      </PanelButton>
                    </form>
                  </article>
                ))
              ) : (
                <PanelRows
                  rows={[]}
                  empty={activeTab === 'hidden' ? 'No hidden vulnerabilities.' : 'No active vulnerabilities.'}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function ProjectLogsPanel({ data, reload, busy }: { data: any; reload?: () => void | Promise<void>; busy: boolean }) {
  const [cleared, setCleared] = useState(false);
  const [split, setSplit] = useState(false);

  const lines = cleared
    ? []
    : [
        data.workspace
          ? `workspace:${data.workspace.id} status=${data.workspace.status} runtime=${data.workspace.runtimeMode}`
          : 'workspace:none recorded for this project',
        ...(data.recentActivity ?? []).map((event: any) => `${event.createdAt ?? 'recorded'} ${event.action}`),
      ];

  return (
    <div className={classNames('bolt-project-console-tool', split && 'bolt-project-console-tool-split')}>
      <div className="bolt-project-console-header">
        <button type="button" onClick={() => setCleared(true)}>
          Clear
        </button>
        <button type="button" onClick={() => setSplit((value) => !value)}>
          {split ? 'Unsplit' : 'Split'}
        </button>
        <button type="button" onClick={() => void reload?.()} disabled={busy}>
          {busy ? 'Refreshing' : 'Reload'}
        </button>
      </div>
      <div className="bolt-project-console-body">
        {lines.length ? (
          lines.map((line: string, index: number) => <div key={`${line}-${index}`}>{line}</div>)
        ) : (
          <div>No backend log lines in the current view.</div>
        )}
      </div>
      {split && (
        <div className="bolt-project-console-body">
          {(data.deployments ?? []).length ? (
            (data.deployments ?? []).slice(0, 12).map((deployment: any) => (
              <div key={deployment.id ?? deployment.createdAt}>
                deployment:{deployment.id ?? 'unknown'} status={deployment.status ?? 'unknown'} provider=
                {deployment.provider ?? 'unknown'}
              </div>
            ))
          ) : (
            <div>No backend deployments recorded.</div>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectSecretsPanel({
  projectId,
  data,
  onSubmit,
  busy,
}: {
  projectId?: string;
  data: any;
  onSubmit: any;
  busy: boolean;
}) {
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [editingKey, setEditingKey] = useState('');
  const secrets = data.secrets ?? [];

  async function revealSecret(key: string) {
    if (!projectId) {
      return;
    }

    if (revealed[key]) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[key];

        return next;
      });
      return;
    }

    if (!window.confirm(`Reveal the secret value for ${key}? This value will only be shown in this browser session.`)) {
      return;
    }

    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/ide-panel/secrets?reveal=true&confirm=1&key=${encodeURIComponent(
        key,
      )}`,
      { headers: { accept: 'application/json' } },
    );

    const result = (await response.json()) as any;
    const value = result?.data?.secret?.value;

    if (typeof value === 'string') {
      setRevealed((current) => ({ ...current, [key]: value }));
      setMessage(`${key} revealed for this session.`);
    } else {
      setMessage(`Unable to reveal ${key}.`);
    }
  }

  async function copySecret(key: string) {
    const value = revealed[key] ?? key;
    await navigator.clipboard?.writeText(value);
    setMessage(`${revealed[key] ? 'Secret value' : 'Secret key'} copied.`);
  }

  return (
    <div className="bolt-project-secrets-tool">
      <form onSubmit={onSubmit} className="bolt-project-inline-form">
        <input name="intent" value="upsert" type="hidden" />
        <PanelInput name="key" placeholder="STRIPE_SECRET_KEY" required defaultValue={editingKey} />
        <PanelInput name="value" placeholder="Secret value" type="password" required />
        <PanelButton disabled={busy}>{editingKey ? 'Update secret' : '+ New secret'}</PanelButton>
      </form>
      {message && <div className="bolt-project-empty-panel">{message}</div>}
      <div className="bolt-project-secret-list">
        {secrets.length ? (
          secrets.map((secret: any) => (
            <div key={secret.key} className="bolt-project-secret-row">
              <strong>{secret.key}</strong>
              <span>{revealed[secret.key] ?? '••••••'}</span>
              <button type="button" aria-label={`Reveal ${secret.key}`} onClick={() => void revealSecret(secret.key)}>
                {revealed[secret.key] ? 'Hide' : 'Reveal'}
              </button>
              <button type="button" aria-label={`Copy ${secret.key}`} onClick={() => void copySecret(secret.key)}>
                Copy
              </button>
              <button type="button" aria-label={`Edit ${secret.key}`} onClick={() => setEditingKey(secret.key)}>
                Edit
              </button>
              <form onSubmit={onSubmit}>
                <input name="intent" value="delete" type="hidden" />
                <input name="key" value={secret.key} type="hidden" />
                <PanelButton disabled={busy} variant="outline">
                  Delete
                </PanelButton>
              </form>
            </div>
          ))
        ) : (
          <div className="bolt-project-empty-panel">No project secrets.</div>
        )}
      </div>
    </div>
  );
}

function ProjectGitPanel({ data, project, onSubmit, busy }: { data: any; project: any; onSubmit: any; busy: boolean }) {
  const status = data.status ?? data;
  const branch = status.branch ?? project.gitDefaultBranch ?? 'main';
  const changedFiles = status.changedFiles ?? [];
  const [staged, setStaged] = useState<Set<string>>(new Set());
  const stagedFiles = Array.from(staged);

  function toggleFile(filePath: string) {
    setStaged((current) => {
      const next = new Set(current);

      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }

      return next;
    });
  }

  return (
    <div className="bolt-project-git-tool">
      <section>
        <h3>Changes</h3>
        {changedFiles.length ? (
          changedFiles.map((file: any) => {
            const path = String(file.path ?? file);
            return (
              <label key={path} className="bolt-project-git-file">
                <input type="checkbox" checked={staged.has(path)} onChange={() => toggleFile(path)} />
                <span>{path}</span>
                <em>{String(file.status ?? 'M')}</em>
              </label>
            );
          })
        ) : (
          <div className="bolt-project-empty-panel">No changed files.</div>
        )}
        <h3>Staged</h3>
        {stagedFiles.length ? (
          <PanelRows rows={stagedFiles.map((file) => [file, 'Ready for commit'])} />
        ) : (
          <div className="bolt-project-empty-panel">Select files above to stage changes.</div>
        )}
        <h3>History</h3>
        <PanelRows
          rows={[
            ['Branch', branch],
            ['Ahead / behind', `${status.ahead ?? 0} / ${status.behind ?? 0}`],
            ['Remote', project.gitRepositoryUrl ?? 'No remote repository'],
          ]}
        />
      </section>
      <div className="grid gap-3">
        <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-bolt-elements-borderColor p-3">
          <input name="intent" value="commit" type="hidden" />
          <input name="stagedFiles" value={stagedFiles.join(',')} type="hidden" />
          <textarea
            name="message"
            placeholder={stagedFiles.length ? `Commit ${stagedFiles.length} staged files` : 'Commit message'}
          />
          <PanelButton disabled={busy || changedFiles.length === 0}>Commit & Push</PanelButton>
        </form>
        {['pull', 'push'].map((intent) => (
          <form key={intent} onSubmit={onSubmit} className="flex gap-2">
            <input name="intent" value={intent} type="hidden" />
            <PanelInput name="branch" defaultValue={branch} />
            <PanelButton disabled={busy} variant="outline">
              {intent === 'pull' ? 'Pull' : 'Push'}
            </PanelButton>
          </form>
        ))}
      </div>
    </div>
  );
}

function ProjectDeploymentAction({
  intent,
  deploymentId,
  onSubmit,
  busy,
  children,
}: {
  intent: string;
  deploymentId: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <form onSubmit={onSubmit}>
      <input name="intent" value={intent} type="hidden" />
      <input name="deploymentId" value={deploymentId} type="hidden" />
      <PanelButton disabled={busy} variant="outline">
        {children}
      </PanelButton>
    </form>
  );
}

function PanelRows({ rows, events, empty }: { rows: any[]; events?: any[]; empty?: string }) {
  const normalized = rows.length
    ? rows
    : (events ?? []).map((event) => [
        event.action,
        event.createdAt ? new Date(event.createdAt).toLocaleString() : 'Recorded by API',
      ]);

  if (!normalized.length) {
    return (
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-sm text-bolt-elements-textSecondary">
        {empty ?? 'No records.'}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
      {normalized.map(([title, detail], index) => (
        <div key={`${title}-${index}`} className="border-b border-bolt-elements-borderColor px-4 py-3 last:border-b-0">
          <div className="text-sm font-medium text-bolt-elements-textPrimary">{title}</div>
          <div className="mt-1 text-xs text-bolt-elements-textSecondary">{detail}</div>
        </div>
      ))}
    </div>
  );
}

function PanelInput(props: any) {
  return (
    <input
      {...props}
      className="h-9 min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-sm outline-none focus:border-bolt-elements-focus"
    />
  );
}

function PanelButton({ children, variant, ...props }: any) {
  return (
    <button
      {...props}
      type="submit"
      className={classNames(
        'inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium disabled:opacity-60',
        variant === 'outline'
          ? 'border border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3'
          : 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text',
      )}
    >
      {children}
    </button>
  );
}

function panelTitle(panel: string) {
  const titles: Record<string, string> = {
    editor: 'Editor',
    preview: 'Webview',
    webview: 'Webview',
    console: 'Console',
    network: 'Network',
    database: 'Database',
    'object-storage': 'Object Storage',
    packages: 'Packages',
    monitoring: 'Monitoring',
    extensions: 'Extensions',
    integrations: 'Integrations',
    workflows: 'Workflows',
    files: 'Files',
    search: 'Search',
    locks: 'Locks',
    overview: 'Overview',
    deployments: 'Deploy',
    security: 'Security',
    env: 'Environment variables',
    secrets: 'Secrets',
    git: 'Git',
    activity: 'Activity',
    terminal: 'Terminal',
    logs: 'Logs',
    collaborators: 'Collaborators',
    domains: 'Domains',
    snapshots: 'Snapshots',
    settings: 'Settings',
  };

  return titles[panel] ?? panel;
}

function panelIcon(panel: string) {
  const icons: Record<string, string> = {
    editor: 'i-ph:code',
    preview: 'i-ph:browser',
    webview: 'i-ph:browser',
    console: 'i-ph:terminal-window',
    network: 'i-ph:activity',
    database: 'i-ph:database',
    'object-storage': 'i-ph:package',
    packages: 'i-ph:cube',
    monitoring: 'i-ph:chart-line',
    extensions: 'i-ph:puzzle-piece',
    integrations: 'i-ph:plugs-connected',
    workflows: 'i-ph:git-branch',
    files: 'i-ph:files',
    search: 'i-ph:magnifying-glass',
    locks: 'i-ph:lock',
    overview: 'i-ph:gauge',
    deployments: 'i-ph:rocket-launch',
    security: 'i-ph:shield-check',
    env: 'i-ph:brackets-curly',
    secrets: 'i-ph:lock',
    git: 'i-ph:git-branch',
    activity: 'i-ph:activity',
    terminal: 'i-ph:terminal-window',
    logs: 'i-ph:list-magnifying-glass',
    collaborators: 'i-ph:users',
    domains: 'i-ph:globe',
    snapshots: 'i-ph:stack',
    settings: 'i-ph:gear',
  };

  return icons[panel] ?? 'i-ph:squares-four';
}

function ScrollToBottom() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return (
    !isAtBottom && (
      <>
        <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-bolt-elements-background-depth-1 to-transparent h-20 z-10" />
        <button
          className="sticky z-50 bottom-0 left-0 right-0 text-4xl rounded-lg px-1.5 py-0.5 flex items-center justify-center mx-auto gap-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor text-bolt-elements-textPrimary text-sm"
          onClick={() => scrollToBottom()}
        >
          Go to last message
          <span className="i-ph:arrow-down animate-bounce" />
        </button>
      </>
    )
  );
}
