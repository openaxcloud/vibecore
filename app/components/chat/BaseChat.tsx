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
import { toast } from 'react-toastify';
import { getApiKeysFromCookies } from './APIKeyManager';
import styles from './BaseChat.module.scss';
import ChatAlert from './ChatAlert';
import {
  bucketEventsByTime as bucketEventsByTimeHelper,
  deploymentStatusColor,
  partitionMonitoringEvents as partitionMonitoringEventsHelper,
} from './projectMonitoring';
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
import { buildGitStatusMap } from '~/utils/fileExplorerMetadata';
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
const PROJECT_BOTTOM_TERMINAL_UI_STORAGE_KEY = 'vibecore-project-bottom-terminal-ui-v1';

function readProjectBottomTerminalUiState() {
  if (typeof window === 'undefined') {
    return { height: 420, open: false, stored: false };
  }

  try {
    const stored = window.localStorage.getItem(PROJECT_BOTTOM_TERMINAL_UI_STORAGE_KEY);
    const parsed = JSON.parse(stored ?? '{}');

    return {
      height: typeof parsed.height === 'number' ? Math.min(720, Math.max(320, parsed.height)) : 420,
      open: typeof parsed.open === 'boolean' ? parsed.open : false,
      stored: Boolean(stored),
    };
  } catch {
    return { height: 420, open: false, stored: false };
  }
}

const IDE_MANAGEMENT_PANELS = [
  'overview',
  'database',
  'object-storage',
  'packages',
  'monitoring',
  'extensions',
  'integrations',
  'workflows',
  'debugger',
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

const IDE_FILE_TREE_HIDDEN_PATTERNS = [
  /\/node_modules\//,
  /\/\.next/,
  /\/\.astro/,
  /\/\.vite(?:\/|$)/,
  /\/deps_temp_[^/]+(?:\/|$)/,
];

const IDE_TOOL_DESCRIPTIONS: Record<IdeWorkspacePanel | IdeRightPanel, string> = {
  overview: 'Project summary',
  database: 'SQL browser',
  'object-storage': 'File storage',
  packages: 'Dependencies manager',
  monitoring: 'App metrics',
  extensions: 'Marketplace',
  integrations: 'Connected services',
  workflows: 'Task automation',
  debugger: 'Breakpoints and launch configs',
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
type ProjectBottomTerminalView = 'terminal' | 'output' | 'problems' | 'debug';
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
  manifest?: unknown;
  createdByUserId?: string;
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
  placeholder: string;
}> = [
  {
    id: 'ask',
    label: 'Ask',
    chatMode: 'discuss',
    description: 'Answer, explain, and inspect without changing files or running commands.',
    placeholder: 'Ask anything about this project…',
  },
  {
    id: 'edit',
    label: 'Edit',
    chatMode: 'build',
    description: 'Make scoped code changes only after identifying the target files.',
    placeholder: 'Describe a scoped edit, e.g. "Add a logout button to the navbar"…',
  },
  {
    id: 'agent',
    label: 'Agent',
    chatMode: 'build',
    description: 'Execute the requested task end to end with verification.',
    placeholder: 'Describe what you want the agent to build, fix or refactor…',
  },
  {
    id: 'architect',
    label: 'Architect',
    chatMode: 'discuss',
    description: 'Design architecture, contracts, risks, and rollout steps before implementation.',
    placeholder: 'Describe the system to design — goals, constraints, integrations…',
  },
];

type ProjectAgentPublicMode = 'agent' | 'assistant';

const PROJECT_AGENT_PUBLIC_MODES: Array<{
  id: ProjectAgentPublicMode;
  label: string;
  description: string;
  execution: ProjectAgentExecutionMode;
}> = [
  {
    id: 'agent',
    label: 'Agent',
    description: 'Autonomously edits files and runs commands. Plan first will require your approval.',
    execution: 'agent',
  },
  {
    id: 'assistant',
    label: 'Assistant',
    description: 'Conversational — answers questions and proposes scoped edits but waits for your go.',
    execution: 'ask',
  },
];

function publicModeForExecution(execution: ProjectAgentExecutionMode): ProjectAgentPublicMode {
  if (execution === 'agent' || execution === 'architect') {
    return 'agent';
  }

  return 'assistant';
}

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
  git?: { branch?: string; ahead?: number; behind?: number; changedFiles?: unknown[]; fileStatuses?: unknown[] };
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

function stripPromptScaffold(value: unknown): string {
  let text = String(value ?? '');

  text = text
    .replace(/^\s*\[Model:[^\]]*\]\s*/i, '')
    .replace(/^\s*\[Provider:[^\]]*\]\s*/i, '')
    .replace(/\[Model:[^\]]*\]/gi, '')
    .replace(/\[Provider:[^\]]*\]/gi, '')
    .replace(/<boltArtifact\s+[^>]*>[\s\S]*?<\/boltArtifact>/gm, '')
    .replace(/<boltAction\s+[^>]*>[\s\S]*?<\/boltAction>/gm, '');

  const userPromptMatch = text.match(/User prompt:\s*([\s\S]*)$/i);

  if (userPromptMatch && userPromptMatch[1].trim()) {
    text = userPromptMatch[1];
  }

  return text;
}

function shortContent(value: unknown, fallback = 'Project update') {
  const text = stripPromptScaffold(value)
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

function formatBytes(bytes?: number) {
  if (!Number.isFinite(bytes) || !bytes || bytes <= 0) {
    return '0 KB';
  }

  const units = ['B', 'KB', 'MB', 'GB'];

  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

function snapshotFiles(snapshot: ProjectSnapshot): Array<{ path: string; sizeBytes?: number; updatedAt?: string }> {
  const manifest = snapshot.manifest as { files?: unknown } | undefined;

  if (!Array.isArray(manifest?.files)) {
    return [];
  }

  return manifest.files
    .map((file) => {
      const entry = file as { path?: unknown; sizeBytes?: unknown; updatedAt?: unknown };

      if (typeof entry.path !== 'string' || !entry.path.trim()) {
        return null;
      }

      return {
        path: entry.path,
        sizeBytes: typeof entry.sizeBytes === 'number' ? entry.sizeBytes : undefined,
        updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : undefined,
      };
    })
    .filter(Boolean) as Array<{ path: string; sizeBytes?: number; updatedAt?: string }>;
}

function snapshotAuthor(snapshot: ProjectSnapshot) {
  if (snapshot.kind === 'before-ai-change' || /ai|agent/i.test(snapshot.label ?? '')) {
    return 'Agent';
  }

  if (snapshot.kind === 'automatic') {
    return 'System';
  }

  return 'Manual';
}

function snapshotKindLabel(snapshot: ProjectSnapshot) {
  if (snapshot.kind === 'before-ai-change') {
    return 'Before AI change';
  }

  if (snapshot.kind === 'automatic') {
    return 'Automatic';
  }

  return 'Manual';
}

function snapshotDiffSummary(current: ProjectSnapshot, previous?: ProjectSnapshot) {
  const currentFiles = snapshotFiles(current);
  const previousFiles = snapshotFiles(previous ?? ({} as ProjectSnapshot));
  const previousByPath = new Map(previousFiles.map((file) => [file.path, file]));
  const currentByPath = new Map(currentFiles.map((file) => [file.path, file]));
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];

  for (const file of currentFiles) {
    const previousFile = previousByPath.get(file.path);

    if (!previousFile) {
      added.push(file.path);
    } else if (previousFile.sizeBytes !== file.sizeBytes || previousFile.updatedAt !== file.updatedAt) {
      changed.push(file.path);
    }
  }

  for (const file of previousFiles) {
    if (!currentByPath.has(file.path)) {
      removed.push(file.path);
    }
  }

  const sample = [...changed, ...added, ...removed, ...currentFiles.map((file) => file.path)]
    .filter((path, index, list) => list.indexOf(path) === index)
    .slice(0, 6);

  return { added, changed, removed, sample };
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

function formatEditorTabLabel(label: string, panel: IdeWorkspacePanel) {
  if (panel !== 'editor') {
    return label;
  }

  const normalized = label.replace(WORK_DIR, '').replace(/^\/+/, '');
  const pathParts = normalized.split('/').filter(Boolean);

  if (pathParts.length <= 2) {
    return normalized || label;
  }

  return `${pathParts.at(-2)}/${pathParts.at(-1)}`;
}

function formatRailBadgeValue(value: number) {
  return value > 99 ? '99+' : String(value);
}

function formatRailItemLabel(label: string, badgeLabel?: string) {
  return badgeLabel ? `${label}, ${badgeLabel}` : label;
}

function formatRailItemTitle(title: string, badgeLabel?: string) {
  return badgeLabel ? `${title} · ${badgeLabel}` : title;
}

function isIdeHiddenPath(filePath: string) {
  return IDE_FILE_TREE_HIDDEN_PATTERNS.some((pattern) => pattern.test(filePath));
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

function resolveMentionedProjectSymbols(message: string, files: FileMap) {
  const rawSymbols = Array.from(message.matchAll(/#([A-Za-z_$][\w$.-]*)/g)).map((match) =>
    match[1].replace(/[.!?]+$/, ''),
  );

  if (!rawSymbols.length) {
    return [];
  }

  const results: Array<{ symbol: string; filePath: string; line: number; preview: string }> = [];

  for (const symbol of rawSymbols) {
    const symbolPattern = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);

    for (const [filePath, file] of Object.entries(files)) {
      if (file?.type !== 'file' || file.isBinary || results.some((result) => result.symbol === symbol)) {
        continue;
      }

      const lines = file.content.split(/\r?\n/);
      const lineIndex = lines.findIndex((line) => symbolPattern.test(line));

      if (lineIndex >= 0) {
        results.push({
          symbol,
          filePath,
          line: lineIndex + 1,
          preview: lines[lineIndex].trim().slice(0, 160),
        });
      }
    }
  }

  return results.slice(0, 12);
}

function buildProjectAgentPrompt({
  message,
  mode,
  planFirst,
  mentionedFiles,
  mentionedSymbols,
}: {
  message: string;
  mode: ProjectAgentExecutionMode;
  planFirst: boolean;
  mentionedFiles: string[];
  mentionedSymbols: Array<{ symbol: string; filePath: string; line: number; preview: string }>;
}) {
  const modeConfig = PROJECT_AGENT_EXECUTION_MODES.find((item) => item.id === mode) ?? PROJECT_AGENT_EXECUTION_MODES[2];

  const guardrails = [
    `Mode: ${modeConfig.label}. ${modeConfig.description}`,
    planFirst
      ? 'Plan first is enabled: produce a concise, reviewable plan and wait for explicit approval before editing files, running shell commands, deploying, or applying destructive actions.'
      : 'Plan first is disabled: proceed according to the selected mode, but keep changes scoped and verify them.',
    mode === 'edit' || mode === 'agent'
      ? 'Diff review is enforced by the IDE: file edits are captured as patch proposals and must be accepted or rejected by the user before they are applied.'
      : 'No file patch should be produced in this mode unless the user explicitly switches to Edit or Agent.',
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

  if (mentionedSymbols.length > 0) {
    guardrails.push(
      `User-selected symbol context: ${mentionedSymbols
        .map((item) => `#${item.symbol} at ${item.filePath}:${item.line} (${item.preview})`)
        .join('; ')}`,
    );
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

function HeaderTip({
  label,
  children,
  side = 'bottom',
}: {
  label: string;
  children: React.ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          className="z-[80] max-w-[240px] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-2 py-1 text-[11px] font-medium leading-tight text-bolt-elements-textPrimary shadow-md"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function AgentPatchReviewQueue({ proposals }: { proposals: any[] }) {
  const [selectedHunksByProposal, setSelectedHunksByProposal] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    setSelectedHunksByProposal((current) => {
      let changed = false;

      const next = { ...current };

      for (const proposal of proposals) {
        if (!next[proposal.id]) {
          next[proposal.id] = new Set(proposal.hunks.map((hunk: any) => hunk.id));
          changed = true;
        }
      }

      for (const proposalId of Object.keys(next)) {
        if (!proposals.some((proposal) => proposal.id === proposalId)) {
          delete next[proposalId];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [proposals]);

  if (!proposals.length) {
    return null;
  }

  const toggleHunk = (proposalId: string, hunkId: string) => {
    setSelectedHunksByProposal((current) => {
      const selected = new Set(current[proposalId] ?? []);

      if (selected.has(hunkId)) {
        selected.delete(hunkId);
      } else {
        selected.add(hunkId);
      }

      return { ...current, [proposalId]: selected };
    });
  };

  const pendingForBulk = proposals.filter((proposal) => proposal.status !== 'applying');

  const acceptAll = () => {
    for (const proposal of pendingForBulk) {
      const selected = selectedHunksByProposal[proposal.id] ?? new Set(proposal.hunks.map((hunk: any) => hunk.id));

      if (selected.size === 0) {
        continue;
      }

      workbenchStore.acceptAgentPatchProposal(proposal.id, Array.from(selected));
    }
  };
  const rejectAll = () => {
    for (const proposal of pendingForBulk) {
      workbenchStore.rejectAgentPatchProposal(proposal.id);
    }
  };

  return (
    <section className="bolt-project-agent-patch-review" aria-label="AI patch review queue">
      <div className="bolt-project-agent-patch-review-head">
        <div>
          <strong>Review AI changes</strong>
          <span>
            {proposals.length} file proposal{proposals.length === 1 ? '' : 's'} waiting before apply
          </span>
        </div>
        <div className="bolt-project-agent-patch-review-bulk">
          <button
            type="button"
            className="bolt-project-agent-patch-review-bulk-accept"
            disabled={pendingForBulk.length === 0}
            onClick={acceptAll}
          >
            Accept all
          </button>
          <button
            type="button"
            className="bolt-project-agent-patch-review-bulk-reject"
            disabled={pendingForBulk.length === 0}
            onClick={rejectAll}
          >
            Reject all
          </button>
        </div>
      </div>
      <div className="bolt-project-agent-patch-review-list">
        {proposals.map((proposal) => {
          const selectedHunks =
            selectedHunksByProposal[proposal.id] ?? new Set(proposal.hunks.map((hunk: any) => hunk.id));

          const selectedCount = selectedHunks.size;
          const busy = proposal.status === 'applying';

          return (
            <article key={proposal.id} className="bolt-project-agent-patch-card" data-status={proposal.status}>
              <div className="bolt-project-agent-patch-card-head">
                <div>
                  <strong>{proposal.relativePath}</strong>
                  <span>
                    {proposal.hunks.length} hunk{proposal.hunks.length === 1 ? '' : 's'} · {selectedCount} selected
                  </span>
                </div>
                <div className="bolt-project-agent-patch-actions">
                  <button
                    type="button"
                    disabled={busy || selectedCount === 0}
                    onClick={() => workbenchStore.acceptAgentPatchProposal(proposal.id, Array.from(selectedHunks))}
                  >
                    Accept selected
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => workbenchStore.rejectAgentPatchProposal(proposal.id)}
                  >
                    Reject file
                  </button>
                </div>
              </div>
              {proposal.error ? <p className="bolt-project-agent-patch-error">{proposal.error}</p> : null}
              <details className="bolt-project-agent-patch-hunks-toggle">
                <summary>
                  <span className="bolt-project-agent-patch-hunks-toggle-label">
                    Show diff
                    <span className="bolt-project-agent-patch-hunks-toggle-count">
                      {proposal.hunks.length} hunk{proposal.hunks.length === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="bolt-project-agent-patch-hunks-toggle-chevron i-ph:caret-down" aria-hidden />
                </summary>
                <div className="bolt-project-agent-patch-hunks">
                  {proposal.hunks.map((hunk: any, index: number) => {
                    const checked = selectedHunks.has(hunk.id);

                    return (
                      <div key={hunk.id} className="bolt-project-agent-patch-hunk bolt-project-agent-patch-hunk--flat">
                        <div className="bolt-project-agent-patch-hunk-head">
                          <label onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleHunk(proposal.id, hunk.id)}
                            />
                            Hunk {index + 1}
                          </label>
                          <span>
                            -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines}
                          </span>
                        </div>
                        <pre aria-label={`Diff hunk ${index + 1} for ${proposal.relativePath}`}>
                          {hunk.lines.map((line: any) => (
                            <code key={line.id} data-line-type={line.type}>
                              {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                              {line.content}
                            </code>
                          ))}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
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
      description,
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
    const initialBottomTerminalUiState = useMemo(readProjectBottomTerminalUiState, []);
    const [terminalBottomOpen, setTerminalBottomOpen] = useState<boolean>(initialBottomTerminalUiState.open);
    const [terminalBottomHeight, setTerminalBottomHeight] = useState<number>(initialBottomTerminalUiState.height);
    const [bottomTerminalView, setBottomTerminalView] = useState<ProjectBottomTerminalView>('terminal');
    const [editorMinimapEnabled, setEditorMinimapEnabled] = useState(true);
    const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile' | 'custom'>('desktop');
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [commandPaletteMode, setCommandPaletteMode] = useState<'all' | 'tools' | 'files'>('all');
    const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
    const [commandPaletteIndex, setCommandPaletteIndex] = useState(0);
    const [conversationHistoryOpen, setConversationHistoryOpen] = useState(false);
    const [conversationHistoryQuery, setConversationHistoryQuery] = useState('');
    const [projectAgentExecutionMode, setProjectAgentExecutionMode] = useState<ProjectAgentExecutionMode>('agent');

    const [projectPlanFirst, setProjectPlanFirst] = useState(() => {
      if (typeof window === 'undefined') {
        return false;
      }

      return window.localStorage.getItem('vibecore:agent-plan-first-default') === 'true';
    });

    useEffect(() => {
      if (typeof window === 'undefined') {
        return;
      }

      window.localStorage.setItem('vibecore:agent-plan-first-default', String(projectPlanFirst));
    }, [projectPlanFirst]);

    const [ideRailMoreOpen, setIdeRailMoreOpen] = useState(false);
    const [projectSnapshots, setProjectSnapshots] = useState<ProjectSnapshot[]>([]);
    const agentPatchProposals = useStore(workbenchStore.agentPatchProposals);

    const pendingAgentPatchProposals = useMemo(
      () =>
        Object.values(agentPatchProposals)
          .filter((proposal) => ['pending', 'applying', 'failed'].includes(proposal.status))
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      [agentPatchProposals],
    );

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

    const editorProjectFiles = useMemo(
      () =>
        Object.fromEntries(
          Object.entries(projectFiles).flatMap(([filePath, file]) =>
            file?.type === 'file' && !file.isBinary ? [[filePath, file.content]] : [],
          ),
        ),
      [projectFiles],
    );

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
    const statusbarDiagnostics = useMemo(() => {
      const errorPattern = /\b(error|failed|exception|crash|fatal)\b/i;
      const warningPattern = /\b(warn|warning|deprecated)\b/i;
      const logErrors = workspaceLogs.filter((line) => errorPattern.test(line)).length;
      const logWarnings = workspaceLogs.filter((line) => warningPattern.test(line) && !errorPattern.test(line)).length;

      return {
        errors: logErrors + (workspaceError ? 1 : 0),
        warnings: logWarnings,
      };
    }, [workspaceError, workspaceLogs]);

    const statusbarChangedFiles = projectBackendState.git?.changedFiles?.length ?? 0;

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
      workbenchStore.setAgentPatchReviewRequired(
        projectIdeMode && (projectAgentExecutionMode === 'edit' || projectAgentExecutionMode === 'agent'),
      );

      return () => {
        workbenchStore.setAgentPatchReviewRequired(false);
      };
    }, [projectAgentExecutionMode, projectIdeMode]);

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

          const localBottomTerminalUiState = readProjectBottomTerminalUiState();

          if (localBottomTerminalUiState.stored) {
            setTerminalBottomOpen(localBottomTerminalUiState.open);
            setTerminalBottomHeight(localBottomTerminalUiState.height);
          } else if (typeof ui?.terminalBottomOpen === 'boolean') {
            setTerminalBottomOpen(ui.terminalBottomOpen);
          }

          if (!localBottomTerminalUiState.stored && typeof ui?.terminalBottomHeight === 'number') {
            setTerminalBottomHeight(Math.min(720, Math.max(320, ui.terminalBottomHeight)));
          }

          if (ui?.cursorPositions && typeof ui.cursorPositions === 'object') {
            setCursorPositions(ui.cursorPositions);
          }

          if (typeof ui?.editorMinimapEnabled === 'boolean') {
            setEditorMinimapEnabled(ui.editorMinimapEnabled);
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
            editorMinimapEnabled,
            lockedItems: backendLockedItems,
            deletedPaths: backendDeletedPaths,
            showWorkbench: true,
          },
        }).catch((error) => {
          console.error('Failed to persist project IDE state', error);
        });
      }, 1000);

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
      editorMinimapEnabled,
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

    useEffect(() => {
      const handleOpenEditorFile = (event: Event) => {
        const filePath = (event as CustomEvent<{ filePath?: string }>).detail?.filePath;

        if (!filePath) {
          return;
        }

        const exactPath = projectFiles[filePath]
          ? filePath
          : Object.keys(projectFiles).find((path) => path.endsWith(filePath));

        if (exactPath) {
          openProjectFile(exactPath, { preview: false });
        }
      };

      window.addEventListener('vibecore:open-editor-file', handleOpenEditorFile);

      return () => window.removeEventListener('vibecore:open-editor-file', handleOpenEditorFile);
    }, [openProjectFile, projectFiles]);

    const runProjectEditorCommand = useCallback((command: string) => {
      window.dispatchEvent(new CustomEvent('vibecore:editor-command', { detail: { command } }));
    }, []);

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
          const nextHeight = Math.min(720, Math.max(320, startHeight + startY - moveEvent.clientY));
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
      if (typeof window === 'undefined') {
        return;
      }

      window.localStorage.setItem(
        PROJECT_BOTTOM_TERMINAL_UI_STORAGE_KEY,
        JSON.stringify({ height: terminalBottomHeight, open: terminalBottomOpen }),
      );
    }, [terminalBottomHeight, terminalBottomOpen]);

    const openBottomTerminal = useCallback(
      (view: ProjectBottomTerminalView = 'terminal') => {
        setBottomTerminalView(view);

        if (useMobileIde) {
          setMobileIdePanel('terminal');

          return;
        }

        setTerminalBottomOpen(true);
      },
      [useMobileIde],
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

    const networkToastRef = useRef<{ offline?: string | number; first: boolean }>({ first: true });

    useEffect(() => {
      const updateOnlineState = (transition: 'online' | 'offline' | 'init') => {
        const online = navigator.onLine;
        setIsOnline(online);

        if (transition === 'init' || !projectIdeMode) {
          return;
        }

        if (transition === 'offline') {
          if (networkToastRef.current.offline === undefined) {
            networkToastRef.current.offline = toast.warn('Connection lost. Reconnecting…', {
              autoClose: false,
              closeOnClick: false,
              icon: false,
            });
          }
        } else if (transition === 'online') {
          if (networkToastRef.current.offline !== undefined) {
            toast.dismiss(networkToastRef.current.offline);
            networkToastRef.current.offline = undefined;
          }

          if (!networkToastRef.current.first) {
            toast.success('Reconnected', { autoClose: 2500, icon: false });
          }
        }

        networkToastRef.current.first = false;
      };

      updateOnlineState('init');

      const onOffline = () => updateOnlineState('offline');
      const onOnline = () => updateOnlineState('online');

      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);

      return () => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);

        if (networkToastRef.current.offline !== undefined) {
          toast.dismiss(networkToastRef.current.offline);
          networkToastRef.current.offline = undefined;
        }
      };
    }, [projectIdeMode]);

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
          const mentionedSymbols = resolveMentionedProjectSymbols(rawMessage, projectFiles);

          const agentMessage = buildProjectAgentPrompt({
            message: rawMessage,
            mode: projectAgentExecutionMode,
            planFirst: projectPlanFirst,
            mentionedFiles,
            mentionedSymbols,
          });

          handleSendMessage?.(event, agentMessage);

          return;
        }

        handleSendMessage?.(event, messageInput);
      },
      [
        handleSendMessage,
        input,
        projectAgentExecutionMode,
        projectFilePaths,
        projectFiles,
        projectIdeMode,
        projectPlanFirst,
      ],
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

        const focusCheckpointMessage = () => {
          const targetId = checkpoint.messageId ?? checkpoint.messages.at(-1)?.id;

          let element: HTMLElement | null = null;

          if (targetId) {
            element = document.getElementById(`chat-message-${targetId}`);
          }

          if (!element) {
            const rows = document.querySelectorAll<HTMLElement>('[data-testid="ide-agent-panel"] [data-message-id]');
            element = rows[rows.length - 1] ?? null;
          }

          if (!element) {
            return false;
          }

          element.scrollIntoView({ block: 'center', behavior: 'smooth' });
          element.classList.add('bolt-project-chat-jump-highlight');
          window.setTimeout(() => element?.classList.remove('bolt-project-chat-jump-highlight'), 1600);

          return true;
        };

        let attempts = 0;

        const tryFocus = () => {
          if (focusCheckpointMessage() || attempts >= 12) {
            return;
          }

          attempts += 1;
          window.setTimeout(tryFocus, 60);
        };

        window.requestAnimationFrame(tryFocus);
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
                  <>
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
                    {projectIdeMode && pendingAgentPatchProposals.length > 0 && (
                      <div className="w-full max-w-chat mx-auto px-0 pb-4">
                        <AgentPatchReviewQueue proposals={pendingAgentPatchProposals} />
                      </div>
                    )}
                  </>
                ) : null;
              }}
            </ClientOnly>
            <ScrollToBottom />
          </StickToBottom.Content>
          <div
            className={classNames('my-auto flex flex-col gap-2 w-full max-w-chat mx-auto z-prompt mb-6', {
              'sticky bottom-2': chatStarted,
              'bolt-project-agent-composer': projectIdeMode,
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
              placeholder={
                projectIdeMode
                  ? `${
                      (
                        PROJECT_AGENT_EXECUTION_MODES.find((mode) => mode.id === projectAgentExecutionMode) ??
                        PROJECT_AGENT_EXECUTION_MODES[2]
                      ).placeholder
                    }${projectPlanFirst ? ' (Plan first)' : ''}`
                  : undefined
              }
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

    const togglePaneTabPinned = useCallback((paneId: string, tabId?: string) => {
      setPaneTree((currentTree) =>
        updateLeaf(currentTree, paneId, (leaf) => {
          const targetTabId = tabId ?? leaf.activeTabId ?? leaf.tabs[0]?.id;

          if (!targetTabId) {
            return leaf;
          }

          return {
            ...leaf,
            tabs: leaf.tabs.map((tab) => (tab.id === targetTabId ? { ...tab, pinned: !tab.pinned } : tab)),
          };
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
          setPaneTree((currentTree) =>
            updateLeaf(currentTree, sourcePaneId, (leaf) => {
              const sourceIndex = leaf.tabs.findIndex((tab) => tab.id === sourceTabId);

              const targetIndex = targetTabId
                ? leaf.tabs.findIndex((tab) => tab.id === targetTabId)
                : leaf.tabs.length - 1;

              if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
                return leaf;
              }

              const tabs = [...leaf.tabs];
              const [sourceTab] = tabs.splice(sourceIndex, 1);
              const insertionIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
              tabs.splice(insertionIndex, 0, sourceTab);

              return {
                ...leaf,
                tabs,
                activeTabId: sourceTab.id,
              };
            }),
          );
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
                <button
                  type="button"
                  aria-pressed={editorMinimapEnabled}
                  title={editorMinimapEnabled ? 'Hide minimap' : 'Show minimap'}
                  onClick={() => setEditorMinimapEnabled((enabled) => !enabled)}
                  disabled={!currentDocument}
                >
                  Minimap
                </button>
                <button type="button" onClick={() => workbenchStore.resetCurrentDocument()} disabled={!currentDocument}>
                  Format
                </button>
                <button
                  type="button"
                  onClick={() => runProjectEditorCommand('goToDefinition')}
                  disabled={!currentDocument}
                  title="Go to definition"
                >
                  Definition
                </button>
                <button
                  type="button"
                  onClick={() => runProjectEditorCommand('findReferences')}
                  disabled={!currentDocument}
                  title="Find references"
                >
                  References
                </button>
                <button
                  type="button"
                  onClick={() => runProjectEditorCommand('renameSymbol')}
                  disabled={!currentDocument}
                  title="Rename symbol"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => runProjectEditorCommand('refactor')}
                  disabled={!currentDocument}
                  title="Open refactor menu"
                >
                  Refactor
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
                  minimapEnabled={editorMinimapEnabled}
                  projectFiles={editorProjectFiles}
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
              openEditors={flattenTabs(paneTree)
                .filter((tab) => tab.filePath)
                .map((tab) => ({
                  id: tab.id,
                  filePath: tab.filePath,
                  dirty: unsavedFiles instanceof Set && unsavedFiles.has(tab.filePath!),
                  pinned: Boolean(tab.pinned),
                }))}
              changedFiles={projectBackendState.git?.fileStatuses ?? projectBackendState.git?.changedFiles}
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
                    onOpenSourceFile={(filePath) => openProjectFile(filePath, { preview: false })}
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
        editorMinimapEnabled,
        editorProjectFiles,
        onProjectEditorSave,
        openIdeTool,
        openProjectFile,
        previewDevice,
        projectFiles,
        projectId,
        recentProjectFiles,
        runProjectEditorCommand,
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
              tabs={leaf.tabs.map((tab) => {
                const label =
                  tab.panel === 'editor'
                    ? tab.filePath?.replace(WORK_DIR, '') ||
                      currentDocument?.filePath?.replace(WORK_DIR, '') ||
                      'Editor'
                    : panelTitle(tab.panel);

                return {
                  ...tab,
                  label,
                  displayLabel: formatEditorTabLabel(label, tab.panel),
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
                };
              })}
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
              onTogglePin={(tabId) => togglePaneTabPinned(leaf.id, tabId)}
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

    const ideRailPrimaryItems = [
      {
        id: 'agent',
        label: 'Agent',
        icon: 'i-ph:sparkle',
        active: true,
        badge: statusbarDiagnostics.errors > 0 ? statusbarDiagnostics.errors : undefined,
        badgeLabel:
          statusbarDiagnostics.errors > 0
            ? `${statusbarDiagnostics.errors} project error${statusbarDiagnostics.errors === 1 ? '' : 's'}`
            : undefined,
        badgeTone: 'danger',
        title: 'Focus AI agent',
        action: () => textareaRef?.current?.focus(),
      },
      {
        id: 'files',
        label: 'Files',
        icon: 'i-ph:files',
        active: rightPanelOpen && rightPanelMode === 'files',
        badge: statusbarChangedFiles || undefined,
        badgeLabel:
          statusbarChangedFiles > 0
            ? `${statusbarChangedFiles} changed file${statusbarChangedFiles === 1 ? '' : 's'}`
            : undefined,
        badgeTone: statusbarChangedFiles > 0 ? 'warning' : 'neutral',
        title: `${projectFilePaths.length} indexed files${statusbarChangedFiles ? `, ${statusbarChangedFiles} changed` : ''}`,
        action: () => openIdeTool('files'),
      },
      {
        id: 'editor',
        label: 'Editor',
        icon: 'i-ph:code',
        active: activeWorkspacePanel === 'editor',
        badge: unsavedFiles instanceof Set && unsavedFiles.size > 0 ? unsavedFiles.size : undefined,
        badgeLabel:
          unsavedFiles instanceof Set && unsavedFiles.size > 0
            ? `${unsavedFiles.size} unsaved editor${unsavedFiles.size === 1 ? '' : 's'}`
            : undefined,
        badgeTone: 'warning',
        title: 'Open editor',
        action: () => openIdeTool('editor'),
      },
      {
        id: 'terminal',
        label: 'Terminal',
        icon: 'i-ph:terminal-window',
        active: terminalBottomOpen && bottomTerminalView === 'terminal',
        badge:
          workspaceStatus?.status?.toLowerCase() === 'running' || runtimePreviews.length > 0
            ? Math.max(1, runtimePreviews.length)
            : undefined,
        badgeLabel:
          workspaceStatus?.status?.toLowerCase() === 'running' || runtimePreviews.length > 0
            ? runtimePreviews.length > 0
              ? `${runtimePreviews.length} active preview port${runtimePreviews.length === 1 ? '' : 's'}`
              : 'workspace runtime is running'
            : undefined,
        badgeTone: 'success',
        title: 'Open terminal',
        action: () => openBottomTerminal('terminal'),
      },
      {
        id: 'preview',
        label: 'Preview',
        icon: 'i-ph:browser',
        active: activeWorkspacePanel === 'preview',
        badge: runtimePreviews.length || undefined,
        badgeLabel:
          runtimePreviews.length > 0
            ? `${runtimePreviews.length} active preview port${runtimePreviews.length === 1 ? '' : 's'}`
            : undefined,
        badgeTone: runtimePreviews.length > 0 ? 'success' : 'neutral',
        title: runtimePreviews.length
          ? `${runtimePreviews.length} preview port${runtimePreviews.length === 1 ? '' : 's'}`
          : 'Open preview',
        action: () => openIdeTool('preview'),
      },
      {
        id: 'publish',
        label: 'Publish',
        icon: 'i-ph:rocket-launch',
        active: activeWorkspacePanel === 'deployments',
        badge: undefined,
        badgeTone: 'neutral',
        title: 'Open deployments and publishing',
        action: () => openIdeTool('deployments'),
      },
    ] as const;

    const ideRailMoreItems = [
      { panel: 'search', label: 'Search', icon: 'i-ph:magnifying-glass', badge: undefined, tone: 'neutral' },
      {
        panel: 'git',
        label: 'Git',
        icon: 'i-ph:git-branch',
        badge: statusbarChangedFiles || undefined,
        badgeLabel:
          statusbarChangedFiles > 0
            ? `${statusbarChangedFiles} changed file${statusbarChangedFiles === 1 ? '' : 's'}`
            : undefined,
        tone: 'warning',
      },
      { panel: 'database', label: 'Database', icon: 'i-ph:database', badge: undefined, tone: 'neutral' },
      { panel: 'packages', label: 'Packages', icon: 'i-ph:cube', badge: undefined, tone: 'neutral' },
      {
        panel: 'monitoring',
        label: 'Monitoring',
        icon: 'i-ph:chart-line',
        badge: statusbarDiagnostics.errors || undefined,
        badgeLabel:
          statusbarDiagnostics.errors > 0
            ? `${statusbarDiagnostics.errors} project error${statusbarDiagnostics.errors === 1 ? '' : 's'}`
            : undefined,
        tone: statusbarDiagnostics.errors > 0 ? 'danger' : 'neutral',
      },
      { panel: 'security', label: 'Security', icon: 'i-ph:shield-check', badge: undefined, tone: 'neutral' },
      {
        panel: 'activity',
        label: 'Activity',
        icon: 'i-ph:activity',
        badge: workspaceLogs.length || undefined,
        badgeLabel:
          workspaceLogs.length > 0
            ? `${workspaceLogs.length} workspace log event${workspaceLogs.length === 1 ? '' : 's'}`
            : undefined,
        tone: 'neutral',
      },
      { panel: 'settings', label: 'Settings', icon: 'i-ph:gear', badge: undefined, tone: 'neutral' },
    ] as const;

    const renderIdeRailPrimaryItem = (item: (typeof ideRailPrimaryItems)[number]) => {
      const badgeLabel = 'badgeLabel' in item ? item.badgeLabel : undefined;

      return (
        <button
          key={item.id}
          type="button"
          className="bolt-project-ide-rail-item"
          aria-current={item.active ? 'page' : undefined}
          aria-label={formatRailItemLabel(item.label, badgeLabel)}
          title={formatRailItemTitle(item.title, badgeLabel)}
          data-tone={item.badgeTone}
          onClick={item.action}
        >
          <span className={item.icon} aria-hidden />
          <span className="bolt-project-ide-rail-label">{item.label}</span>
          {item.badge ? (
            <span className="bolt-project-ide-rail-badge" aria-hidden>
              {formatRailBadgeValue(item.badge)}
            </span>
          ) : null}
        </button>
      );
    };

    const renderIdeRailMoreItem = (item: (typeof ideRailMoreItems)[number]) => {
      const badgeLabel = 'badgeLabel' in item ? item.badgeLabel : undefined;

      return (
        <button
          key={item.panel}
          type="button"
          className="bolt-project-ide-rail-item bolt-project-ide-rail-item-compact"
          aria-current={activeWorkspacePanel === item.panel ? 'page' : undefined}
          aria-label={formatRailItemLabel(item.label, badgeLabel)}
          title={formatRailItemTitle(IDE_TOOL_DESCRIPTIONS[item.panel], badgeLabel)}
          data-tone={item.tone}
          onClick={() => openIdeTool(item.panel)}
        >
          <span className={item.icon} aria-hidden />
          <span className="bolt-project-ide-rail-label">{item.label}</span>
          {item.badge ? (
            <span className="bolt-project-ide-rail-badge" aria-hidden>
              {formatRailBadgeValue(item.badge)}
            </span>
          ) : null}
        </button>
      );
    };

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
            <span className="bolt-project-agent-title" title={description?.trim() || 'New chat'}>
              {description?.trim() || 'New chat'}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <HeaderTip label="Switch light / dark theme">
                <ThemeSwitch size="lg" title="" className="bolt-project-ide-icon-button" iconClassName="text-[14px]" />
              </HeaderTip>
              <HeaderTip label="Conversation history">
                <button
                  type="button"
                  className="bolt-project-ide-icon-button"
                  aria-label="Conversation history"
                  onClick={() => setConversationHistoryOpen((value) => !value)}
                >
                  <span className="i-ph:clock" aria-hidden />
                </button>
              </HeaderTip>
              <HeaderTip label="Start a new chat">
                <button
                  type="button"
                  className="bolt-project-ide-icon-button"
                  aria-label="New chat"
                  onClick={resetChat}
                >
                  <span className="i-ph:plus" aria-hidden />
                </button>
              </HeaderTip>
              <HeaderTip label="Agent settings">
                <button
                  type="button"
                  className="bolt-project-ide-icon-button"
                  aria-label="Agent settings"
                  onClick={() => openWorkspacePanel('settings')}
                >
                  <span className="i-ph:sliders-horizontal" aria-hidden />
                </button>
              </HeaderTip>
            </div>
          </div>
          {(() => {
            const activePublicMode = publicModeForExecution(projectAgentExecutionMode);

            const activeMode =
              PROJECT_AGENT_PUBLIC_MODES.find((mode) => mode.id === activePublicMode) ?? PROJECT_AGENT_PUBLIC_MODES[0];

            return (
              <div className="bolt-project-agent-mode-bar" role="region" aria-label="Agent mode controls">
                <div
                  className="bolt-project-agent-mode bolt-project-agent-mode--segmented"
                  role="tablist"
                  aria-label="Agent mode"
                >
                  {PROJECT_AGENT_PUBLIC_MODES.map((mode) => {
                    const isActive = activePublicMode === mode.id;

                    return (
                      <HeaderTip key={mode.id} label={mode.description}>
                        <button
                          type="button"
                          role="tab"
                          aria-pressed={isActive}
                          aria-selected={isActive}
                          onClick={() => {
                            const execution = PROJECT_AGENT_EXECUTION_MODES.find(
                              (entry) => entry.id === mode.execution,
                            );
                            setProjectAgentExecutionMode(mode.execution);
                            setChatMode?.(execution?.chatMode ?? 'build');
                          }}
                        >
                          {mode.label}
                        </button>
                      </HeaderTip>
                    );
                  })}
                </div>
                <div className="bolt-project-agent-mode-toggles" role="group" aria-label="Execution guardrails">
                  <HeaderTip label="When enabled, the agent must return a plan and wait for approval before executing changes.">
                    <label className="bolt-project-agent-plan-first" data-active={projectPlanFirst ? 'true' : 'false'}>
                      <input
                        type="checkbox"
                        checked={projectPlanFirst}
                        onChange={(event) => setProjectPlanFirst(event.currentTarget.checked)}
                        aria-label="Plan first"
                      />
                      <span className="bolt-project-agent-plan-first-track" aria-hidden>
                        <span className="bolt-project-agent-plan-first-thumb" />
                      </span>
                      <span className="bolt-project-agent-plan-first-label">Plan first</span>
                    </label>
                  </HeaderTip>
                </div>
                <p className="bolt-project-agent-mode-description">
                  {activeMode.description}
                  {projectPlanFirst ? ' Plan first is on — the agent will draft a plan and wait for approval.' : ''}
                </p>
              </div>
            );
          })()}
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
        <aside className="bolt-project-ide-rail" aria-label="IDE panels">
          <div className="bolt-project-ide-rail-primary">{ideRailPrimaryItems.map(renderIdeRailPrimaryItem)}</div>
          <div className="bolt-project-ide-rail-more">
            <button
              type="button"
              className="bolt-project-ide-rail-more-trigger"
              aria-expanded={ideRailMoreOpen}
              aria-controls="ide-rail-more-views"
              title="More views: Search, Git, Database, Packages, Monitoring, Security, Activity and Settings"
              aria-label="More IDE views"
              onClick={() => setIdeRailMoreOpen((open) => !open)}
            >
              <span className={ideRailMoreOpen ? 'i-ph:caret-up' : 'i-ph:caret-down'} aria-hidden />
              <span>More views</span>
            </button>
            {ideRailMoreOpen && (
              <div id="ide-rail-more-views" className="bolt-project-ide-rail-more-list">
                {ideRailMoreItems.map(renderIdeRailMoreItem)}
              </div>
            )}
          </div>
        </aside>
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
                      active={bottomTerminalView}
                      onActiveChange={setBottomTerminalView}
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
                  openEditors={flattenTabs(paneTree)
                    .filter((tab) => tab.filePath)
                    .map((tab) => ({
                      id: tab.id,
                      filePath: tab.filePath,
                      dirty: unsavedFiles instanceof Set && unsavedFiles.has(tab.filePath!),
                      pinned: Boolean(tab.pinned),
                    }))}
                  changedFiles={projectBackendState.git?.fileStatuses ?? projectBackendState.git?.changedFiles}
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
              <span>{id === 'deploy' ? 'Publish' : label}</span>
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
            <div className="bolt-project-statusbar-primary">
              <button
                type="button"
                className="bolt-project-statusbar-pill"
                aria-label={`Open Git panel. Branch ${projectBackendState.git?.branch ?? 'main'}, ${
                  projectBackendState.git?.ahead ?? 0
                } ahead, ${projectBackendState.git?.behind ?? 0} behind, ${statusbarChangedFiles} changed files.`}
                title={`Git branch: ${projectBackendState.git?.branch ?? 'main'} | Ahead ${
                  projectBackendState.git?.ahead ?? 0
                }, behind ${projectBackendState.git?.behind ?? 0} | ${statusbarChangedFiles} changed files`}
                onClick={() => openWorkspacePanel('git')}
              >
                <span className="i-ph:git-branch" aria-hidden />
                <span className="bolt-project-statusbar-label">Git</span>
                <strong>{projectBackendState.git?.branch ?? 'main'}</strong>
                <span className="bolt-project-statusbar-muted">
                  {projectBackendState.git?.ahead ?? 0}↑ {projectBackendState.git?.behind ?? 0}↓
                </span>
                {statusbarChangedFiles > 0 ? (
                  <span className="bolt-project-statusbar-count" aria-label={`${statusbarChangedFiles} changed files`}>
                    {statusbarChangedFiles}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className="bolt-project-statusbar-pill"
                aria-label={`Open Problems. ${statusbarDiagnostics.errors} errors and ${statusbarDiagnostics.warnings} warnings.`}
                title={`Problems: ${statusbarDiagnostics.errors} errors, ${statusbarDiagnostics.warnings} warnings`}
                onClick={() => openBottomTerminal('problems')}
              >
                <span className="i-ph:warning-circle" aria-hidden />
                <span className="bolt-project-statusbar-label">Problems</span>
                <span className="bolt-project-statusbar-error-count">{statusbarDiagnostics.errors}</span>
                <span className="bolt-project-statusbar-warning-count">{statusbarDiagnostics.warnings}</span>
              </button>
              <button
                type="button"
                className="bolt-project-statusbar-pill bolt-project-statusbar-workspace"
                onClick={() => openBottomTerminal('terminal')}
                title={workspaceStatusTitle}
                aria-label={workspaceStatusTitle || 'Open workspace terminal'}
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
                <span className="bolt-project-statusbar-label">Workspace</span>
                <strong>{workspaceStatusLabel}</strong>
                {quotaWarning ? <span>{quotaWarning}</span> : null}
                {billingUpgradePrompt ? <span>{billingUpgradePrompt}</span> : null}
                {workspaceError ? <span>{workspaceError}</span> : null}
              </button>
              {workspaceLogs.length > 0 ? (
                <button
                  type="button"
                  className="bolt-project-statusbar-pill bolt-project-statusbar-logs"
                  onClick={() => {
                    setBottomTerminalView('output');

                    if (useMobileIde) {
                      setMobileIdePanel('terminal');
                    } else {
                      setTerminalBottomOpen((value) => !value);
                    }
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
                  <span>{!useMobileIde && terminalBottomOpen ? 'Hide logs' : 'Logs'}</span>
                  <span className="bolt-project-statusbar-count">{workspaceLogs.length}</span>
                </button>
              ) : null}
              <button
                type="button"
                className="bolt-project-statusbar-pill bolt-project-statusbar-runtime"
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
                title={`Open preview | ${runtimeStatusSummary} | ${runtimePortSummary} | ${runtimeDevServerSummary}`}
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
                <span className="bolt-project-statusbar-label">Preview</span>
                <strong>{runtimeStatusSummary}</strong>
                <span className="bolt-project-statusbar-muted">{runtimePortSummary}</span>
                <span className="bolt-project-statusbar-muted">{runtimeDevServerSummary}</span>
              </button>
            </div>
            <div className="bolt-project-statusbar-secondary" aria-label="Editor status">
              <span
                className="bolt-project-statusbar-pill bolt-project-statusbar-editor"
                title="Current cursor position"
              >
                {currentDocument?.filePath && cursorPositions[currentDocument.filePath]
                  ? `Ln ${cursorPositions[currentDocument.filePath].line}, Col ${
                      cursorPositions[currentDocument.filePath].column
                    }`
                  : 'Ln 1, Col 1'}
              </span>
              <span className="bolt-project-statusbar-pill" title="Indentation: 2 spaces">
                Spaces: 2
              </span>
              <span className="bolt-project-statusbar-pill" title="File encoding: UTF-8">
                UTF-8
              </span>
              <span className="bolt-project-statusbar-pill" title="Detected language mode">
                {fileTypeLabel(currentDocument?.filePath)}
              </span>
              <button
                type="button"
                aria-label="Toggle terminal"
                title="Toggle terminal"
                className="bolt-project-statusbar-icon-button"
                onClick={() => {
                  setBottomTerminalView('terminal');
                  setTerminalBottomOpen((value) => !value);
                }}
              >
                <span className="i-ph:terminal-window" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Focus agent composer"
                title="Focus agent composer"
                className="bolt-project-statusbar-icon-button"
                onClick={() => textareaRef?.current?.focus()}
              >
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
  const [lastLoadedAt, setLastLoadedAt] = useState<string>();
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

  const loadPanel = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!projectId) {
        return;
      }

      if (!options?.silent) {
        setBusy(true);
      }

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
        setLastLoadedAt(new Date().toISOString());
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load IDE panel');
        setPayload(undefined);
      } finally {
        if (!options?.silent) {
          setBusy(false);
        }
      }
    },
    [fetchPanel, panel, projectId],
  );

  useEffect(() => {
    void loadPanel();
  }, [loadPanel]);

  useEffect(() => {
    if (!['activity', 'logs', 'monitoring'].includes(panel)) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void loadPanel({ silent: true });
    }, 15000);

    return () => window.clearInterval(interval);
  }, [loadPanel, panel]);

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

    const formData = new FormData(form);
    const intent = String(formData.get('intent') ?? 'default');

    try {
      const response = await fetchPanel(`/api/projects/${projectId}/ide-panel/${panel}`, {
        method: 'POST',
        body: formData,
      });

      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? 'Panel action failed');
      }

      form.reset();
      await loadPanel();
      window.dispatchEvent(new CustomEvent('vibecore:ide-panel-action', { detail: { panel, intent, ok: true } }));
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Panel action failed';

      setError(message);
      window.dispatchEvent(
        new CustomEvent('vibecore:ide-panel-action', { detail: { panel, intent, ok: false, error: message } }),
      );
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
            lastLoadedAt={lastLoadedAt}
          />
        )}
      </div>
    </div>
  );
}

function ProjectBottomTerminal({
  projectId,
  active,
  onActiveChange,
  onClose,
}: {
  projectId?: string;
  active: ProjectBottomTerminalView;
  onActiveChange: (view: ProjectBottomTerminalView) => void;
  onClose: () => void;
}) {
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
              onClick={() => onActiveChange(id)}
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
          <span className="bolt-project-bottom-terminal-session" title={backendSessionId}>
            Session {backendSessionId === 'no-workspace' ? 'pending' : backendSessionId.slice(0, 8)}
          </span>
          <button
            type="button"
            aria-label="Refresh runtime logs"
            onClick={() => {
              onActiveChange('terminal');
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
          <ProjectIdeServicePanel projectId={projectId} panel="debugger" />
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
  openEditors = [],
  changedFiles = [],
  onFilePreview,
  onFileOpen,
}: {
  files: any;
  selectedFile?: string;
  unsavedFiles?: Set<string>;
  openEditors?: Array<{ id: string; filePath?: string; dirty?: boolean; pinned?: boolean }>;
  changedFiles?: unknown[];
  onFilePreview: (filePath: string) => void;
  onFileOpen: (filePath: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const gitStatusByPath = useMemo(() => buildGitStatusMap(changedFiles), [changedFiles]);

  const fileOpenEditors = useMemo(
    () =>
      openEditors
        .filter((editor) => typeof editor.filePath === 'string' && editor.filePath)
        .map((editor) => ({
          id: editor.id,
          filePath: editor.filePath as string,
          dirty: editor.dirty,
          pinned: editor.pinned,
        })),
    [openEditors],
  );

  const fileCount = Object.entries(files ?? {}).filter(
    ([filePath, entry]: [string, any]) => entry?.type === 'file' && !isIdeHiddenPath(filePath),
  ).length;

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
        hiddenFiles={IDE_FILE_TREE_HIDDEN_PATTERNS}
        unsavedFiles={unsavedFiles}
        openEditors={fileOpenEditors}
        gitStatusByPath={gitStatusByPath}
        enableWorkspaceViews
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
  onTogglePin,
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
    displayLabel?: string;
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
  onTogglePin?: (tabId?: string) => void;
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
    ['debugger', 'Debugger', 'Breakpoints and launch configs', 'i-ph:bug', 'var(--vc-ide-accent-action)', 'Project'],
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
            data-dirty={tab.dirty ? 'true' : undefined}
            aria-label={`${tab.pinned ? 'Pinned tab: ' : ''}${tab.label}${tab.dirty ? ', unsaved changes' : ''}`}
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
              <span
                className={classNames('bolt-project-tab-icon', tab.pinned ? 'i-ph:push-pin-simple' : tab.icon)}
                aria-hidden
              />
              <span className={classNames('bolt-project-tab-label', tab.preview || tab.dirty ? 'italic' : '')}>
                {tab.displayLabel ?? tab.label}
              </span>
              {tab.dirty ? <span className="bolt-project-tab-dirty-dot" aria-hidden /> : null}
            </button>
            {onTogglePin ? (
              <button
                type="button"
                className="bolt-project-tab-pin"
                aria-label={`${tab.pinned ? 'Unpin' : 'Pin'} ${tab.label}`}
                title={`${tab.pinned ? 'Unpin' : 'Pin'} ${tab.label}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onTogglePin(tab.id);
                }}
              >
                <span className={tab.pinned ? 'i-ph:push-pin-simple-fill' : 'i-ph:push-pin-simple'} aria-hidden />
              </button>
            ) : null}
            {tab.dirty ? (
              <button
                type="button"
                className="bolt-project-tab-save"
                aria-label={`Save ${tab.label}`}
                title={`Save ${tab.label}`}
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
          aria-label="Add tab"
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
                onTogglePin?.(activeTabId ?? tabs[0]?.id);
                setActionsOpen(false);
              }}
            >
              <span className="i-ph:push-pin-simple" aria-hidden />
              {tabs.find((tab) => tab.id === activeTabId)?.pinned ? 'Unpin tab' : 'Pin tab'}
            </button>
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
  lastLoadedAt,
}: {
  panel: string;
  data: any;
  project: any;
  projectId?: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  reload?: () => void | Promise<void>;
  lastLoadedAt?: string;
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
    return <ProjectDatabasePanel projectId={projectId} data={data} onSubmit={onSubmit} busy={busy} reload={reload} />;
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
    return <ProjectSecurityPanel data={data} project={project} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'logs') {
    return <ProjectLogsPanel data={data} reload={reload} busy={busy} />;
  }

  if (panel === 'debugger') {
    return <ProjectDebuggerPanel data={data} onSubmit={onSubmit} busy={busy} reload={reload} />;
  }

  if (panel === 'snapshots') {
    const snapshots = ([...(data.snapshots ?? [])] as ProjectSnapshot[]).sort((a, b) => {
      return Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? '');
    });

    return (
      <section className="bolt-project-snapshots-panel" aria-label="Project checkpoints">
        <div className="bolt-project-snapshots-header">
          <div>
            <h3>Checkpoints</h3>
            <p>Restore a known-good project state or create a manual checkpoint before risky changes.</p>
          </div>
          <form onSubmit={onSubmit} className="bolt-project-snapshots-create">
            <input name="intent" value="create" type="hidden" />
            <PanelInput name="label" placeholder="Manual checkpoint" />
            <PanelButton disabled={busy}>+ New checkpoint</PanelButton>
          </form>
        </div>
        {snapshots.length ? (
          <div className="bolt-project-snapshots-timeline">
            {snapshots.map((snapshot, index) => {
              const previousSnapshot = snapshots[index + 1];
              const files = snapshotFiles(snapshot);
              const diff = snapshotDiffSummary(snapshot, previousSnapshot);
              const modifiedCount = diff.added.length + diff.changed.length + diff.removed.length;
              const fileCountLabel = `${files.length} file${files.length === 1 ? '' : 's'}`;
              const title = snapshot.label || snapshotKindLabel(snapshot);
              const exactDate = snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : 'Recorded';

              return (
                <article key={snapshot.id} className="bolt-project-snapshot-card">
                  <div className="bolt-project-snapshot-rail" aria-hidden>
                    <span />
                  </div>
                  <div className="bolt-project-snapshot-body">
                    <div className="bolt-project-snapshot-main">
                      <div className="bolt-project-snapshot-title-row">
                        <span className="bolt-project-snapshot-kind">{snapshotAuthor(snapshot)}</span>
                        <strong title={title}>{title}</strong>
                      </div>
                      <div className="bolt-project-snapshot-meta" aria-label="Checkpoint metadata">
                        <span title={exactDate}>{timeAgo(snapshot.createdAt)}</span>
                        <span>{fileCountLabel}</span>
                        <span>{formatBytes(snapshot.byteLength)}</span>
                        <span>{modifiedCount ? `${modifiedCount} changed` : 'Baseline'}</span>
                      </div>
                      <details className="bolt-project-snapshot-diff">
                        <summary title={diff.sample.length ? diff.sample.join('\n') : 'No file metadata recorded'}>
                          Preview changed files
                        </summary>
                        {diff.sample.length ? (
                          <ul>
                            {diff.sample.map((path) => {
                              const marker = diff.added.includes(path)
                                ? 'A'
                                : diff.removed.includes(path)
                                  ? 'D'
                                  : diff.changed.includes(path)
                                    ? 'M'
                                    : '·';

                              return (
                                <li key={path} data-marker={marker}>
                                  <span>{marker}</span>
                                  <code>{path}</code>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p>No file manifest was recorded for this checkpoint.</p>
                        )}
                      </details>
                    </div>
                    <form onSubmit={onSubmit} className="bolt-project-snapshot-actions">
                      <input name="intent" value="restore" type="hidden" />
                      <input name="snapshotId" value={snapshot.id} type="hidden" />
                      <button type="submit" disabled={busy} aria-label={`Restore checkpoint ${title}`}>
                        Restore
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="bolt-project-snapshots-empty">
            <strong>No checkpoints yet</strong>
            <p>Create a checkpoint before major edits, package upgrades, or AI-led refactors.</p>
          </div>
        )}
      </section>
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
    return <ProjectDomainsPanel data={data} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'git') {
    return <ProjectGitPanel data={data} project={project} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'settings') {
    const settings = data.project ?? project;

    return <ProjectSettingsPanel settings={settings} data={data} onSubmit={onSubmit} busy={busy} />;
  }

  if (panel === 'activity') {
    return <ProjectActivityPanel data={data} reload={reload} busy={busy} lastLoadedAt={lastLoadedAt} />;
  }

  return <PanelRows rows={[]} empty="Panel not available." />;
}

function ProjectDomainsPanel({ data, onSubmit, busy }: { data: any; onSubmit: any; busy: boolean }) {
  const domains = data.domains ?? [];
  const latestReadyDeployment = (data.deployments ?? []).find((deployment: any) => deployment.status === 'READY');
  const deploymentHost = getHostname(latestReadyDeployment?.productionUrl ?? latestReadyDeployment?.url);
  const hasRoutingTarget = Boolean(deploymentHost);

  return (
    <div className="bolt-project-domains-panel">
      <section className="bolt-project-domains-hero" aria-labelledby="domains-title">
        <div>
          <span className="bolt-project-domains-kicker">Domains</span>
          <h3 id="domains-title">Production routing, DNS verification and managed TLS</h3>
          <p>
            Add a hostname, publish the DNS records below, then verify. VibeCore keeps redirect, wildcard and TLS
            readiness as backend state for this organization.
          </p>
        </div>
        <div className="bolt-project-domain-target-card">
          <span>Deployment target</span>
          <strong>{deploymentHost ?? 'Create a ready deployment first'}</strong>
          <small>
            {hasRoutingTarget
              ? 'Use this host as the CNAME or ALIAS target.'
              : 'The CNAME/A instructions unlock after the first successful deployment.'}
          </small>
        </div>
      </section>

      <div className="bolt-project-domains-layout">
        <section className="bolt-project-domain-add-card" aria-labelledby="add-domain-title">
          <div>
            <h4 id="add-domain-title">Add domain</h4>
            <p>Use a fully qualified domain. Wildcards are enabled per domain after it is created.</p>
          </div>
          <form onSubmit={onSubmit} className="bolt-project-domain-add-form">
            <label>
              Domain
              <PanelInput
                name="domain"
                inputMode="url"
                autoComplete="off"
                placeholder="app.example.com"
                pattern="^(?:[A-Za-z0-9](?:(?:[A-Za-z0-9]|-){0,61}[A-Za-z0-9])?[.])+[A-Za-z]{2,}$"
                title="Enter a valid domain such as app.example.com"
                aria-describedby="domain-help"
                required
              />
            </label>
            <small id="domain-help">No protocol, path or port. Example: app.example.com.</small>
            <PanelButton disabled={busy}>Add domain</PanelButton>
          </form>
        </section>

        {domains.length ? (
          <div className="bolt-project-domain-list">
            {domains.map((domain: any) => (
              <DomainVerificationCard
                key={domain.id}
                domain={domain}
                deploymentHost={deploymentHost}
                onSubmit={onSubmit}
                busy={busy}
              />
            ))}
          </div>
        ) : (
          <div className="bolt-project-domain-empty">
            <strong>No custom domains yet</strong>
            <span>Add a domain to generate organization-specific TXT verification records.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DomainVerificationCard({
  domain,
  deploymentHost,
  onSubmit,
  busy,
}: {
  domain: any;
  deploymentHost?: string;
  onSubmit: any;
  busy: boolean;
}) {
  const txtName = `_vibecore.${domain.domain}`;
  const txtValue = `vibecore-domain-verification=${domain.verificationToken}`;
  const rootName = domain.domain.split('.').length === 2 ? '@' : domain.domain.split('.')[0];

  const records = [
    { type: 'TXT', name: txtName, value: txtValue, state: 'Required' },
    {
      type: 'CNAME',
      name: rootName === '@' ? 'www' : rootName,
      value: deploymentHost ?? 'Waiting for a ready deployment',
      state: deploymentHost ? 'Routing' : 'Blocked',
    },
    {
      type: 'A / ALIAS',
      name: '@',
      value: deploymentHost ? `ALIAS or ANAME to ${deploymentHost}` : 'Waiting for a ready deployment',
      state: deploymentHost ? 'Apex' : 'Blocked',
    },
  ];

  if (domain.wildcardEnabled) {
    records.push({
      type: 'CNAME',
      name: `*.${domain.domain}`,
      value: deploymentHost ?? 'Waiting for a ready deployment',
      state: deploymentHost ? 'Wildcard' : 'Blocked',
    });
  }

  return (
    <article className="bolt-project-domain-card">
      <div className="bolt-project-domain-card-header">
        <div>
          <h4>{domain.domain}</h4>
          <p>Created {formatDomainDate(domain.createdAt)}</p>
        </div>
        <span className={classNames('bolt-project-domain-status', domain.verifiedAt ? 'verified' : 'pending')}>
          {domain.verifiedAt ? 'DNS verified' : 'Pending DNS'}
        </span>
      </div>

      <div className="bolt-project-domain-status-grid">
        <div>
          <span>Verification</span>
          <strong>{domain.verifiedAt ? formatDomainDate(domain.verifiedAt) : 'TXT record required'}</strong>
        </div>
        <div>
          <span>Auto TLS</span>
          <strong>
            {domain.sslStatus === 'dns_verified' ? 'Ready for certificate provisioning' : 'Waiting for DNS'}
          </strong>
        </div>
        <div>
          <span>WWW redirect</span>
          <strong>{domain.redirectWww ? 'Enabled' : 'Disabled'}</strong>
        </div>
        <div>
          <span>Wildcard</span>
          <strong>{domain.wildcardEnabled ? 'Enabled' : 'Off'}</strong>
        </div>
      </div>

      <div className="bolt-project-dns-records" aria-label={`DNS records for ${domain.domain}`}>
        <div className="bolt-project-dns-records-head">
          <span>Type</span>
          <span>Name</span>
          <span>Value</span>
          <span>Status</span>
        </div>
        {records.map((record) => (
          <div key={`${record.type}-${record.name}`} className="bolt-project-dns-record">
            <code>{record.type}</code>
            <code>{record.name}</code>
            <code title={record.value}>{record.value}</code>
            <span>{record.state}</span>
          </div>
        ))}
      </div>

      <div className="bolt-project-domain-actions">
        <form onSubmit={onSubmit}>
          <input name="intent" value="verify" type="hidden" />
          <input name="domain" value={domain.domain} type="hidden" />
          <PanelButton disabled={busy} variant={domain.verifiedAt ? 'outline' : undefined}>
            {domain.verifiedAt ? 'Recheck DNS' : 'Verify DNS'}
          </PanelButton>
        </form>

        <form onSubmit={onSubmit} className="bolt-project-domain-options">
          <input name="intent" value="configure" type="hidden" />
          <input name="domain" value={domain.domain} type="hidden" />
          <input name="redirectWww" value="false" type="hidden" />
          <label>
            <input name="redirectWww" value="true" type="checkbox" defaultChecked={domain.redirectWww} />
            Redirect www
          </label>
          <input name="wildcardEnabled" value="false" type="hidden" />
          <label>
            <input name="wildcardEnabled" value="true" type="checkbox" defaultChecked={domain.wildcardEnabled} />
            Wildcard subdomains
          </label>
          <PanelButton disabled={busy} variant="outline">
            Save routing
          </PanelButton>
        </form>
      </div>
    </article>
  );
}

function getHostname(url?: string) {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function formatDomainDate(value?: string) {
  if (!value) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function ProjectActivityPanel({
  data,
  reload,
  busy,
  lastLoadedAt,
}: {
  data: any;
  reload?: () => void | Promise<void>;
  busy: boolean;
  lastLoadedAt?: string;
}) {
  const events = data.activity ?? [];
  const [query, setQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | '15m' | '1h' | '24h'>('all');
  const [expandedEventId, setExpandedEventId] = useState<string>();

  const filterOptions = useMemo(() => {
    const actions = Array.from(new Set(events.map((event: any) => event.action).filter(Boolean))).sort() as string[];

    const actors = Array.from(
      new Set(events.map((event: any) => event.actorUserId).filter(Boolean)),
    ).sort() as string[];

    return { actions, actors };
  }, [events]);

  const filteredEvents = useMemo(() => {
    const search = query.trim().toLowerCase();
    const now = Date.now();

    const periodMs =
      periodFilter === '15m'
        ? 15 * 60 * 1000
        : periodFilter === '1h'
          ? 60 * 60 * 1000
          : periodFilter === '24h'
            ? 24 * 60 * 60 * 1000
            : 0;

    return events.filter((event: any) => {
      if (actionFilter !== 'all' && event.action !== actionFilter) {
        return false;
      }

      if (actorFilter !== 'all' && event.actorUserId !== actorFilter) {
        return false;
      }

      if (periodMs && event.createdAt && now - new Date(event.createdAt).getTime() > periodMs) {
        return false;
      }

      if (!search) {
        return true;
      }

      return (
        String(event.action ?? '')
          .toLowerCase()
          .includes(search) ||
        String(event.actorUserId ?? '')
          .toLowerCase()
          .includes(search) ||
        JSON.stringify(event.metadata ?? {})
          .toLowerCase()
          .includes(search)
      );
    });
  }, [actionFilter, actorFilter, events, periodFilter, query]);

  const ideSaveCount = events.filter((event: any) => event.action === 'project.ide_state.save').length;
  const importantCount = events.filter((event: any) => classifyProjectActivity(event.action) !== 'routine').length;

  return (
    <section className="bolt-project-activity-panel" aria-label="Project activity audit trail">
      <header className="bolt-project-activity-hero">
        <div>
          <span className="bolt-project-activity-eyebrow">Audit trail</span>
          <h3>Project activity</h3>
          <p>
            Backend activity, collaboration changes and operational events. Routine IDE UI saves are suppressed before
            they reach the activity stream.
          </p>
        </div>
        <button type="button" onClick={() => void reload?.()} disabled={busy}>
          <span className="i-ph:arrows-clockwise" aria-hidden />
          {busy ? 'Refreshing' : 'Refresh now'}
        </button>
      </header>

      <div className="bolt-project-activity-metrics" aria-label="Activity summary">
        <article>
          <span>Total events</span>
          <strong>{events.length}</strong>
          <small>
            {lastLoadedAt ? `Updated ${new Date(lastLoadedAt).toLocaleTimeString()}` : 'Live refresh every 15s'}
          </small>
        </article>
        <article>
          <span>Important</span>
          <strong>{importantCount}</strong>
          <small>Exports, deploys, collaborators, Git and runtime actions</small>
        </article>
        <article data-tone={ideSaveCount > 10 ? 'warning' : 'neutral'}>
          <span>IDE state saves</span>
          <strong>{ideSaveCount}</strong>
          <small>{ideSaveCount > 10 ? 'Legacy noise detected in current window' : 'Noise controlled'}</small>
        </article>
      </div>

      <div className="bolt-project-activity-filters">
        <label>
          <span>Search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find action, user or payload..."
            aria-label="Search project activity"
          />
        </label>
        <label>
          <span>Type</span>
          <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
            <option value="all">All event types</option>
            {filterOptions.actions.map((action: string) => (
              <option key={action} value={action}>
                {formatProjectActivityAction(action)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>User</span>
          <select value={actorFilter} onChange={(event) => setActorFilter(event.target.value)}>
            <option value="all">All users</option>
            {filterOptions.actors.map((actor: string) => (
              <option key={actor} value={actor}>
                {actor}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Period</span>
          <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value as any)}>
            <option value="all">All time</option>
            <option value="15m">Last 15 minutes</option>
            <option value="1h">Last hour</option>
            <option value="24h">Last 24 hours</option>
          </select>
        </label>
      </div>

      <div className="bolt-project-activity-list" role="list" aria-live="polite">
        {filteredEvents.length ? (
          filteredEvents.map((event: any) => {
            const expanded = expandedEventId === event.id;
            const severity = classifyProjectActivity(event.action);

            return (
              <article key={event.id} className="bolt-project-activity-event" data-severity={severity} role="listitem">
                <button
                  type="button"
                  className="bolt-project-activity-event-main"
                  onClick={() => setExpandedEventId(expanded ? undefined : event.id)}
                  aria-expanded={expanded}
                >
                  <span className="bolt-project-activity-dot" aria-hidden />
                  <span>
                    <strong>{formatProjectActivityAction(event.action)}</strong>
                    <small>
                      {event.createdAt ? new Date(event.createdAt).toLocaleString() : 'Recorded by backend'}
                      {event.actorUserId ? ` · ${event.actorUserId}` : ' · system'}
                    </small>
                  </span>
                  <em>{severity}</em>
                  <span className={expanded ? 'i-ph:caret-up' : 'i-ph:caret-down'} aria-hidden />
                </button>
                {expanded ? (
                  <pre className="bolt-project-activity-payload">
                    {JSON.stringify(
                      {
                        id: event.id,
                        action: event.action,
                        actorUserId: event.actorUserId ?? null,
                        createdAt: event.createdAt,
                        metadata: event.metadata ?? {},
                      },
                      null,
                      2,
                    )}
                  </pre>
                ) : null}
              </article>
            );
          })
        ) : (
          <div className="bolt-project-empty-panel">No activity matches the current filters.</div>
        )}
      </div>
    </section>
  );
}

function formatProjectActivityAction(action: string) {
  return String(action ?? 'project.activity')
    .replace(/^project\./, '')
    .replace(/\./g, ' / ')
    .replace(/_/g, ' ');
}

function classifyProjectActivity(action: string) {
  if (/delete|fail|error|rollback|abuse|revoke/i.test(action)) {
    return 'critical';
  }

  if (/deploy|export|import|create_from_ai|collaborator|secret|snapshot|git|domain/i.test(action)) {
    return 'important';
  }

  if (action === 'project.ide_state.save') {
    return 'routine';
  }

  return 'normal';
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
  const [settingsNotice, setSettingsNotice] = useState('');
  const settingsNoticeRef = useRef('Settings saved.');
  const accountUser = data.account?.user ?? {};
  const sessions = data.sessions?.sessions ?? [];
  const state = data.settingsState ?? {};
  const preferences = state.preferences ?? { theme: 'dark', keyboardMode: false, creditAlertThreshold: 80 };
  const notifications = state.notifications ?? {};

  const aiRouting = state.aiRouting ?? {
    defaultProvider: 'openai',
    defaultModel: 'openai:managed-default',
    fallbackProvider: 'openrouter',
    fallbackEnabled: true,
  };

  const secrets = data.secrets ?? [];
  const billing = data.billing ?? {};
  const aiUsage = data.aiUsage?.usage ?? [];

  const providers: Array<{ id: string; label: string; secretKey: string; models: string[] }> = [
    {
      id: 'openai',
      label: 'OpenAI',
      secretKey: 'OPENAI_API_KEY',
      models: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex'],
    },
    {
      id: 'anthropic',
      label: 'Anthropic',
      secretKey: 'ANTHROPIC_API_KEY',
      models: ['claude-sonnet-4.5', 'claude-opus-4.1'],
    },
    { id: 'google', label: 'Google', secretKey: 'GOOGLE_API_KEY', models: ['gemini-2.5-pro', 'gemini-2.5-flash'] },
    {
      id: 'openrouter',
      label: 'OpenRouter',
      secretKey: 'OPENROUTER_API_KEY',
      models: ['openrouter:auto', 'anthropic/claude-sonnet-4.5'],
    },
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

  function submitWithNotice(message: string) {
    return (event: React.FormEvent<HTMLFormElement>) => {
      settingsNoticeRef.current = message;
      setSettingsNotice('Saving changes...');
      onSubmit(event);
    };
  }

  useEffect(() => {
    function handlePanelAction(event: Event) {
      const detail = (event as CustomEvent).detail ?? {};

      if (detail.panel !== 'settings') {
        return;
      }

      setSettingsNotice(detail.ok ? settingsNoticeRef.current : (detail.error ?? 'Settings action failed.'));
    }

    window.addEventListener('vibecore:ide-panel-action', handlePanelAction);

    return () => window.removeEventListener('vibecore:ide-panel-action', handlePanelAction);
  }, []);

  function formatSessionDevice(session: any) {
    const agent = String(session.userAgent ?? '').toLowerCase();

    if (agent.includes('mobile')) {
      return 'Mobile browser session';
    }

    if (agent.includes('chrome')) {
      return 'Chrome browser session';
    }

    if (agent.includes('firefox')) {
      return 'Firefox browser session';
    }

    if (agent.includes('safari')) {
      return 'Safari browser session';
    }

    if (agent.includes('node')) {
      return 'VibeCore CLI or local development session';
    }

    return session.userAgent ? 'Browser session' : 'Authenticated session';
  }

  function formatSessionDetail(session: any) {
    const parts = [
      session.ipAddress ?? session.ip,
      session.createdAt ? `Created ${new Date(session.createdAt).toLocaleString()}` : undefined,
      session.expiresAt ? `Expires ${new Date(session.expiresAt).toLocaleString()}` : undefined,
    ].filter(Boolean);

    return parts.join(' - ') || session.id;
  }

  const usageByKey = new Map(
    (billing.usage ?? []).map((item: any) => [
      item.key ?? item.type ?? item.metric ?? item.name,
      Number(item.used ?? item.value ?? item.quantity ?? item.count ?? 0),
    ]),
  );

  const limitEntries = Object.entries(billing.limits ?? {});

  const aiUsageTotals = aiUsage.reduce(
    (totals: any, item: any) => ({
      inputTokens: totals.inputTokens + Number(item.inputTokens ?? item.promptTokens ?? 0),
      outputTokens: totals.outputTokens + Number(item.outputTokens ?? item.completionTokens ?? 0),
      cost: totals.cost + Number(item.costUsd ?? item.cost ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, cost: 0 },
  );

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
        {settingsNotice ? (
          <span className="bolt-project-settings-status" role="status" aria-live="polite">
            {settingsNotice}
          </span>
        ) : null}
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
        <form onSubmit={submitWithNotice('Project settings saved to backend.')} className="bolt-project-settings-card">
          <div className="bolt-project-settings-card-title">
            <h4>Project Metadata</h4>
            <small>These fields update `/projects/:id/settings` and are reflected in the IDE breadcrumb.</small>
          </div>
          <label>
            Project name
            <PanelInput
              name="name"
              value={draft.name}
              onChange={updateDraft('name')}
              required
              aria-label="Project name"
            />
          </label>
          <label>
            Description
            <PanelInput
              name="description"
              value={draft.description}
              onChange={updateDraft('description')}
              aria-label="Project description"
            />
          </label>
          <label>
            Git repository URL
            <PanelInput
              name="gitRepositoryUrl"
              type="url"
              value={draft.gitRepositoryUrl}
              onChange={updateDraft('gitRepositoryUrl')}
              placeholder="https://github.com/org/repo"
              aria-label="Git repository URL"
            />
          </label>
          <label>
            Default branch
            <PanelInput
              name="gitDefaultBranch"
              value={draft.gitDefaultBranch}
              onChange={updateDraft('gitDefaultBranch')}
              aria-label="Default Git branch"
            />
          </label>
          <PanelButton disabled={busy || !draft.name.trim()}>Save settings</PanelButton>
        </form>
      )}

      {settingsTab === 'account' && (
        <div className="bolt-project-settings-grid">
          <form onSubmit={submitWithNotice('Profile saved to account API.')} className="bolt-project-settings-card">
            <input name="intent" value="profile" type="hidden" />
            <div className="bolt-project-settings-card-title">
              <h4>Profile</h4>
              <small>Visible identity used by comments, audit events and collaboration surfaces.</small>
            </div>
            <div className="bolt-project-settings-profile">
              <span>{initials}</span>
              <div>
                <strong>{accountUser.name ?? 'User'}</strong>
                <small>{accountUser.email ?? 'No email returned by API'}</small>
              </div>
            </div>
            <label>
              Display name
              <PanelInput name="name" defaultValue={accountUser.name ?? ''} required aria-label="Display name" />
            </label>
            <label>
              Email address
              <PanelInput
                name="email"
                type="email"
                defaultValue={accountUser.email ?? ''}
                required
                aria-label="Email address"
              />
            </label>
            <PanelButton disabled={busy}>Save profile</PanelButton>
          </form>

          <section className="bolt-project-settings-card">
            <div className="bolt-project-settings-card-title">
              <h4>Connected Accounts & Data</h4>
              <small>Only actions backed by platform routes are shown here.</small>
            </div>
            <div className="bolt-project-account-connectors">
              <div>
                <strong>Email verification</strong>
                <small>{accountUser.emailVerifiedAt ? 'Verified' : 'Not verified yet'}</small>
              </div>
              <div>
                <strong>GitHub OAuth</strong>
                <small>Use OAuth to import repositories and unlock GitHub project flows.</small>
              </div>
              <div>
                <strong>Account export</strong>
                <small>Profile, sessions, organizations, projects, usage and AI costs as JSON.</small>
              </div>
            </div>
            {!accountUser.emailVerifiedAt && (
              <form onSubmit={submitWithNotice('Verification email requested.')} className="bolt-project-inline-action">
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
          <form onSubmit={submitWithNotice('Password update submitted.')} className="bolt-project-settings-card">
            <input name="intent" value="change-password" type="hidden" />
            <div className="bolt-project-settings-card-title">
              <h4>Change Password</h4>
              <small>Password changes are processed by `/auth/password` and audited.</small>
            </div>
            <label>
              Current password
              <PanelInput
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                aria-label="Current password"
              />
            </label>
            <label>
              New password
              <PanelInput
                name="newPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Minimum 8 characters"
                required
                aria-label="New password"
              />
            </label>
            <PanelButton disabled={busy}>Update password</PanelButton>
            <small>Successful password changes revoke other sessions through the API.</small>
          </form>

          <section className="bolt-project-settings-card">
            <div className="bolt-project-settings-card-title">
              <h4>Sign-in Protection</h4>
              <small>Security controls currently backed by the authentication service.</small>
            </div>
            <div className="bolt-project-security-methods">
              <a href="/mfa-setup">
                <strong>Multi-factor authentication</strong>
                <small>
                  {accountUser.mfaEnabled ? 'Enabled for this account' : 'Set up TOTP MFA and recovery codes'}
                </small>
              </a>
              <a href="/security-settings">
                <strong>Security rules</strong>
                <small>Review MFA policy, recovery and security settings.</small>
              </a>
              <a href="/enterprise-sso-settings">
                <strong>Enterprise SSO</strong>
                <small>Configure SAML or OIDC for organizations that require SSO.</small>
              </a>
            </div>
          </section>

          <section className="bolt-project-settings-card">
            <div className="bolt-project-settings-card-title">
              <h4>Active Sessions</h4>
              <small>Session names are normalized from user-agent data returned by `/auth/sessions`.</small>
            </div>
            <div className="bolt-project-settings-list">
              {sessions.length ? (
                sessions.slice(0, 8).map((session: any) => (
                  <form key={session.id} onSubmit={submitWithNotice('Session revoke submitted.')}>
                    <input name="intent" value="revoke-session" type="hidden" />
                    <input name="sessionId" value={session.id} type="hidden" />
                    <span>
                      <strong>{formatSessionDevice(session)}</strong>
                      <small>{formatSessionDetail(session)}</small>
                    </span>
                    <button disabled={busy} aria-label={`Revoke ${formatSessionDevice(session)}`}>
                      Revoke
                    </button>
                  </form>
                ))
              ) : (
                <div className="bolt-project-empty-panel">No active sessions returned by API.</div>
              )}
            </div>
            <form
              onSubmit={submitWithNotice('Other sessions sign-out submitted.')}
              className="bolt-project-inline-action"
            >
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
            <form
              onSubmit={submitWithNotice('Account deletion request submitted.')}
              className="bolt-project-danger-form"
            >
              <input name="intent" value="delete-account" type="hidden" />
              <label>
                Type DELETE MY ACCOUNT to confirm
                <input
                  name="confirmation"
                  placeholder="DELETE MY ACCOUNT"
                  required
                  aria-label="Delete account confirmation"
                />
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
            <div className="bolt-project-settings-card-title">
              <h4>Billing & Plan</h4>
              <small>Limits are rendered from the billing API instead of a flat comma-separated string.</small>
            </div>
            <PanelRows
              rows={[
                ['Plan', billing.plan?.name ?? billing.plan?.key ?? 'No billing plan returned'],
                ['Subscription', billing.subscription?.status ?? billing.error ?? 'No active subscription'],
                ['Usage events', String(billing.usage?.length ?? 0)],
              ]}
            />
            {limitEntries.length ? (
              <div className="bolt-project-usage-limits" role="table" aria-label="Billing limits">
                <div role="row">
                  <span role="columnheader">Limit</span>
                  <span role="columnheader">Used</span>
                  <span role="columnheader">Quota</span>
                </div>
                {limitEntries.map(([key, value]: any) => {
                  const limit = Number(value?.limit ?? value?.max ?? value ?? 0);
                  const used = Number(usageByKey.get(key) ?? value?.used ?? 0);
                  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

                  return (
                    <div key={key} role="row">
                      <span role="cell">{key.replaceAll('.', ' ')}</span>
                      <span role="cell">{used.toLocaleString()}</span>
                      <span role="cell">
                        {limit ? limit.toLocaleString() : 'Unlimited'}
                        <em style={{ inlineSize: `${percent}%` }} aria-hidden />
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bolt-project-empty-panel">No billing limits returned by API.</div>
            )}
            <a href="/billing" target="_blank" rel="noreferrer">
              Open billing management
            </a>
          </section>

          <section className="bolt-project-settings-card">
            <div className="bolt-project-settings-card-title">
              <h4>AI Usage & Costs</h4>
              <small>Token totals are calculated from the real `/ai/usage` response.</small>
            </div>
            <div className="bolt-project-usage-metrics">
              <span>
                <strong>{aiUsageTotals.inputTokens.toLocaleString()}</strong>
                <small>Input tokens</small>
              </span>
              <span>
                <strong>{aiUsageTotals.outputTokens.toLocaleString()}</strong>
                <small>Output tokens</small>
              </span>
              <span>
                <strong>${aiUsageTotals.cost.toFixed(4)}</strong>
                <small>Estimated cost</small>
              </span>
            </div>
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
          <div className="bolt-project-settings-card-title">
            <h4>AI Provider Controls</h4>
            <small>Provider modes, keys and routing are persisted in project secrets and IDE settings state.</small>
          </div>
          <form onSubmit={submitWithNotice('AI routing preferences saved.')} className="bolt-project-ai-routing">
            <input name="intent" value="ai-routing" type="hidden" />
            <label>
              Default provider
              <select name="defaultProvider" defaultValue={aiRouting.defaultProvider}>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Default model
              <select name="defaultModel" defaultValue={aiRouting.defaultModel}>
                {providers.flatMap((provider) =>
                  provider.models.map((model) => (
                    <option key={`${provider.id}:${model}`} value={`${provider.id}:${model}`}>
                      {provider.label} - {model}
                    </option>
                  )),
                )}
              </select>
            </label>
            <label>
              Fallback provider
              <select name="fallbackProvider" defaultValue={aiRouting.fallbackProvider}>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="bolt-project-checkbox-row">
              <input
                name="fallbackEnabled"
                type="checkbox"
                value="true"
                defaultChecked={aiRouting.fallbackEnabled !== false}
              />
              <span>Use fallback when the primary provider errors or exceeds quota</span>
            </label>
            <PanelButton disabled={busy}>Save AI routing</PanelButton>
          </form>
          <div className="bolt-project-settings-provider-grid">
            {providers.map((provider) => {
              const configured = secrets.some((secret: any) => secret.key === provider.secretKey);
              const mode = state.aiCredentials?.[provider.id]?.mode ?? 'managed';

              return (
                <article key={provider.id}>
                  <div className="bolt-project-provider-header">
                    <span>
                      <strong>{provider.label}</strong>
                      <small>
                        {mode === 'byok'
                          ? configured
                            ? 'BYOK key configured'
                            : 'BYOK enabled, key missing'
                          : 'Managed credits'}
                      </small>
                    </span>
                    <em title="Managed credits use VibeCore platform billing. BYOK stores a project secret and routes calls through your provider key.">
                      {mode === 'byok' ? 'BYOK' : 'Managed'}
                    </em>
                  </div>
                  <form onSubmit={submitWithNotice(`${provider.label} provider mode saved.`)}>
                    <input name="intent" value="ai-credential-mode" type="hidden" />
                    <input name="provider" value={provider.id} type="hidden" />
                    <label>
                      Credential mode
                      <select name="mode" defaultValue={mode}>
                        <option value="managed">Managed platform credits</option>
                        <option value="byok">Bring your own key</option>
                      </select>
                    </label>
                    <button disabled={busy}>Save mode</button>
                  </form>
                  <form onSubmit={submitWithNotice(`${provider.label} API key saved as a project secret.`)}>
                    <input name="intent" value="save-ai-key" type="hidden" />
                    <input name="provider" value={provider.id} type="hidden" />
                    <label>
                      API key secret
                      <input
                        name="apiKey"
                        type="password"
                        placeholder={`${provider.secretKey}`}
                        required
                        aria-label={`${provider.label} API key`}
                      />
                    </label>
                    <button disabled={busy}>Save key</button>
                  </form>
                  {configured && (
                    <form onSubmit={submitWithNotice(`${provider.label} API key removal submitted.`)}>
                      <input name="intent" value="delete-ai-key" type="hidden" />
                      <input name="provider" value={provider.id} type="hidden" />
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
            <div className="bolt-project-settings-card-title">
              <h4>Persistent Agent Memory</h4>
              <small>
                Project-scoped memories are embedded with the configured backend provider and retrieved before future
                IDE agent runs.
              </small>
            </div>
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
            {memoryDraft.trim() ? (
              <details className="bolt-project-memory-preview">
                <summary>Preview memory payload</summary>
                <pre>
                  {JSON.stringify(
                    {
                      scope: 'project',
                      projectId: settings.id,
                      memoryType,
                      tags: parseMemoryTags(memoryTags),
                      content: memoryDraft,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            ) : null}
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
            <div className="bolt-project-form-actions">
              <PanelButton disabled={memoryLoading || !memoryDraft.trim()}>Save memory</PanelButton>
              <button
                type="button"
                onClick={() => {
                  setMemoryDraft('');
                  setMemoryTags('');
                  setMemoryType('semantic');
                }}
                disabled={memoryLoading || (!memoryDraft && !memoryTags)}
              >
                Reset draft
              </button>
            </div>
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
                        <label>
                          Memory content
                          <textarea
                            value={memoryEditDraft}
                            onChange={(event) => setMemoryEditDraft(event.target.value)}
                            rows={4}
                          />
                        </label>
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
          <form onSubmit={submitWithNotice('IDE preferences saved.')} className="bolt-project-settings-card">
            <input name="intent" value="preferences" type="hidden" />
            <div className="bolt-project-settings-card-title">
              <h4>Appearance & Keyboard</h4>
              <small>Workspace preferences are stored per project and default to dark mode.</small>
            </div>
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
                <option value="false">Standard browser shortcuts</option>
                <option value="true">Hardware keyboard IDE shortcuts</option>
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
            <div className="bolt-project-settings-card-title">
              <h4>Notification Preferences</h4>
              <small>In-app toggles are persisted here. Email and push delivery are managed by account channels.</small>
            </div>
            <div className="bolt-project-settings-list">
              {notificationRows.map(([key, label, desc]) => {
                const enabled = notifications[key] !== false;

                return (
                  <form key={key} onSubmit={submitWithNotice(`${label} notification preference saved.`)}>
                    <input name="intent" value="notification" type="hidden" />
                    <input name="key" value={key} type="hidden" />
                    <input name="enabled" value={String(!enabled)} type="hidden" />
                    <span>
                      <strong>{label}</strong>
                      <small>{desc}</small>
                      <span className="bolt-project-notification-channels">
                        <em data-enabled={enabled}>In-app {enabled ? 'on' : 'off'}</em>
                        <em>Email via account</em>
                        <em>Push via native runtime</em>
                      </span>
                    </span>
                    <button disabled={busy} aria-label={`${enabled ? 'Disable' : 'Enable'} ${label} notifications`}>
                      {enabled ? 'On' : 'Off'}
                    </button>
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
  const detectedPackageManager = data.packageManager || 'npm';
  const [packageManager, setPackageManager] = useState(detectedPackageManager);
  const [packageInput, setPackageInput] = useState('');
  const [installAsDevDependency, setInstallAsDevDependency] = useState(false);
  const manifests = data.manifests ?? [];
  const dependencies = data.dependencies ?? [];
  const lockfiles = data.lockfiles ?? [];
  const runs = data.packagesState?.runs ?? [];
  const packageFiles = (data.files ?? []).filter((file: any) => String(file.path ?? '').endsWith('package.json'));

  const visibleDependencies = dependencies.filter((dependency: any) => {
    const haystack =
      `${dependency.name} ${dependency.version} ${dependency.scope} ${dependency.manifestPath}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  useEffect(() => {
    setPackageManager(detectedPackageManager);
  }, [detectedPackageManager]);

  const managerOptions = ['npm', 'pnpm', 'yarn', 'bun'];

  return (
    <div className="bolt-project-packages-panel">
      <section className="bolt-project-packages-hero">
        <div>
          <span>Package intelligence</span>
          <h3>{manifests.length ? `${dependencies.length} dependencies detected` : 'No package manifest detected'}</h3>
          <p>
            Vibecore reads package manifests and lockfiles directly from the project/runtime, then runs install, audit,
            and outdated checks against the real workspace terminal.
          </p>
        </div>
        <form onSubmit={onSubmit}>
          <input name="intent" value="install-all" type="hidden" />
          <input name="packageManager" value={packageManager} type="hidden" />
          <PanelButton disabled={busy || !manifests.length}>Install from lockfile</PanelButton>
        </form>
      </section>

      <section className="bolt-project-package-manager-card">
        <div className="bolt-project-package-manager-header">
          <div>
            <strong>{packageManager}</strong>
            <span>{lockfiles.length ? `${lockfiles.length} lockfile(s) detected` : 'No lockfile detected yet'}</span>
          </div>
          <div className="bolt-project-package-manager-options" role="group" aria-label="Package manager">
            {managerOptions.map((manager) => (
              <button
                key={manager}
                type="button"
                className={manager === packageManager ? 'selected' : undefined}
                onClick={() => setPackageManager(manager)}
              >
                {manager}
              </button>
            ))}
          </div>
        </div>
        <div className="bolt-project-package-stat-grid">
          <article>
            <span>Manifests</span>
            <strong>{manifests.length}</strong>
            <small>
              {packageFiles.length ? packageFiles.map((file: any) => file.path).join(', ') : 'No package.json'}
            </small>
          </article>
          <article>
            <span>Indexed files</span>
            <strong>{data.files?.length ?? 0}</strong>
            <small>Project storage plus runtime package files</small>
          </article>
          <article>
            <span>Runtime</span>
            <strong>{data.workspace?.status ?? 'unknown'}</strong>
            <small>{data.workspace?.runtimeMode ?? 'Workspace command runner'}</small>
          </article>
          <article>
            <span>Lockfiles</span>
            <strong>{lockfiles.length}</strong>
            <small>
              {lockfiles.length ? lockfiles.map((file: any) => file.path).join(', ') : 'Install will create one'}
            </small>
          </article>
        </div>
      </section>

      <section className="bolt-project-package-actions">
        <form onSubmit={onSubmit} className="bolt-project-package-install-form">
          <input name="intent" value="install-package" type="hidden" />
          <input name="packageManager" value={packageManager} type="hidden" />
          <input name="packages" value={packageInput} type="hidden" />
          <input name="devDependency" value={installAsDevDependency ? 'true' : 'false'} type="hidden" />
          <label>
            Add package
            <input
              value={packageInput}
              onChange={(event) => setPackageInput(event.target.value)}
              placeholder="@scope/name, react-query, vite@latest"
              autoComplete="off"
            />
          </label>
          <label className="bolt-project-package-checkbox">
            <input
              type="checkbox"
              checked={installAsDevDependency}
              onChange={(event) => setInstallAsDevDependency(event.target.checked)}
            />
            Dev dependency
          </label>
          <PanelButton disabled={busy || !packageInput.trim()}>Install package</PanelButton>
        </form>
        <div className="bolt-project-package-command-row">
          <form onSubmit={onSubmit}>
            <input name="intent" value="audit" type="hidden" />
            <input name="packageManager" value={packageManager} type="hidden" />
            <PanelButton variant="outline" disabled={busy || !manifests.length}>
              Run security audit
            </PanelButton>
          </form>
          <form onSubmit={onSubmit}>
            <input name="intent" value="outdated" type="hidden" />
            <input name="packageManager" value={packageManager} type="hidden" />
            <PanelButton variant="outline" disabled={busy || !manifests.length}>
              Check outdated
            </PanelButton>
          </form>
        </div>
      </section>

      <section className="bolt-project-package-content">
        <div>
          <div className="bolt-project-panel-toolbar">
            <label>
              Filter installed packages
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, version, manifest, scope"
              />
            </label>
          </div>
          <div className="bolt-project-package-list">
            {visibleDependencies.map((dependency: any) => (
              <a
                key={`${dependency.manifestPath}:${dependency.scope}:${dependency.name}`}
                href={`https://www.npmjs.com/package/${encodeURIComponent(dependency.name)}`}
                target="_blank"
                rel="noreferrer"
              >
                <strong>{dependency.name}</strong>
                <span>{dependency.version}</span>
                <em>{dependency.scope}</em>
                <small>{dependency.manifestPath}</small>
              </a>
            ))}
            {!visibleDependencies.length && (
              <div className="bolt-project-empty-panel">
                {dependencies.length
                  ? 'No installed package matches this filter.'
                  : 'No dependencies found in package.json.'}
              </div>
            )}
          </div>
        </div>

        <aside className="bolt-project-package-sidebar">
          <div>
            <h4>Manifests</h4>
            {manifests.length ? (
              manifests.map((manifest: any) => (
                <article key={manifest.path}>
                  <strong>{manifest.name}</strong>
                  <span>{manifest.path}</span>
                  <small>
                    {manifest.dependencyCount} prod / {manifest.devDependencyCount} dev
                  </small>
                </article>
              ))
            ) : (
              <p>No package.json has been indexed for this workspace.</p>
            )}
          </div>
          <div>
            <h4>Runtime checks</h4>
            {runs.length ? (
              runs.map((run: any) => (
                <article key={run.id}>
                  <strong>{run.name}</strong>
                  <span>
                    {run.status} · exit {run.exitCode ?? 0}
                  </span>
                  <small>{run.finishedAt ? new Date(run.finishedAt).toLocaleString() : run.script}</small>
                </article>
              ))
            ) : (
              <p>Run audit or outdated to capture real package manager output from the workspace.</p>
            )}
          </div>
        </aside>
      </section>
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
  const deployments: any[] = Array.isArray(data.deployments) ? data.deployments : [];
  const allActivity: any[] = Array.isArray(data.recentActivity) ? data.recentActivity : [];

  const windowMs = windowSize === '15m' ? 15 * 60_000 : windowSize === '1h' ? 60 * 60_000 : 24 * 60 * 60_000;
  const cutoff = Date.now() - windowMs;

  const windowed = allActivity.filter((event) => {
    if (!event?.createdAt) {
      return true;
    }

    const ts = new Date(event.createdAt).getTime();

    return Number.isFinite(ts) && ts >= cutoff;
  });

  const { userFacingEvents, hiddenRoutineCount } = partitionMonitoringEventsHelper(windowed);

  const workspace = data.workspace ?? data.runtimeStatus;

  const workspaceLabel = runtimeStatusText({
    workspaceStatus: workspace,
    workspaceLoading: Boolean(workspace && !workspace.status),
    workspaceError: workspace?.error,
  });

  const lastDeployment = deployments[0];

  const lastDeploymentDetail = lastDeployment
    ? `${lastDeployment.status ?? 'unknown'}${
        lastDeployment.createdAt ? ` · ${new Date(lastDeployment.createdAt).toLocaleString()}` : ''
      }`
    : 'No deployment recorded';

  const metrics = [
    ['Workspace', workspaceLabel, workspace?.runtimeMode ?? 'No runtime session reported'],
    ['Deployments', String(deployments.length), lastDeploymentDetail],
    ['User events', String(userFacingEvents.length), `${windowSize} window · ${hiddenRoutineCount} routine hidden`],
    ['Tracked files', String(data.files?.length ?? 0), `${windowSize} window`],
  ] as const;

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
      <ProjectMonitoringDeploymentTimeline deployments={deployments} />
      <ProjectMonitoringActivitySparkline
        events={userFacingEvents}
        windowMs={windowMs}
        emptyLabel="No user-facing events in this window."
      />
      <PanelRows
        rows={userFacingEvents
          .slice(0, 12)
          .map((event: any) => [
            formatProjectActivityAction(event.action ?? 'project.activity'),
            event.createdAt ? new Date(event.createdAt).toLocaleString() : 'Recorded by API',
          ])}
        empty="No user-facing events yet. Routine IDE state saves are hidden — see logs for raw audit."
      />
      {hiddenRoutineCount > 0 ? (
        <div className="bolt-project-monitoring-routine-note" role="note">
          {hiddenRoutineCount} routine internal event{hiddenRoutineCount === 1 ? '' : 's'} hidden (
          <code>project.ide_state.*</code>
          ). Open the Logs panel to inspect the raw audit trail.
        </div>
      ) : null}
    </div>
  );
}

function ProjectMonitoringDeploymentTimeline({ deployments }: { deployments: any[] }) {
  const visible = deployments.slice(0, 24);

  if (visible.length === 0) {
    return (
      <section className="bolt-project-monitoring-timeline" aria-label="Deployment history">
        <header>
          <strong>Deployments</strong>
          <small>No deployment recorded for this project yet.</small>
        </header>
      </section>
    );
  }

  const width = 100;
  const barWidth = width / visible.length;

  return (
    <section className="bolt-project-monitoring-timeline" aria-label="Deployment history">
      <header>
        <strong>Deployments</strong>
        <small>
          Last {visible.length} deployment{visible.length === 1 ? '' : 's'}, newest on the right.
        </small>
      </header>
      <svg viewBox={`0 0 ${width} 20`} preserveAspectRatio="none" role="img" aria-label="Deployment status timeline">
        {visible
          .slice()
          .reverse()
          .map((deployment: any, index: number) => (
            <rect
              key={deployment.id ?? `${deployment.createdAt ?? 'deploy'}-${index}`}
              x={index * barWidth + barWidth * 0.1}
              y={2}
              width={Math.max(barWidth * 0.8, 0.5)}
              height={16}
              fill={deploymentStatusColor(deployment.status)}
            >
              <title>
                {(deployment.status ?? 'unknown') +
                  (deployment.provider ? ` · ${deployment.provider}` : '') +
                  (deployment.createdAt ? ` · ${new Date(deployment.createdAt).toLocaleString()}` : '')}
              </title>
            </rect>
          ))}
      </svg>
    </section>
  );
}

function ProjectMonitoringActivitySparkline({
  events,
  windowMs,
  emptyLabel,
}: {
  events: any[];
  windowMs: number;
  emptyLabel: string;
}) {
  if (events.length === 0) {
    return (
      <section className="bolt-project-monitoring-sparkline" aria-label="Activity rate">
        <header>
          <strong>Activity rate</strong>
          <small>{emptyLabel}</small>
        </header>
      </section>
    );
  }

  const buckets = 24;
  const counts = bucketEventsByTimeHelper(events, windowMs, buckets);
  const max = Math.max(1, ...counts);
  const width = 100;
  const barWidth = width / buckets;

  return (
    <section className="bolt-project-monitoring-sparkline" aria-label="Activity rate">
      <header>
        <strong>Activity rate</strong>
        <small>
          {events.length} event{events.length === 1 ? '' : 's'} across {buckets} buckets · peak {max}/bucket
        </small>
      </header>
      <svg viewBox={`0 0 ${width} 24`} preserveAspectRatio="none" role="img" aria-label="Activity events per bucket">
        {counts.map((count, index) => {
          const height = (count / max) * 22;

          return (
            <rect
              key={index}
              x={index * barWidth + barWidth * 0.1}
              y={24 - height}
              width={Math.max(barWidth * 0.8, 0.5)}
              height={height}
              fill="var(--vc-status-info, #38bdf8)"
            >
              <title>{`${count} event${count === 1 ? '' : 's'}`}</title>
            </rect>
          );
        })}
      </svg>
    </section>
  );
}

const PROJECT_EXTENSION_CATALOG = [
  {
    id: 'vscode-theme-defaults',
    name: 'VS Code Theme Defaults',
    category: 'Themes',
    publisher: 'Vibecore',
    description: 'Dark, light and high-contrast editor palettes aligned with VS Code defaults.',
  },
  {
    id: 'material-icon-theme',
    name: 'Material Icon Theme',
    category: 'Themes',
    publisher: 'PKief',
    description: 'Recognizable file and folder icons for modern web, backend and config files.',
  },
  {
    id: 'typescript-language-features',
    name: 'TypeScript Language Features',
    category: 'Languages',
    publisher: 'Vibecore',
    description: 'TypeScript, JavaScript and JSX language intelligence for project workspaces.',
  },
  {
    id: 'python-language-support',
    name: 'Python Language Support',
    category: 'Languages',
    publisher: 'Vibecore',
    description: 'Python syntax, lint-ready settings and test discovery integration.',
  },
  {
    id: 'eslint',
    name: 'ESLint',
    category: 'Linters',
    publisher: 'Microsoft',
    description: 'Project-aware JavaScript and TypeScript lint diagnostics.',
  },
  {
    id: 'prettier',
    name: 'Prettier',
    category: 'Linters',
    publisher: 'Prettier',
    description: 'Consistent formatting defaults for JS, TS, CSS, JSON and Markdown.',
  },
  {
    id: 'js-debug',
    name: 'JavaScript Debugger',
    category: 'Debuggers',
    publisher: 'Microsoft',
    description: 'Launch configs, breakpoints and browser/node debugging support.',
  },
  {
    id: 'playwright-test',
    name: 'Playwright Test',
    category: 'Debuggers',
    publisher: 'Microsoft',
    description: 'Run, inspect and debug end-to-end tests from the IDE.',
  },
];

function ProjectExtensionsPanel({ data, onSubmit, busy }: { data: any; onSubmit: any; busy: boolean }) {
  const envInstalled = String((data.envVars ?? []).find((item: any) => item.key === 'VIBECORE_EXTENSIONS')?.value ?? '')
    .split(',')
    .map((extension) => extension.trim())
    .filter(Boolean);
  const deploymentInstalled = (data.deployments ?? [])
    .filter((deployment: any) => String(deployment.provider ?? '').startsWith('extension:'))
    .map((deployment: any) => deployment.provider.replace('extension:', ''));

  const extensionState = data.extensionsState?.extensions ?? {};
  const installed = Array.from(new Set([...envInstalled, ...deploymentInstalled, ...Object.keys(extensionState)]));
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const categories = ['All', 'Installed', 'Themes', 'Languages', 'Linters', 'Debuggers'];
  const installedSet = new Set(installed);
  const normalizedQuery = query.trim().toLowerCase();

  const installedCatalog = installed.map((id) => {
    const catalogItem = PROJECT_EXTENSION_CATALOG.find((item) => item.id === id || item.name === id);

    return {
      id,
      name: catalogItem?.name ?? id,
      category: catalogItem?.category ?? 'Installed',
      publisher: catalogItem?.publisher ?? 'Workspace',
      description: catalogItem?.description ?? 'Workspace extension persisted in backend project settings.',
      enabled: extensionState[id]?.enabled !== false,
    };
  });

  const catalogItems = PROJECT_EXTENSION_CATALOG.filter((item) => {
    const matchesCategory = category === 'All' || category === 'Installed' || item.category === category;

    const matchesQuery =
      !normalizedQuery ||
      [item.name, item.publisher, item.category, item.description].join(' ').toLowerCase().includes(normalizedQuery);

    return matchesCategory && matchesQuery;
  });

  const visibleCatalogItems = category === 'Installed' ? installedCatalog : catalogItems;

  return (
    <div className="bolt-project-extensions-panel">
      <header className="bolt-project-extensions-hero">
        <div>
          <strong>Extensions marketplace</strong>
          <span>
            Search compatible VS Code-style capabilities and persist workspace extension state in the backend.
          </span>
        </div>
        <div className="bolt-project-extensions-summary" aria-label="Installed extension summary">
          <strong>{installed.length}</strong>
          <span>installed</span>
        </div>
      </header>

      <div className="bolt-project-panel-toolbar">
        <label>
          Search VS Code marketplace
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Theme, language, linter, debugger..."
          />
        </label>
        <div className="bolt-project-extension-categories" role="tablist" aria-label="Extension categories">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              className={category === item ? 'selected' : ''}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <section className="bolt-project-installed-extensions" aria-label="Installed extensions">
        <div className="bolt-project-section-heading">
          <strong>Installed</strong>
          <span>Enable, disable or remove project extensions without leaving the IDE.</span>
        </div>
        {installedCatalog.length ? (
          <div className="bolt-project-extension-catalog installed">
            {installedCatalog.map((extension) => (
              <article key={extension.id} className="bolt-project-extension-card" data-enabled={extension.enabled}>
                <div>
                  <strong>{extension.name}</strong>
                  <span>{extension.publisher}</span>
                </div>
                <p>{extension.description}</p>
                <div className="bolt-project-extension-card-footer">
                  <em>{extension.enabled ? 'Enabled' : 'Disabled'}</em>
                  <form onSubmit={onSubmit}>
                    <input name="extension" value={extension.id} type="hidden" />
                    <input name="extensionAction" value={extension.enabled ? 'disable' : 'enable'} type="hidden" />
                    <PanelButton disabled={busy} variant="outline">
                      {extension.enabled ? 'Disable' : 'Enable'}
                    </PanelButton>
                  </form>
                  <form onSubmit={onSubmit}>
                    <input name="extension" value={extension.id} type="hidden" />
                    <input name="extensionAction" value="remove" type="hidden" />
                    <PanelButton disabled={busy} variant="outline">
                      Remove
                    </PanelButton>
                  </form>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="bolt-project-empty-panel">
            No extensions installed yet. Install a theme, language pack, linter or debugger below.
          </div>
        )}
      </section>

      <section aria-label="Marketplace extensions">
        <div className="bolt-project-section-heading">
          <strong>{category === 'Installed' ? 'Installed catalog view' : 'Marketplace'}</strong>
          <span>
            {visibleCatalogItems.length} extension{visibleCatalogItems.length === 1 ? '' : 's'} shown
          </span>
        </div>
        {visibleCatalogItems.length ? (
          <div className="bolt-project-extension-catalog">
            {visibleCatalogItems.map((extension) => {
              const isInstalled = installedSet.has(extension.id);

              return (
                <article key={extension.id} className="bolt-project-extension-card" data-enabled={isInstalled}>
                  <div>
                    <strong>{extension.name}</strong>
                    <span>
                      {extension.publisher} · {extension.category}
                    </span>
                  </div>
                  <p>{extension.description}</p>
                  <div className="bolt-project-extension-card-footer">
                    <em>{isInstalled ? 'Installed' : 'Available'}</em>
                    <form onSubmit={onSubmit}>
                      <input name="extension" value={extension.id} type="hidden" />
                      <input name="extensionAction" value="install" type="hidden" />
                      <PanelButton disabled={busy || isInstalled}>{isInstalled ? 'Installed' : 'Install'}</PanelButton>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="bolt-project-empty-panel">No extensions match the current search and category filters.</div>
        )}
      </section>
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

function ProjectDatabasePanel({
  projectId,
  data,
  onSubmit,
  busy,
  reload,
}: {
  projectId?: string;
  data: any;
  onSubmit: any;
  busy: boolean;
  reload?: () => void | Promise<void>;
}) {
  const connections = data.connections ?? [];
  const envVars = data.envVars ?? [];
  const secrets = data.secrets ?? [];
  const databaseBackups = (data.snapshots ?? []).filter((snapshot: any) => snapshot.manifest?.scope === 'database');
  const [activeTab, setActiveTab] = useState<'explorer' | 'query' | 'schema' | 'secrets' | 'backups'>('explorer');
  const [selectedKey, setSelectedKey] = useState(connections[0]?.key ?? '');

  const [schemaState, setSchemaState] = useState<{ loading: boolean; schema?: any; error?: string }>({
    loading: false,
    schema: data.schema,
    error: data.schemaError,
  });

  const [queryState, setQueryState] = useState<{ loading: boolean; result?: any; error?: string }>({ loading: false });
  const selectedConnection = connections.find((connection: any) => connection.key === selectedKey) ?? connections[0];

  async function loadSchema(key = selectedConnection?.key) {
    if (!projectId || !key) {
      return;
    }

    setSelectedKey(key);
    setSchemaState({ loading: true });

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/ide-panel/database?schemaKey=${encodeURIComponent(key)}`,
        { headers: { accept: 'application/json' } },
      );

      const envelope = (await response.json()) as any;

      if (!response.ok || envelope.status === 'error') {
        throw new Error(envelope.error?.message ?? 'Unable to inspect database schema');
      }

      setSchemaState({ loading: false, schema: envelope.data?.schema, error: envelope.data?.schemaError });
    } catch (error: any) {
      setSchemaState({ loading: false, error: error?.message ?? 'Unable to inspect database schema' });
    }
  }

  async function runQuery(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!projectId) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    formData.set('intent', 'query');
    setQueryState({ loading: true });

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ide-panel/database`, {
        method: 'POST',
        body: formData,
      });

      const result = (await response.json()) as any;

      if (!response.ok || result.error) {
        throw new Error(result.error ?? 'Database query failed');
      }

      setQueryState({ loading: false, result: result.result });
      await reload?.();
    } catch (error: any) {
      setQueryState({ loading: false, error: error?.message ?? 'Database query failed' });
    }
  }

  const defaultQuery =
    selectedConnection?.kind === 'mongodb'
      ? '{ "filter": {}, "projection": {} }'
      : selectedConnection?.kind === 'redis'
        ? 'SCAN 0 COUNT 50'
        : 'select * from information_schema.tables limit 25';

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ['Connections', String(connections.length)],
          ['Providers', [...new Set(connections.map((item: any) => item.kind))].join(', ') || 'None'],
          ['Secrets', String(secrets.length)],
          ['Env vars', String(envVars.length)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
          >
            <div className="text-[11px] uppercase tracking-wide text-bolt-elements-textSecondary">{label}</div>
            <div className="mt-1 truncate text-sm font-semibold text-bolt-elements-textPrimary">{value}</div>
          </div>
        ))}
      </div>

      <div className="bolt-project-tool-tabs">
        {[
          ['explorer', 'Explorer'],
          ['query', 'Query'],
          ['schema', 'Schema'],
          ['secrets', 'Secrets'],
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

      {connections.length === 0 ? (
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
          <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">No database connection configured</h3>
          <p className="mt-1 text-sm text-bolt-elements-textSecondary">
            Add a Postgres, MySQL, MongoDB or Redis URL as an environment variable or secret. Secret values are used
            server-side and never returned to the browser.
          </p>
        </div>
      ) : null}

      {activeTab === 'explorer' && (
        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="grid content-start gap-3">
            {connections.map((connection: any) => (
              <button
                key={connection.key}
                type="button"
                className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 text-left hover:border-bolt-elements-focus"
                aria-current={selectedConnection?.key === connection.key ? 'page' : undefined}
                onClick={() => {
                  setSelectedKey(connection.key);
                  void loadSchema(connection.key);
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm text-bolt-elements-textPrimary">{connection.key}</strong>
                  <span className="rounded bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs text-bolt-elements-textSecondary">
                    {connection.kind}
                  </span>
                </div>
                <div className="mt-2 truncate text-xs text-bolt-elements-textSecondary">{connection.maskedUrl}</div>
                <div className="mt-2 text-xs text-bolt-elements-textSecondary">
                  {connection.environment} · {connection.source}
                </div>
              </button>
            ))}
          </section>
          <DatabaseSchemaPreview schemaState={schemaState} />
        </div>
      )}

      {activeTab === 'query' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <form
            onSubmit={runQuery}
            className="grid gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
          >
            <input name="intent" value="query" type="hidden" />
            <label className="grid gap-1 text-xs font-medium text-bolt-elements-textSecondary">
              Connection
              <select
                name="connectionKey"
                value={selectedConnection?.key ?? ''}
                onChange={(event) => setSelectedKey(event.target.value)}
                className="h-9 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
              >
                {connections.map((connection: any) => (
                  <option key={connection.key} value={connection.key}>
                    {connection.key} ({connection.kind})
                  </option>
                ))}
              </select>
            </label>
            {selectedConnection?.kind === 'mongodb' && (
              <PanelInput name="collection" placeholder="Collection name, optional for listCollections" />
            )}
            <label className="grid gap-1 text-xs font-medium text-bolt-elements-textSecondary">
              Read-only query
              <textarea
                name="query"
                defaultValue={defaultQuery}
                className="min-h-40 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 font-mono text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
              />
            </label>
            <PanelInput name="limit" type="number" min="1" max="200" defaultValue="50" aria-label="Result limit" />
            <PanelButton disabled={busy || queryState.loading || !selectedConnection}>Run read-only query</PanelButton>
          </form>
          <DatabaseQueryResult queryState={queryState} />
        </div>
      )}

      {activeTab === 'schema' && <DatabaseSchemaPreview schemaState={schemaState} />}

      {activeTab === 'secrets' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid gap-3">
            {['development', 'preview', 'staging', 'production', 'shared'].map((environment) => {
              const environmentSecrets = secrets.filter((secret: any) => {
                const key = String(secret.key ?? '').toUpperCase();

                return environment === 'shared'
                  ? !/^(DEV|DEVELOPMENT|PREVIEW|STAGING|PROD|PRODUCTION)_/.test(key)
                  : environment === 'production'
                    ? key.startsWith('PROD_') || key.startsWith('PRODUCTION_')
                    : environment === 'development'
                      ? key.startsWith('DEV_') || key.startsWith('DEVELOPMENT_')
                      : key.startsWith(`${environment.toUpperCase()}_`);
              });

              return (
                <section
                  key={environment}
                  className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
                >
                  <h3 className="text-sm font-semibold capitalize text-bolt-elements-textPrimary">{environment}</h3>
                  <div className="mt-3 grid gap-2">
                    {environmentSecrets.length ? (
                      environmentSecrets.map((secret: any) => (
                        <div
                          key={secret.key}
                          className="flex items-center justify-between gap-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2"
                        >
                          <span className="truncate text-sm text-bolt-elements-textPrimary">{secret.key}</span>
                          <form onSubmit={onSubmit}>
                            <input name="intent" value="delete-secret" type="hidden" />
                            <input name="key" value={secret.key} type="hidden" />
                            <PanelButton disabled={busy} variant="outline">
                              Delete
                            </PanelButton>
                          </form>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-bolt-elements-textSecondary">No secrets in this environment.</div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          <form
            onSubmit={onSubmit}
            className="grid content-start gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
          >
            <input name="intent" value="upsert-secret" type="hidden" />
            <label className="grid gap-1 text-xs font-medium text-bolt-elements-textSecondary">
              Environment
              <select
                onChange={(event) => {
                  const input = event.currentTarget.form?.elements.namedItem('key') as HTMLInputElement | null;
                  const prefix = event.currentTarget.value;

                  if (input && prefix && !/^(DEV|DEVELOPMENT|PREVIEW|STAGING|PROD|PRODUCTION)_/.test(input.value)) {
                    input.value = `${prefix}_${input.value || 'DATABASE_URL'}`;
                  }
                }}
                className="h-9 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
              >
                <option value="">Shared</option>
                <option value="DEVELOPMENT">Development</option>
                <option value="PREVIEW">Preview</option>
                <option value="STAGING">Staging</option>
                <option value="PRODUCTION">Production</option>
              </select>
            </label>
            <PanelInput name="key" placeholder="DATABASE_URL" required />
            <PanelInput name="value" type="password" placeholder="Secret value" required />
            <PanelButton disabled={busy}>Save encrypted secret</PanelButton>
          </form>
        </div>
      )}

      {activeTab === 'backups' && (
        <div className="grid gap-3">
          <form onSubmit={onSubmit} className="bolt-project-inline-form">
            <input name="intent" value="create-backup" type="hidden" />
            <PanelInput name="label" placeholder="Manual database checkpoint" />
            <PanelButton disabled={busy}>Create checkpoint</PanelButton>
          </form>
          <PanelRows
            rows={databaseBackups.map((snapshot: any) => [
              snapshot.label ?? snapshot.id,
              snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : 'Database checkpoint',
            ])}
            empty="No database checkpoints yet."
          />
        </div>
      )}
    </div>
  );
}

function DatabaseSchemaPreview({ schemaState }: { schemaState: { loading: boolean; schema?: any; error?: string } }) {
  if (schemaState.loading) {
    return <div className="bolt-project-empty-panel">Inspecting database schema...</div>;
  }

  if (schemaState.error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
        {schemaState.error}
      </div>
    );
  }

  const schema = schemaState.schema;

  if (!schema) {
    return <div className="bolt-project-empty-panel">Select a connection to load tables, collections or keys.</div>;
  }

  const items = schema.tables ?? schema.collections ?? schema.keys ?? [];
  const columns = Array.isArray(schema.columns) ? schema.columns : [];

  const tableNames = new Set(
    columns.map((column: any) => String(column.table_name ?? '').toLowerCase()).filter(Boolean),
  );
  const relationships = columns
    .filter((column: any) =>
      String(column.column_name ?? '')
        .toLowerCase()
        .endsWith('_id'),
    )
    .map((column: any) => {
      const source = String(column.table_name ?? '');
      const field = String(column.column_name ?? '');
      const baseTarget = field.replace(/_id$/i, '').toLowerCase();

      const target =
        [baseTarget, `${baseTarget}s`, `${baseTarget}es`].find((candidate) => tableNames.has(candidate)) ?? baseTarget;

      return { source, field, target };
    })
    .filter(
      (relationship: any) => relationship.source && relationship.target && relationship.source !== relationship.target,
    )
    .slice(0, 24);

  return (
    <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
      <h3 className="mb-3 text-sm font-semibold text-bolt-elements-textPrimary">Schema viewer</h3>
      {items.length ? (
        <div className="grid gap-2">
          {items.slice(0, 80).map((item: any, index: number) => (
            <div
              key={`${item.table_name ?? item.name ?? item.key}-${index}`}
              className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3"
            >
              <div className="text-sm font-medium text-bolt-elements-textPrimary">
                {item.table_name ?? item.name ?? item.key}
              </div>
              <div className="mt-1 text-xs text-bolt-elements-textSecondary">
                {item.table_schema ?? item.type ?? item.sampleKeys?.join(', ') ?? `ttl ${item.ttl}`}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-bolt-elements-textSecondary">No schema objects returned.</div>
      )}
      {schema.columns?.length ? (
        <div className="mt-4 overflow-auto rounded-md border border-bolt-elements-borderColor">
          {schema.columns.slice(0, 160).map((column: any, index: number) => (
            <div
              key={`${column.table_name}-${column.column_name}-${index}`}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px] gap-2 border-b border-bolt-elements-borderColor px-3 py-2 text-xs last:border-b-0"
            >
              <span className="truncate text-bolt-elements-textPrimary">{column.table_name}</span>
              <span className="truncate text-bolt-elements-textPrimary">{column.column_name}</span>
              <span className="truncate text-bolt-elements-textSecondary">{column.data_type}</span>
            </div>
          ))}
        </div>
      ) : null}
      {relationships.length ? (
        <div className="mt-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
            Relationship map
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {relationships.map((relationship: any, index: number) => (
              <div
                key={`${relationship.source}-${relationship.field}-${relationship.target}-${index}`}
                className="flex items-center gap-2 rounded border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs"
              >
                <span className="truncate font-medium text-bolt-elements-textPrimary">{relationship.source}</span>
                <span className="text-bolt-elements-textTertiary">via {relationship.field}</span>
                <span className="i-ph:arrow-right shrink-0 text-bolt-elements-textSecondary" aria-hidden="true" />
                <span className="truncate font-medium text-bolt-elements-textPrimary">{relationship.target}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-bolt-elements-textSecondary">
            Relations are inferred from real schema columns ending in _id. Database-enforced foreign keys will appear as
            soon as the connected provider exposes them through inspection.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function DatabaseQueryResult({ queryState }: { queryState: { loading: boolean; result?: any; error?: string } }) {
  if (queryState.loading) {
    return <div className="bolt-project-empty-panel">Running read-only query...</div>;
  }

  if (queryState.error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
        {queryState.error}
      </div>
    );
  }

  const rows = Array.isArray(queryState.result?.rows) ? queryState.result.rows : [];
  const columns = queryState.result?.columns?.length ? queryState.result.columns : rows[0] ? Object.keys(rows[0]) : [];

  return (
    <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
      <h3 className="mb-3 text-sm font-semibold text-bolt-elements-textPrimary">Results</h3>
      {rows.length ? (
        <div className="max-h-[520px] overflow-auto rounded-md border border-bolt-elements-borderColor">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="sticky top-0 bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary">
              <tr>
                {columns.map((column: string) => (
                  <th key={column} className="px-3 py-2 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any, index: number) => (
                <tr key={index} className="border-t border-bolt-elements-borderColor">
                  {columns.map((column: string) => (
                    <td key={column} className="max-w-[260px] truncate px-3 py-2 text-bolt-elements-textPrimary">
                      {typeof row[column] === 'object' ? JSON.stringify(row[column]) : String(row[column] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-sm text-bolt-elements-textSecondary">Run a query to see rows here.</div>
      )}
    </section>
  );
}

function ProjectSecurityPanel({
  data,
  project,
  onSubmit,
  busy,
}: {
  data: any;
  project: any;
  onSubmit: any;
  busy: boolean;
}) {
  const [activeTab, setActiveTab] = useState<'active' | 'hidden' | 'settings' | 'reports' | 'compare'>('active');
  const state = data.securityState ?? {};
  const settings = state.settings ?? {};
  const scans = state.scans ?? [];
  const vulnerabilities = state.vulnerabilities ?? [];
  const activeVulnerabilities = vulnerabilities.filter((item: any) => !item.hidden);

  const visibleVulnerabilities = vulnerabilities.filter((item: any) =>
    activeTab === 'hidden' ? item.hidden : !item.hidden,
  );

  const latestScan = scans[0];
  const previousScan = scans[1];
  const latestCounts = latestScan?.counts ?? securityCountsFromVulnerabilities(activeVulnerabilities);
  const previousCounts = previousScan?.counts ?? {};
  const schedule = settings.schedule ?? {};
  const githubSecurityUrl = githubSecurityHref(project);

  const severityRows = ['critical', 'high', 'moderate', 'low', 'info'].map((severity) => [
    severity,
    `${activeVulnerabilities.filter((item: any) => item.severity === severity).length} active`,
  ]);

  const exportSarifReport = () => downloadSecurityReport('sarif', project, state);
  const exportJsonReport = () => downloadSecurityReport('json', project, state);

  const printReport = () => {
    const report = buildSecurityReport(project, state);
    const printable = window.open('', '_blank', 'noopener,noreferrer');

    if (!printable) {
      return;
    }

    printable.document.write(renderSecurityReportHtml(report));
    printable.document.close();
    printable.focus();
    printable.print();
  };

  return (
    <div className="bolt-project-security-tool">
      <section className="bolt-project-security-summary">
        <div>
          <h3>Security and privacy scanner</h3>
          <p>
            Runs SCA, secret scanning and lightweight SAST against the active workspace. Findings, schedules and reports
            are stored in project backend state.
          </p>
        </div>
        <form onSubmit={onSubmit}>
          <input name="intent" value="scan" type="hidden" />
          <PanelButton disabled={busy}>{busy ? 'Scanning...' : 'Run full scan'}</PanelButton>
        </form>
      </section>

      <section className="bolt-project-security-scope" aria-label="Security scanner coverage">
        {[
          ['SCA', 'npm audit dependency advisories', settings.dependencyAuditEnabled !== false],
          ['Secrets', 'API keys, tokens and passwords in source', settings.secretScanEnabled !== false],
          ['SAST', 'Unsafe DOM sinks and command execution patterns', settings.sastEnabled !== false],
          ['Privacy', 'Client-side privacy risk signals', settings.privacyDetectionEnabled !== false],
        ].map(([label, description, enabled]) => (
          <article key={String(label)} data-enabled={enabled ? 'true' : 'false'}>
            <strong>{label}</strong>
            <span>{description}</span>
          </article>
        ))}
      </section>

      <div className="bolt-project-security-grid">
        <aside>
          <strong>Latest scan</strong>
          <PanelRows
            rows={[
              ['Status', latestScan?.status ?? 'No scan yet'],
              ['Profile', latestScan?.scanner ?? settings.scannerProfile ?? 'workspace-runtime'],
              ['Summary', latestScan?.summary ?? 'Run a scan to populate security findings'],
              [
                'Schedule',
                schedule.enabled ? `${schedule.frequency}, next ${formatSecurityDate(schedule.nextRunAt)}` : 'Manual',
              ],
            ]}
          />
          <strong>Severity</strong>
          <PanelRows rows={severityRows} />
          <strong>GitHub Security</strong>
          <PanelRows
            rows={[
              ['Status', githubSecurityUrl ? 'Repository detected' : 'No GitHub remote detected'],
              ['Sync', settings.githubSecuritySyncEnabled ? 'Enabled' : 'Manual reports'],
            ]}
          />
          {githubSecurityUrl ? (
            <a className="bolt-project-security-link" href={githubSecurityUrl} target="_blank" rel="noreferrer">
              Open GitHub Security tab
            </a>
          ) : (
            <a className="bolt-project-security-link" href="?panel=git">
              Connect a GitHub remote
            </a>
          )}
        </aside>

        <main>
          <div className="bolt-project-tool-tabs">
            {[
              ['active', 'Active'],
              ['hidden', 'Hidden'],
              ['compare', 'Compare'],
              ['reports', 'Reports'],
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
              <label>
                <span>Scanner profile</span>
                <select name="scannerProfile" defaultValue={settings.scannerProfile ?? 'workspace-runtime'}>
                  <option value="workspace-runtime">Full workspace runtime</option>
                  <option value="sca">SCA only</option>
                  <option value="secrets">Secrets only</option>
                  <option value="sast">SAST only</option>
                </select>
              </label>
              {[
                ['dependencyAuditEnabled', 'Dependency audit', settings.dependencyAuditEnabled !== false],
                ['secretScanEnabled', 'Secret scan', settings.secretScanEnabled !== false],
                ['sastEnabled', 'Static application security scan', settings.sastEnabled !== false],
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
              <label>
                <span>Automatic schedule</span>
                <select name="scheduleEnabled" defaultValue={schedule.enabled ? 'true' : 'false'}>
                  <option value="true">Enabled</option>
                  <option value="false">Manual only</option>
                </select>
              </label>
              <label>
                <span>Schedule cadence</span>
                <select name="scheduleFrequency" defaultValue={schedule.frequency ?? 'weekly'}>
                  <option value="daily">Daily at 03:00 UTC</option>
                  <option value="weekly">Weekly at 03:00 UTC</option>
                </select>
              </label>
              <label>
                <span>GitHub Security reporting</span>
                <select
                  name="githubSecuritySyncEnabled"
                  defaultValue={settings.githubSecuritySyncEnabled ? 'true' : 'false'}
                >
                  <option value="true">Enabled when GitHub remote exists</option>
                  <option value="false">Manual export only</option>
                </select>
              </label>
              <PanelButton disabled={busy}>Save scanner settings</PanelButton>
            </form>
          ) : activeTab === 'reports' ? (
            <section className="bolt-project-security-reports">
              <article>
                <strong>Export audit package</strong>
                <p>
                  Generate a report from the current backend scan state. SARIF can be uploaded to GitHub Security Code
                  Scanning, and the printable report can be saved as PDF by the browser.
                </p>
                <div>
                  <button type="button" onClick={exportSarifReport}>
                    Export SARIF
                  </button>
                  <button type="button" onClick={exportJsonReport}>
                    Export JSON
                  </button>
                  <button type="button" onClick={printReport}>
                    Print / Save PDF
                  </button>
                </div>
              </article>
              <PanelRows
                rows={[
                  ['Findings in report', String(vulnerabilities.length)],
                  ['Latest scan', latestScan?.completedAt ? formatSecurityDate(latestScan.completedAt) : 'No scan yet'],
                  ['SARIF target', 'GitHub Code Scanning compatible'],
                ]}
              />
            </section>
          ) : activeTab === 'compare' ? (
            <section className="bolt-project-security-compare">
              <div>
                <h4>Scan comparison</h4>
                <p>Compares the latest completed scan against the previous scan stored for this project.</p>
              </div>
              <div className="bolt-project-security-comparison-grid">
                {['critical', 'high', 'moderate', 'low', 'info'].map((severity) => {
                  const current = Number(latestCounts?.[severity] ?? 0);
                  const previous = Number(previousCounts?.[severity] ?? 0);
                  const delta = current - previous;

                  return (
                    <article key={severity}>
                      <span>{severity}</span>
                      <strong>{current}</strong>
                      <small data-delta={delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}>
                        {delta > 0 ? '+' : ''}
                        {delta} vs previous
                      </small>
                    </article>
                  );
                })}
              </div>
              <PanelRows
                rows={[
                  ['Latest', latestScan?.completedAt ? formatSecurityDate(latestScan.completedAt) : 'No scan yet'],
                  [
                    'Previous',
                    previousScan?.completedAt ? formatSecurityDate(previousScan.completedAt) : 'No previous scan',
                  ],
                ]}
              />
            </section>
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

function securityCountsFromVulnerabilities(vulnerabilities: any[]) {
  return ['critical', 'high', 'moderate', 'low', 'info'].reduce<Record<string, number>>((acc, severity) => {
    acc[severity] = vulnerabilities.filter((item: any) => item.severity === severity).length;
    return acc;
  }, {});
}

function formatSecurityDate(value?: string | null) {
  if (!value) {
    return 'Not scheduled';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not scheduled';
  }

  return date.toLocaleString();
}

function githubSecurityHref(project: any) {
  const candidates = [
    project?.repositoryUrl,
    project?.gitRemoteUrl,
    project?.githubUrl,
    project?.metadata?.repositoryUrl,
    project?.metadata?.gitRemoteUrl,
  ].filter(Boolean);

  const remote = String(candidates[0] ?? '');
  const match = remote.match(/github\.com[:/](?<owner>[^/\s]+)\/(?<repo>[^/\s.]+)(?:\.git)?/i);

  if (!match?.groups) {
    return null;
  }

  return `https://github.com/${match.groups.owner}/${match.groups.repo}/security/code-scanning`;
}

function buildSecurityReport(project: any, state: any) {
  const vulnerabilities = Array.isArray(state?.vulnerabilities) ? state.vulnerabilities : [];
  const scans = Array.isArray(state?.scans) ? state.scans : [];

  return {
    project: {
      id: project?.id ?? 'unknown',
      name: project?.name ?? 'Workspace project',
    },
    generatedAt: new Date().toISOString(),
    latestScan: scans[0] ?? null,
    scans,
    vulnerabilities,
    counts: securityCountsFromVulnerabilities(vulnerabilities.filter((item: any) => !item.hidden)),
  };
}

function securityReportToSarif(report: any) {
  const vulnerabilities = Array.isArray(report.vulnerabilities) ? report.vulnerabilities : [];

  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'VibeCore Security Scanner',
            informationUri: 'https://github.com/openaxcloud/vibecore',
            rules: vulnerabilities.map((vulnerability: any) => ({
              id: vulnerability.id,
              name: vulnerability.title,
              shortDescription: { text: vulnerability.title },
              fullDescription: { text: vulnerability.details || vulnerability.recommendation || vulnerability.source },
              help: {
                text: vulnerability.recommendation || 'Review this finding and apply the recommended remediation.',
              },
              defaultConfiguration: { level: sarifLevel(vulnerability.severity) },
              properties: {
                source: vulnerability.source,
                packageName: vulnerability.packageName,
                status: vulnerability.status,
              },
            })),
          },
        },
        results: vulnerabilities
          .filter((vulnerability: any) => !vulnerability.hidden)
          .map((vulnerability: any) => ({
            ruleId: vulnerability.id,
            level: sarifLevel(vulnerability.severity),
            message: { text: vulnerability.details || vulnerability.title },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'workspace' },
                },
              },
            ],
            properties: {
              recommendation: vulnerability.recommendation,
              source: vulnerability.source,
            },
          })),
        properties: {
          projectId: report.project.id,
          projectName: report.project.name,
          generatedAt: report.generatedAt,
        },
      },
    ],
  };
}

function sarifLevel(severity: string) {
  if (severity === 'critical' || severity === 'high') {
    return 'error';
  }

  if (severity === 'moderate') {
    return 'warning';
  }

  return 'note';
}

function downloadSecurityReport(format: 'json' | 'sarif', project: any, state: any) {
  const report = buildSecurityReport(project, state);
  const payload = format === 'sarif' ? securityReportToSarif(report) : report;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  const projectSlug = String(report.project.name || report.project.id)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

  anchor.href = url;
  anchor.download = `${projectSlug || 'project'}-security-report.${format === 'sarif' ? 'sarif' : 'json'}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

function renderSecurityReportHtml(report: any) {
  const escape = (value: unknown) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const rows = (report.vulnerabilities ?? [])
    .map(
      (finding: any) => `
        <tr>
          <td>${escape(finding.severity)}</td>
          <td>${escape(finding.title)}</td>
          <td>${escape(finding.source)}</td>
          <td>${escape(finding.recommendation || finding.details)}</td>
        </tr>
      `,
    )
    .join('');

  return `<!doctype html>
    <html>
      <head>
        <title>Security report - ${escape(report.project.name)}</title>
        <style>
          body { font-family: ui-sans-serif, system-ui, sans-serif; color: #0f172a; margin: 32px; }
          h1 { margin: 0 0 8px; }
          p { color: #475569; }
          table { width: 100%; border-collapse: collapse; margin-top: 24px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; vertical-align: top; }
          th { background: #f8fafc; }
        </style>
      </head>
      <body>
        <h1>Security report</h1>
        <p>${escape(report.project.name)} - generated ${escape(formatSecurityDate(report.generatedAt))}</p>
        <table>
          <thead><tr><th>Severity</th><th>Finding</th><th>Source</th><th>Recommendation</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4">No findings recorded.</td></tr>'}</tbody>
        </table>
      </body>
    </html>`;
}

function ProjectDebuggerPanel({
  data,
  onSubmit,
  busy,
  reload,
}: {
  data: any;
  onSubmit: any;
  busy: boolean;
  reload?: () => void | Promise<void>;
}) {
  const state = data.debuggerState ?? {};
  const launchConfigs = state.launchConfigs ?? [];
  const breakpoints = state.breakpoints ?? [];
  const watches = state.watches ?? [];
  const sessions = state.sessions ?? [];
  const activeSession = sessions.find((session: any) => session.status === 'paused') ?? sessions[0];
  const processes = data.runtimeProcesses?.processes ?? data.runtimeProcesses ?? [];
  const logs = data.runtimeLogs?.logs ?? [];

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ['Launch configs', launchConfigs.length],
          ['Breakpoints', breakpoints.filter((breakpoint: any) => breakpoint.enabled !== false).length],
          ['Watch expressions', watches.filter((watch: any) => watch.enabled !== false).length],
          ['Runtime processes', Array.isArray(processes) ? processes.length : 0],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
          >
            <div className="text-[11px] uppercase tracking-wide text-bolt-elements-textSecondary">{label}</div>
            <div className="mt-1 text-sm font-semibold text-bolt-elements-textPrimary">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="grid gap-4">
          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Debug sessions</h3>
                <p className="text-xs text-bolt-elements-textSecondary">
                  Launches run in the real workspace runtime. Paused frames, variables and stepping appear when the
                  configured adapter reports a paused state.
                </p>
              </div>
              <button
                type="button"
                className="rounded border border-bolt-elements-borderColor px-2 py-1 text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
                onClick={() => void reload?.()}
                disabled={busy}
              >
                Refresh runtime
              </button>
            </div>
            <div className="grid gap-2">
              {sessions.length ? (
                sessions.map((session: any) => (
                  <div
                    key={session.id}
                    className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-bolt-elements-textPrimary">
                          {session.name}
                        </div>
                        <div className="mt-1 truncate font-mono text-xs text-bolt-elements-textSecondary">
                          {session.command}
                        </div>
                      </div>
                      <span className="rounded bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs text-bolt-elements-textSecondary">
                        {session.status}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {['continue', 'step-over', 'step-into', 'step-out'].map((action) => (
                        <button
                          key={action}
                          type="button"
                          disabled={session.status !== 'paused'}
                          className="h-8 rounded border border-bolt-elements-borderColor px-2 text-xs text-bolt-elements-textSecondary disabled:opacity-50"
                          title="Stepping is enabled when a debug adapter reports a paused frame."
                        >
                          {action.replace('-', ' ')}
                        </button>
                      ))}
                      {session.status === 'running' && (
                        <form onSubmit={onSubmit}>
                          <input name="intent" value="stop-session" type="hidden" />
                          <input name="sessionId" value={session.id} type="hidden" />
                          <PanelButton disabled={busy} variant="outline">
                            Stop
                          </PanelButton>
                        </form>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-bolt-elements-textSecondary">No debug session has been launched yet.</div>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
              <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Breakpoints</h3>
              <div className="mt-3 grid gap-2">
                {breakpoints.length ? (
                  breakpoints.map((breakpoint: any) => (
                    <div
                      key={breakpoint.id}
                      className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-mono text-xs text-bolt-elements-textPrimary">
                            {breakpoint.filePath}:{breakpoint.line}
                          </div>
                          {breakpoint.condition || breakpoint.hitCondition || breakpoint.logMessage ? (
                            <div className="mt-1 text-xs text-bolt-elements-textSecondary">
                              {breakpoint.condition ? `if ${breakpoint.condition}` : null}
                              {breakpoint.hitCondition ? ` hit ${breakpoint.hitCondition}` : null}
                              {breakpoint.logMessage ? ` log ${breakpoint.logMessage}` : null}
                            </div>
                          ) : null}
                        </div>
                        <form onSubmit={onSubmit}>
                          <input name="intent" value="delete-breakpoint" type="hidden" />
                          <input name="breakpointId" value={breakpoint.id} type="hidden" />
                          <PanelButton disabled={busy} variant="outline">
                            Remove
                          </PanelButton>
                        </form>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-bolt-elements-textSecondary">No breakpoints configured.</div>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
              <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Call stack and variables</h3>
              {activeSession?.status === 'paused' ? (
                <div className="mt-3 grid gap-2">
                  <PanelRows rows={activeSession.callStack ?? []} empty="No stack frames reported by adapter." />
                  <PanelRows rows={activeSession.variables ?? []} empty="No variables reported by adapter." />
                </div>
              ) : (
                <div className="mt-3 rounded-md border border-dashed border-bolt-elements-borderColor p-4 text-sm text-bolt-elements-textSecondary">
                  No paused frame. Start a launch configuration with inspector/debugpy and pause on a breakpoint to
                  populate stack frames, scopes and variables.
                </div>
              )}
            </section>
          </div>
        </section>

        <aside className="grid content-start gap-4">
          <form
            onSubmit={onSubmit}
            className="grid gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
          >
            <input name="intent" value="start-session" type="hidden" />
            <label className="grid gap-1 text-xs font-medium text-bolt-elements-textSecondary">
              Launch configuration
              <select
                name="configId"
                className="h-9 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
              >
                {launchConfigs.map((config: any) => (
                  <option key={config.id} value={config.id}>
                    {config.name}
                  </option>
                ))}
              </select>
            </label>
            <PanelButton disabled={busy || !launchConfigs.length}>Start debugging</PanelButton>
          </form>

          <form
            onSubmit={onSubmit}
            className="grid gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
          >
            <input name="intent" value="save-config" type="hidden" />
            <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">launch.json config</h3>
            <PanelInput name="name" placeholder="Node inspector: app" required />
            <PanelInput name="command" placeholder="npm run dev" />
            <PanelInput name="program" placeholder="src/server.ts" />
            <PanelInput name="args" placeholder="--port 3000" />
            <PanelInput name="env" placeholder="DEBUG=app:*" />
            <label className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
              <input name="stopOnEntry" value="true" type="checkbox" />
              Stop on entry
            </label>
            <PanelButton disabled={busy}>Save config</PanelButton>
          </form>

          <form
            onSubmit={onSubmit}
            className="grid gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
          >
            <input name="intent" value="add-breakpoint" type="hidden" />
            <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Conditional breakpoint</h3>
            <PanelInput name="filePath" placeholder="src/App.tsx" required />
            <PanelInput name="line" type="number" min="1" placeholder="42" required />
            <PanelInput name="condition" placeholder="user.id === targetId" />
            <PanelInput name="hitCondition" placeholder=">= 5" />
            <PanelInput name="logMessage" placeholder="user={user.id}" />
            <PanelButton disabled={busy}>Add breakpoint</PanelButton>
          </form>

          <form
            onSubmit={onSubmit}
            className="grid gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
          >
            <input name="intent" value="add-watch" type="hidden" />
            <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Watch expressions</h3>
            <PanelInput name="expression" placeholder="request.user" required />
            <PanelButton disabled={busy}>Add watch</PanelButton>
          </form>

          {watches.length ? (
            <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
              <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Watch list</h3>
              <div className="mt-3 grid gap-2">
                {watches.map((watch: any) => (
                  <div key={watch.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-mono text-bolt-elements-textPrimary">{watch.expression}</span>
                    <form onSubmit={onSubmit}>
                      <input name="intent" value="delete-watch" type="hidden" />
                      <input name="watchId" value={watch.id} type="hidden" />
                      <PanelButton disabled={busy} variant="outline">
                        Remove
                      </PanelButton>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {logs.length ? (
            <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
              <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Runtime output</h3>
              <div className="mt-3 max-h-44 overflow-auto font-mono text-xs text-bolt-elements-textSecondary">
                {logs.slice(-12).map((log: any, index: number) => (
                  <div key={`${log.timestamp}-${index}`}>{log.message}</div>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function ProjectLogsPanel({ data, reload, busy }: { data: any; reload?: () => void | Promise<void>; busy: boolean }) {
  const [cleared, setCleared] = useState(false);
  const [split, setSplit] = useState(false);
  const [activeStream, setActiveStream] = useState<'console' | 'workflow' | 'system'>('console');
  const [level, setLevel] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [query, setQuery] = useState('');
  const [regexEnabled, setRegexEnabled] = useState(false);
  const [liveTail, setLiveTail] = useState(true);
  const workspace = data.workspace ?? data.runtimeStatus;
  const workspaceStatus = workspace?.status ?? data.runtimeStatus?.status ?? 'unknown';
  const runtimeLogs = Array.isArray(data.runtimeLogs?.logs) ? data.runtimeLogs.logs : [];

  const deploymentLogs = (data.deployments ?? []).flatMap((deployment: any) =>
    (deployment.logs ?? []).map((log: any) => ({
      level: log.level ?? classifyLogLevel(log.message ?? ''),
      message: log.message ?? '',
      source: 'workflow',
      timestamp: log.timestamp ?? deployment.createdAt,
      context: deployment.provider ? `${deployment.provider}:${deployment.environment ?? 'preview'}` : 'deployment',
    })),
  );

  const systemEvents = buildSystemLogEvents(data);
  const logs = cleared ? [] : [...runtimeLogs, ...deploymentLogs, ...systemEvents];

  const filteredLogs = filterLogEntries(
    logs.filter((entry: any) => entry.source === activeStream),
    level,
    query,
    regexEnabled,
  );
  const secondaryLogs = split
    ? filterLogEntries(
        logs.filter((entry: any) => entry.source !== activeStream),
        level,
        query,
        regexEnabled,
      )
    : [];

  useEffect(() => {
    if (!liveTail || !reload) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void reload();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [liveTail, reload]);

  const downloadLogs = () => {
    const payload = filteredLogs
      .map((entry: any) => `${entry.timestamp ?? new Date().toISOString()} [${entry.level}] ${entry.message}`)
      .join('\n');

    const blob = new Blob([payload || 'No log lines in the current filter.'], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = `vibecore-${activeStream}-logs.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className={classNames('bolt-project-console-tool', split && 'bolt-project-console-tool-split')}>
      <div className="bolt-project-console-header">
        {[
          ['console', 'Console'],
          ['workflow', 'Workflow logs'],
          ['system', 'System logs'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={activeStream === id}
            aria-label={`Show ${label}`}
            onClick={() => setActiveStream(id as any)}
          >
            {label}
          </button>
        ))}
        <span className="bolt-project-console-status" title={`Workspace ${workspaceStatus}`}>
          {workspaceStatus}
        </span>
        <select
          aria-label="Filter logs by level"
          value={level}
          onChange={(event) => setLevel(event.target.value as any)}
        >
          <option value="all">All levels</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
        <input
          aria-label="Search logs"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={regexEnabled ? 'Regex search' : 'Search logs'}
        />
        <button
          type="button"
          aria-pressed={regexEnabled}
          aria-label="Toggle regex search"
          onClick={() => setRegexEnabled((value) => !value)}
        >
          Regex
        </button>
        <button type="button" aria-label="Clear visible logs" onClick={() => setCleared(true)}>
          Clear logs
        </button>
        <button type="button" aria-label="Toggle split log view" onClick={() => setSplit((value) => !value)}>
          {split ? 'Close split' : 'Split view'}
        </button>
        <button type="button" aria-label="Download filtered logs" onClick={downloadLogs}>
          Download
        </button>
        <button
          type="button"
          aria-pressed={liveTail}
          aria-label="Toggle live tail"
          onClick={() => setLiveTail((value) => !value)}
        >
          {liveTail ? 'Live tail on' : 'Live tail off'}
        </button>
        <button type="button" aria-label="Reload logs from backend" onClick={() => void reload?.()} disabled={busy}>
          {busy ? 'Refreshing' : 'Reload'}
        </button>
      </div>
      <LogStreamView logs={filteredLogs} empty={`No ${activeStream} logs match the current filter.`} />
      {split && <LogStreamView logs={secondaryLogs} empty="No secondary stream logs match the current filter." />}
    </div>
  );
}

function LogStreamView({ logs, empty }: { logs: any[]; empty: string }) {
  return (
    <div className="bolt-project-console-body" role="log" aria-live="polite">
      {logs.length ? (
        logs.map((entry: any, index: number) => (
          <div key={`${entry.timestamp ?? 'log'}-${index}`} className="bolt-project-log-line" data-level={entry.level}>
            <span>{formatLogTime(entry.timestamp)}</span>
            <strong>{entry.level ?? 'info'}</strong>
            {entry.context ? <em>{entry.context}</em> : null}
            <code>{entry.message}</code>
          </div>
        ))
      ) : (
        <div className="bolt-project-console-empty">{empty}</div>
      )}
    </div>
  );
}

function buildSystemLogEvents(data: any) {
  const workspace = data.workspace ?? data.runtimeStatus;
  const processes = Array.isArray(data.runtimeProcesses) ? data.runtimeProcesses : [];
  const ports = Array.isArray(data.runtimePorts) ? data.runtimePorts : [];
  const activity = (data.recentActivity ?? []).filter((event: any) => event.action !== 'project.ide_state.save');

  const ideStateSaveCount = (data.recentActivity ?? []).filter(
    (event: any) => event.action === 'project.ide_state.save',
  ).length;

  const base = [
    {
      level: workspace?.status === 'failed' ? 'error' : 'info',
      source: 'system',
      message: workspace
        ? `Workspace ${workspace.id ?? data.workspaceId} is ${workspace.status ?? 'unknown'} (${workspace.runtimeMode ?? 'runtime'})`
        : `Workspace ${data.workspaceId ?? 'unknown'} has no dashboard record; using runtime snapshot`,
      timestamp: new Date().toISOString(),
      context: 'workspace',
    },
    {
      level: 'info',
      source: 'system',
      message: `${processes.length} running process${processes.length === 1 ? '' : 'es'}, ${ports.length} detected port${
        ports.length === 1 ? '' : 's'
      }`,
      timestamp: new Date().toISOString(),
      context: 'runtime',
    },
  ];

  if (ideStateSaveCount > 0) {
    base.push({
      level: 'warn',
      source: 'system',
      message: `${ideStateSaveCount} ide_state.save event${ideStateSaveCount === 1 ? '' : 's'} collapsed to keep logs readable`,
      timestamp: new Date().toISOString(),
      context: 'audit',
    });
  }

  return [
    ...base,
    ...activity.slice(0, 80).map((event: any) => ({
      level: classifyLogLevel(event.action ?? ''),
      source: 'system',
      message: event.action ?? 'project event',
      timestamp: event.createdAt,
      context: event.actorUserId ?? event.resourceType ?? 'activity',
    })),
  ];
}

function filterLogEntries(logs: any[], level: string, query: string, regexEnabled: boolean) {
  const trimmed = query.trim();

  return logs.filter((entry: any) => {
    if (level !== 'all' && entry.level !== level) {
      return false;
    }

    if (!trimmed) {
      return true;
    }

    const haystack = `${entry.message ?? ''} ${entry.context ?? ''}`;

    if (regexEnabled) {
      try {
        return new RegExp(trimmed, 'i').test(haystack);
      } catch {
        return false;
      }
    }

    return haystack.toLowerCase().includes(trimmed.toLowerCase());
  });
}

function classifyLogLevel(line: string) {
  if (/\b(error|failed|exception|traceback|panic|fatal)\b/i.test(line)) {
    return 'error';
  }

  if (/\b(warn|warning|deprecated|retry)\b/i.test(line)) {
    return 'warn';
  }

  return 'info';
}

function formatLogTime(value?: string) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return '--:--:--';
  }

  return date.toLocaleTimeString();
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
  const changedFiles = status.fileStatuses ?? status.changedFiles?.map((path: string) => ({ path, status: 'M' })) ?? [];
  const conflicts = status.conflicts ?? [];
  const branches = data.branches ?? [];
  const commits = data.commits ?? [];
  const stashes = data.stashes ?? [];
  const selectedFile = useStore(workbenchStore.selectedFile);
  const [inspectFile, setInspectFile] = useState(selectedFile ?? changedFiles[0]?.path ?? '');

  const [inspection, setInspection] = useState<{ loading: boolean; blame: any[]; diff: string; error?: string }>({
    loading: false,
    blame: data.blame ?? [],
    diff: data.diff ?? '',
  });

  const [staged, setStaged] = useState<Set<string>>(new Set());
  const stagedFiles = Array.from(staged);
  const hasRemote = Boolean(project.gitRepositoryUrl);

  async function loadInspection(filePath = inspectFile) {
    if (!filePath) {
      return;
    }

    setInspection((current) => ({ ...current, loading: true, error: undefined }));

    try {
      const params = new URLSearchParams({ blameFile: filePath, diffFile: filePath });

      const response = await fetch(`/api/projects/${project.id}/ide-panel/git?${params.toString()}`, {
        headers: { accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Git inspection failed with ${response.status}`);
      }

      const envelope = (await response.json()) as any;
      const payload = envelope.data ?? {};

      setInspection({ loading: false, blame: payload.blame ?? [], diff: payload.diff ?? '' });
    } catch (error: any) {
      setInspection({
        loading: false,
        blame: [],
        diff: '',
        error: error?.message ?? 'Unable to load blame and diff data.',
      });
    }
  }

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
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
            Workspace repository
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-sm text-bolt-elements-textSecondary">
            <strong className="truncate text-bolt-elements-textPrimary">{branch}</strong>
            <span>{status.ahead ?? 0} ahead</span>
            <span>{status.behind ?? 0} behind</span>
            <span>{changedFiles.length} changed</span>
            {conflicts.length ? <span className="text-red-500">{conflicts.length} conflicts</span> : null}
          </div>
        </div>
        <form onSubmit={onSubmit} className="flex min-w-[220px] gap-2">
          <input name="intent" value="checkout-branch" type="hidden" />
          <label className="sr-only" htmlFor="ide-git-branch-switch">
            Switch branch
          </label>
          <select
            id="ide-git-branch-switch"
            name="branch"
            defaultValue={branch}
            className="h-9 min-w-0 flex-1 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
          >
            {[branch, ...branches.filter((item: string) => item !== branch)].map((item: string) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <PanelButton disabled={busy} variant="outline">
            Switch
          </PanelButton>
        </form>
      </div>

      {!hasRemote && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <span className="text-amber-600 dark:text-amber-300">
            No remote configured for this workspace repository.
          </span>
          <a
            href={`/projects/${project.id}/settings`}
            className="rounded-md border border-amber-500/40 px-3 py-1.5 font-semibold text-amber-700 hover:bg-amber-500/15 dark:text-amber-200"
          >
            Connect GitHub
          </a>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="grid gap-4">
          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Working tree</h3>
              <span className="text-xs text-bolt-elements-textSecondary">Click a file to preview its diff</span>
            </div>
            {changedFiles.length ? (
              changedFiles.map((file: any) => {
                const path = String(file.path ?? file);
                return (
                  <label
                    key={path}
                    className="mb-2 flex items-center gap-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm last:mb-0"
                  >
                    <input
                      type="checkbox"
                      aria-label={`Stage ${path}`}
                      checked={staged.has(path)}
                      onChange={() => toggleFile(path)}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-bolt-elements-textPrimary hover:text-bolt-elements-item-contentAccent"
                      onClick={() => {
                        setInspectFile(path);
                        loadInspection(path);
                      }}
                    >
                      {path}
                    </button>
                    <span className="rounded bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs text-bolt-elements-textSecondary">
                      {String(file.status ?? 'M')}
                    </span>
                    <span className="text-xs font-semibold text-bolt-elements-item-contentAccent">
                      {staged.has(path) ? 'Staged' : 'Stage'}
                    </span>
                  </label>
                );
              })
            ) : (
              <div className="bolt-project-empty-panel">No changed files.</div>
            )}
          </div>

          {conflicts.length > 0 && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
              <h3 className="mb-3 text-sm font-semibold text-red-500">Conflict resolution</h3>
              <div className="grid gap-2">
                {conflicts.map((conflict: any) => {
                  const path = String(conflict.path ?? conflict);

                  return (
                    <div
                      key={path}
                      className="grid gap-2 rounded-md border border-red-500/30 bg-bolt-elements-background-depth-1 p-3"
                    >
                      <div className="text-sm font-medium text-bolt-elements-textPrimary">{path}</div>
                      <div className="flex flex-wrap gap-2">
                        <form onSubmit={onSubmit}>
                          <input name="intent" value="resolve-conflict" type="hidden" />
                          <input name="filePath" value={path} type="hidden" />
                          <input name="strategy" value="ours" type="hidden" />
                          <PanelButton disabled={busy} variant="outline">
                            Keep current
                          </PanelButton>
                        </form>
                        <form onSubmit={onSubmit}>
                          <input name="intent" value="resolve-conflict" type="hidden" />
                          <input name="filePath" value={path} type="hidden" />
                          <input name="strategy" value="theirs" type="hidden" />
                          <PanelButton disabled={busy} variant="outline">
                            Keep incoming
                          </PanelButton>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
            <h3 className="mb-3 text-sm font-semibold text-bolt-elements-textPrimary">Commit graph</h3>
            {commits.length ? (
              <div className="grid gap-2">
                {commits.map((commit: any, index: number) => (
                  <div
                    key={commit.sha}
                    className="grid grid-cols-[20px_76px_minmax(0,1fr)] gap-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm"
                  >
                    <div className="relative flex justify-center">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-bolt-elements-item-contentAccent" />
                      {index < commits.length - 1 && (
                        <span className="absolute top-4 h-8 w-px bg-bolt-elements-borderColor" />
                      )}
                    </div>
                    <code className="text-xs text-bolt-elements-textSecondary">{commit.shortSha}</code>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-bolt-elements-textPrimary">{commit.message}</div>
                      <div className="truncate text-xs text-bolt-elements-textSecondary">
                        {timeAgo(commit.date)} {commit.refs ? `- ${commit.refs}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bolt-project-empty-panel">No commits yet. Make your first commit.</div>
            )}
          </div>

          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
            <div className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
              <label className="grid gap-1 text-xs font-medium text-bolt-elements-textSecondary">
                Blame and diff file
                <PanelInput
                  value={inspectFile}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => setInspectFile(event.target.value)}
                  placeholder="src/App.tsx"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
                  onClick={() => loadInspection()}
                  disabled={!inspectFile || inspection.loading}
                >
                  {inspection.loading ? 'Loading...' : 'Load blame'}
                </button>
              </div>
            </div>
            {inspection.error && (
              <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
                {inspection.error}
              </div>
            )}
            {inspection.diff ? (
              <pre className="mb-3 max-h-56 overflow-auto rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 text-xs text-bolt-elements-textPrimary">
                {inspection.diff}
              </pre>
            ) : null}
            {inspection.blame.length ? (
              <div className="max-h-64 overflow-auto rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
                {inspection.blame.slice(0, 80).map((line: any) => (
                  <div
                    key={`${line.sha}-${line.line}`}
                    className="grid grid-cols-[48px_92px_110px_minmax(0,1fr)] gap-2 border-b border-bolt-elements-borderColor px-3 py-1.5 text-xs last:border-b-0"
                  >
                    <span className="text-bolt-elements-textSecondary">{line.line}</span>
                    <code className="truncate text-bolt-elements-textSecondary">{String(line.sha).slice(0, 8)}</code>
                    <span className="truncate text-bolt-elements-textSecondary">{line.author}</span>
                    <code className="truncate text-bolt-elements-textPrimary">{line.content}</code>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bolt-project-empty-panel">
                Select a changed file or enter a path to load inline blame.
              </div>
            )}
          </div>
        </section>

        <aside className="grid content-start gap-3">
          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
            <h3 className="mb-3 text-sm font-semibold text-bolt-elements-textPrimary">Staged</h3>
            {stagedFiles.length ? (
              <PanelRows rows={stagedFiles.map((file) => [file, 'Ready for commit'])} />
            ) : (
              <div className="bolt-project-empty-panel">Select files above to stage changes.</div>
            )}
          </div>

          <form
            onSubmit={onSubmit}
            className="grid gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
          >
            <input name="intent" value="commit" type="hidden" />
            <input name="stagedFiles" value={stagedFiles.join(',')} type="hidden" />
            <label className="grid gap-1 text-xs font-medium text-bolt-elements-textSecondary">
              Commit message
              <textarea
                name="message"
                className="min-h-24 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
                placeholder={stagedFiles.length ? `Commit ${stagedFiles.length} staged files` : 'Commit message'}
              />
            </label>
            <PanelButton disabled={busy || changedFiles.length === 0}>Commit changes</PanelButton>
          </form>

          {['pull', 'push'].map((intent) => (
            <form key={intent} onSubmit={onSubmit} className="flex gap-2">
              <input name="intent" value={intent} type="hidden" />
              <label className="sr-only" htmlFor={`git-${intent}-branch`}>
                Remote branch for {intent}
              </label>
              <PanelInput id={`git-${intent}-branch`} name="branch" defaultValue={branch} />
              <PanelButton disabled={busy} variant="outline">
                {intent === 'pull' ? 'Pull' : 'Push'}
              </PanelButton>
            </form>
          ))}

          <details className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-bolt-elements-textPrimary">
              Branch actions
            </summary>
            <div className="mt-3 grid gap-3">
              <form onSubmit={onSubmit} className="grid gap-2">
                <input name="intent" value="create-branch" type="hidden" />
                <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="ide-git-new-branch">
                  Create branch
                </label>
                <PanelInput id="ide-git-new-branch" name="branch" placeholder="feature/billing-flow" required />
                <PanelInput name="startPoint" defaultValue={branch} aria-label="Start point" />
                <PanelButton disabled={busy} variant="outline">
                  Create and switch
                </PanelButton>
              </form>

              <form onSubmit={onSubmit} className="grid gap-2">
                <input name="intent" value="stash" type="hidden" />
                <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="ide-git-stash-message">
                  Stash message
                </label>
                <PanelInput id="ide-git-stash-message" name="message" placeholder="WIP before rebase" />
                <PanelButton disabled={busy || changedFiles.length === 0} variant="outline">
                  Stash changes
                </PanelButton>
              </form>
            </div>
          </details>

          {stashes.length ? (
            <div className="grid gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
              <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Stashes</h3>
              {stashes.map((stash: any) => (
                <div
                  key={stash.id}
                  className="grid gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-2"
                >
                  <div className="text-xs font-semibold text-bolt-elements-textPrimary">{stash.id}</div>
                  <div className="text-xs text-bolt-elements-textSecondary">{stash.message}</div>
                  <div className="flex gap-2">
                    <form onSubmit={onSubmit}>
                      <input name="intent" value="apply-stash" type="hidden" />
                      <input name="stashRef" value={stash.id} type="hidden" />
                      <PanelButton disabled={busy} variant="outline">
                        Apply
                      </PanelButton>
                    </form>
                    <form onSubmit={onSubmit}>
                      <input name="intent" value="pop-stash" type="hidden" />
                      <input name="stashRef" value={stash.id} type="hidden" />
                      <PanelButton disabled={busy} variant="outline">
                        Pop
                      </PanelButton>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <form
            onSubmit={onSubmit}
            className="grid gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
          >
            <input name="intent" value="cherry-pick" type="hidden" />
            <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="ide-git-cherry-pick">
              Cherry-pick SHA
            </label>
            <PanelInput id="ide-git-cherry-pick" name="sha" placeholder="abc1234" required />
            <PanelButton disabled={busy} variant="outline">
              Cherry-pick
            </PanelButton>
          </form>

          <form
            onSubmit={onSubmit}
            className="grid gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
          >
            <input name="intent" value="pr" type="hidden" />
            <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="ide-git-pr-title">
              Pull request title
            </label>
            <PanelInput id="ide-git-pr-title" name="title" placeholder="Project update" />
            <div className="grid grid-cols-2 gap-2">
              <PanelInput name="sourceBranch" defaultValue={branch} aria-label="Source branch" />
              <PanelInput name="targetBranch" defaultValue="main" aria-label="Target branch" />
            </div>
            <textarea
              name="body"
              className="min-h-20 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
              placeholder="Summary, tests, rollout notes"
              aria-label="Pull request description"
            />
            <PanelButton disabled={busy || !project.gitRepositoryUrl} variant="outline">
              Create GitHub PR
            </PanelButton>
            {!project.gitRepositoryUrl && (
              <p className="text-xs text-bolt-elements-textSecondary">
                Configure a GitHub remote before creating a pull request. GitLab MR provider is not configured in this
                backend.
              </p>
            )}
          </form>
        </aside>
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
    debugger: 'Debugger',
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
    debugger: 'i-ph:bug',
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

/*
 * Threshold (in px) the user has to be away from the bottom of the conversation
 * before the "Go to last message" control fades in. Keeping it well above the
 * patch-review card height (~200px) prevents the button from flickering when
 * content streams in and the layout settles.
 */
const SCROLL_TO_BOTTOM_THRESHOLD = 240;

function ScrollToBottom() {
  const { isAtBottom, scrollToBottom, state } = useStickToBottomContext();
  const shouldShowScrollControl = !isAtBottom && state.scrollDifference > SCROLL_TO_BOTTOM_THRESHOLD;

  if (!shouldShowScrollControl) {
    return null;
  }

  return (
    <>
      <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-bolt-elements-background-depth-1 to-transparent h-20 z-10" />
      <button
        type="button"
        aria-label="Scroll to the latest message"
        className="sticky z-50 bottom-0 left-0 right-0 text-4xl rounded-lg px-1.5 py-0.5 flex items-center justify-center mx-auto gap-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor text-bolt-elements-textPrimary text-sm shadow-sm"
        onClick={() => scrollToBottom()}
      >
        Go to last message
        <span className="i-ph:arrow-down animate-bounce" />
      </button>
    </>
  );
}
