import { AtSign, Bot, CheckCircle2, GitBranch, Languages, Share2, SlashSquare, Users, Wand2 } from 'lucide-react';
import type { ComponentType, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import {
  agentWalkthroughEn,
  getAgentWalkthroughCopy,
  type AgentWalkthroughCopy,
} from '~/lib/i18n/catalogs/agent-walkthrough';

const MENTION_FILES = [
  ['App.tsx', 'src/App.tsx'],
  ['AppShell.tsx', 'src/components/AppShell.tsx'],
  ['useApp.ts', 'src/hooks/useApp.ts'],
  ['app.config.ts', './app.config.ts'],
] as const;

const MENTION_QUERY = '@app';

const SLASH_COMMANDS = ['/run', '/snapshot', '/diff', '/open', '/preview-error'] as const;
const PATCH_FILE = 'app/routes/projects.tsx';
const PATCH_ADDITION = '+ return new Response(JSON.stringify(rows));';
const PATCH_REMOVAL = '− return json(rows);';
const SHARE_URL = 'https://vibecore.app/share/aZk4…u2';
const LANGUAGE_STORAGE_EXAMPLE = "localStorage.setItem('vibecore:user-language', 'fr');";

/*
 * Inline SVG mockups. Each renders an approximation of the real UI so the
 * walkthrough is meaningful even before someone uploads a real PNG. They
 * use the same SCSS tokens as the IDE so they pick up the active theme.
 * Replace by swapping the body of each *Preview function for an <img> tag
 * pointing at /public/marketing/agent-<id>.png.
 */
function MentionsPreview({ copy }: { copy: AgentWalkthroughCopy['preview'] }) {
  return (
    <svg viewBox="0 0 360 220" role="img" aria-label={copy.mentionsAria} className="bolt-feature-doc-svg">
      <rect x="0" y="0" width="360" height="220" rx="12" fill="var(--vc-ide-bg-elevated)" />
      <rect
        x="20"
        y="160"
        width="320"
        height="44"
        rx="8"
        fill="var(--vc-ide-bg-base)"
        stroke="var(--vc-ide-border-subtle)"
      />
      <text x="32" y="186" fill="var(--vc-ide-text-secondary)" fontSize="13" fontFamily="ui-monospace, monospace">
        {MENTION_QUERY}
      </text>
      <rect
        x="20"
        y="32"
        width="220"
        height="116"
        rx="10"
        fill="var(--vc-ide-bg-elevated)"
        stroke="var(--vc-ide-border-subtle)"
      />
      <rect x="28" y="42" width="204" height="28" rx="6" fill="var(--vc-ide-bg-hover)" />
      <text x="40" y="60" fill="var(--vc-ide-text-primary)" fontSize="12" fontWeight="600">
        {MENTION_FILES[0][0]}
      </text>
      <text x="100" y="60" fill="var(--vc-ide-text-secondary)" fontSize="11" fontFamily="ui-monospace, monospace">
        {MENTION_FILES[0][1]}
      </text>
      <text x="40" y="86" fill="var(--vc-ide-text-primary)" fontSize="12" fontWeight="500">
        {MENTION_FILES[1][0]}
      </text>
      <text x="118" y="86" fill="var(--vc-ide-text-secondary)" fontSize="11" fontFamily="ui-monospace, monospace">
        {MENTION_FILES[1][1]}
      </text>
      <text x="40" y="108" fill="var(--vc-ide-text-primary)" fontSize="12" fontWeight="500">
        {MENTION_FILES[2][0]}
      </text>
      <text x="100" y="108" fill="var(--vc-ide-text-secondary)" fontSize="11" fontFamily="ui-monospace, monospace">
        {MENTION_FILES[2][1]}
      </text>
      <text x="40" y="130" fill="var(--vc-ide-text-primary)" fontSize="12" fontWeight="500">
        {MENTION_FILES[3][0]}
      </text>
      <text x="108" y="130" fill="var(--vc-ide-text-secondary)" fontSize="11" fontFamily="ui-monospace, monospace">
        {MENTION_FILES[3][1]}
      </text>
    </svg>
  );
}

function SlashCommandsPreview({ copy }: { copy: AgentWalkthroughCopy['preview'] }) {
  return (
    <svg viewBox="0 0 360 240" role="img" aria-label={copy.slashAria} className="bolt-feature-doc-svg">
      <rect x="0" y="0" width="360" height="240" rx="12" fill="var(--vc-ide-bg-elevated)" />
      <rect
        x="20"
        y="180"
        width="320"
        height="44"
        rx="8"
        fill="var(--vc-ide-bg-base)"
        stroke="var(--vc-ide-border-subtle)"
      />
      <text x="32" y="206" fill="var(--vc-ide-text-secondary)" fontSize="13" fontFamily="ui-monospace, monospace">
        /run
      </text>
      <rect
        x="20"
        y="22"
        width="260"
        height="146"
        rx="10"
        fill="var(--vc-ide-bg-elevated)"
        stroke="var(--vc-ide-border-subtle)"
      />
      {SLASH_COMMANDS.map((command, idx) => {
        const item = copy.slashItems[idx];

        if (!item) {
          return null;
        }

        return (
          <g key={command}>
            <rect
              x="28"
              y={32 + idx * 26}
              width="244"
              height="22"
              rx="5"
              fill={idx === 0 ? 'var(--vc-ide-bg-hover)' : 'transparent'}
            />
            <text
              x="40"
              y={47 + idx * 26}
              fill="var(--vc-ide-text-primary)"
              fontSize="11"
              fontWeight="600"
              fontFamily="ui-monospace, monospace"
            >
              {command}
            </text>
            <text x="100" y={47 + idx * 26} fill="var(--vc-ide-text-primary)" fontSize="11" fontWeight="500">
              {item.label}
            </text>
            <text x="100" y={47 + idx * 26 + 9} fill="var(--vc-ide-text-secondary)" fontSize="9">
              {item.hint}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function PlanChecklistPreview({ copy }: { copy: AgentWalkthroughCopy['preview'] }) {
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label={copy.planAria} className="bolt-feature-doc-svg">
      <rect x="0" y="0" width="360" height="230" rx="12" fill="var(--vc-ide-bg-elevated)" />
      <text x="20" y="32" fill="var(--vc-ide-text-primary)" fontSize="13" fontWeight="600">
        {copy.planTitle}
      </text>
      <text x="20" y="50" fill="var(--vc-ide-text-secondary)" fontSize="11">
        {copy.planProgress}
      </text>
      <rect x="20" y="60" width="320" height="6" rx="3" fill="var(--vc-ide-bg-hover)" />
      <rect x="20" y="60" width="256" height="6" rx="3" fill="var(--vc-ide-accent-action, #3b82f6)" />
      {copy.planTasks.map((label, idx) => {
        const done = idx < copy.planTasks.length - 1;

        return (
          <g key={label} transform={`translate(20 ${82 + idx * 28})`}>
            <rect
              x="0"
              y="0"
              width="14"
              height="14"
              rx="3"
              fill={done ? 'var(--vc-ide-accent-action, #3b82f6)' : 'transparent'}
              stroke="var(--vc-ide-border-subtle)"
            />
            {done ? (
              <path d="M3 7 L6 10 L11 4" stroke="white" strokeWidth="1.5" fill="none" />
            ) : (
              <circle cx="7" cy="7" r="2" fill="var(--vc-ide-accent-action, #3b82f6)" />
            )}
            <text
              x="24"
              y="11"
              fill={done ? 'var(--vc-ide-text-secondary)' : 'var(--vc-ide-text-primary)'}
              fontSize="12"
              textDecoration={done ? 'line-through' : 'none'}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function PatchReviewPreview({ copy }: { copy: AgentWalkthroughCopy['preview'] }) {
  return (
    <svg viewBox="0 0 360 240" role="img" aria-label={copy.patchAria} className="bolt-feature-doc-svg">
      <rect x="0" y="0" width="360" height="240" rx="12" fill="var(--vc-ide-bg-elevated)" />
      <rect x="20" y="20" width="320" height="36" rx="8" fill="var(--vc-ide-bg-base)" />
      <text x="32" y="42" fill="var(--vc-ide-text-primary)" fontSize="12" fontWeight="600">
        {copy.patchTitle}
      </text>
      <text x="124" y="42" fill="var(--vc-ide-text-secondary)" fontSize="11">
        {copy.patchStats}
      </text>
      <rect x="252" y="28" width="76" height="20" rx="4" fill="var(--vc-ide-accent-action, #3b82f6)" />
      <text x="290" y="42" fill="white" fontSize="11" fontWeight="600" textAnchor="middle">
        {copy.patchApplyAll}
      </text>
      <rect x="20" y="68" width="320" height="68" rx="8" fill="var(--vc-ide-bg-base)" />
      <text x="32" y="86" fill="var(--vc-ide-text-primary)" fontSize="11" fontFamily="ui-monospace, monospace">
        {PATCH_FILE}
      </text>
      <text x="32" y="104" fill="var(--vc-ide-text-secondary)" fontSize="11" fontFamily="ui-monospace, monospace">
        {PATCH_ADDITION}
      </text>
      <text x="32" y="120" fill="var(--vc-ide-text-secondary)" fontSize="11" fontFamily="ui-monospace, monospace">
        {PATCH_REMOVAL}
      </text>
      <rect x="22" y="146" width="62" height="22" rx="4" fill="var(--vc-ide-accent-action, #3b82f6)" />
      <text x="53" y="161" fill="white" fontSize="11" fontWeight="600" textAnchor="middle">
        {copy.patchAccept}
      </text>
      <rect x="92" y="150" width="62" height="22" rx="4" stroke="var(--vc-ide-border-subtle)" fill="transparent" />
      <text x="123" y="165" fill="var(--vc-ide-text-primary)" fontSize="11" textAnchor="middle">
        {copy.patchReject}
      </text>
    </svg>
  );
}

function BranchesPreview({ copy }: { copy: AgentWalkthroughCopy['preview'] }) {
  return (
    <svg viewBox="0 0 360 220" role="img" aria-label={copy.branchesAria} className="bolt-feature-doc-svg">
      <rect x="0" y="0" width="360" height="220" rx="12" fill="var(--vc-ide-bg-elevated)" />
      <rect
        x="240"
        y="16"
        width="84"
        height="28"
        rx="6"
        fill="var(--vc-ide-bg-hover)"
        stroke="var(--vc-ide-border-subtle)"
      />
      <text x="252" y="34" fill="var(--vc-ide-text-primary)" fontSize="12" fontWeight="500">
        ⌥ {copy.branchesButton}
      </text>
      <text x="312" y="34" fill="var(--vc-ide-text-primary)" fontSize="11" fontWeight="600">
        3
      </text>
      <rect
        x="160"
        y="50"
        width="180"
        height="150"
        rx="10"
        fill="var(--vc-ide-bg-elevated)"
        stroke="var(--vc-ide-border-subtle)"
      />
      {copy.branchNames.map((label, idx) => {
        const count = ['12', '8', '24'][idx] ?? '0';
        const active = idx === 0;

        return (
          <g key={label} transform={`translate(168 ${64 + idx * 38})`}>
            <rect width="164" height="32" rx="6" fill={active ? 'rgba(59,130,246,0.12)' : 'transparent'} />
            <text x="14" y="20" fill="var(--vc-ide-text-primary)" fontSize="12" fontWeight={active ? '600' : '400'}>
              {label}
            </text>
            <text x="140" y="20" fill="var(--vc-ide-text-secondary)" fontSize="11" textAnchor="end">
              {count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ShareLinkPreview({ copy }: { copy: AgentWalkthroughCopy['preview'] }) {
  return (
    <svg viewBox="0 0 360 200" role="img" aria-label={copy.shareAria} className="bolt-feature-doc-svg">
      <rect x="0" y="0" width="360" height="200" rx="12" fill="var(--vc-ide-bg-elevated)" />
      <rect
        x="20"
        y="40"
        width="320"
        height="50"
        rx="8"
        fill="var(--vc-ide-bg-base)"
        stroke="var(--vc-ide-border-subtle)"
      />
      <text x="32" y="62" fill="var(--vc-ide-text-secondary)" fontSize="11" fontFamily="ui-monospace, monospace">
        {SHARE_URL}
      </text>
      <rect x="252" y="50" width="76" height="30" rx="6" fill="var(--vc-ide-accent-action, #3b82f6)" />
      <text x="290" y="69" fill="white" fontSize="12" fontWeight="600" textAnchor="middle">
        {copy.shareCopy}
      </text>
      <rect x="20" y="120" width="320" height="50" rx="8" fill="rgba(34,197,94,0.12)" stroke="rgba(34,197,94,0.4)" />
      <text x="32" y="142" fill="var(--vc-ide-text-primary)" fontSize="12" fontWeight="600">
        {copy.shareCopied}
      </text>
      <text x="32" y="160" fill="var(--vc-ide-text-secondary)" fontSize="11">
        {copy.shareDetail}
      </text>
    </svg>
  );
}

function PresencePreview({ copy }: { copy: AgentWalkthroughCopy['preview'] }) {
  return (
    <svg viewBox="0 0 360 180" role="img" aria-label={copy.presenceAria} className="bolt-feature-doc-svg">
      <rect x="0" y="0" width="360" height="180" rx="12" fill="var(--vc-ide-bg-elevated)" />
      <text x="20" y="36" fill="var(--vc-ide-text-primary)" fontSize="13" fontWeight="600">
        {copy.presenceProject}
      </text>
      <g transform="translate(220 18)">
        {(
          [
            { letters: 'AV', color: 'var(--vc-ide-accent-action, #3b82f6)', typing: true, overflow: false },
            { letters: 'MC', color: '#16a34a', typing: false, overflow: false },
            { letters: 'JD', color: '#14b8a6', typing: false, overflow: false },
            { letters: '+2', color: 'var(--vc-ide-bg-overlay)', typing: false, overflow: true },
          ] as Array<{ letters: string; color: string; typing: boolean; overflow: boolean }>
        ).map((entry, idx) => (
          <g key={entry.letters} transform={`translate(${idx * 22} 0)`}>
            <circle cx="14" cy="14" r="14" fill={entry.color} stroke="var(--vc-ide-bg-elevated)" strokeWidth="2" />
            <text
              x="14"
              y="18"
              fill={entry.overflow ? 'var(--vc-ide-text-secondary)' : 'white'}
              fontSize="10"
              fontWeight="600"
              textAnchor="middle"
            >
              {entry.letters}
            </text>
            {entry.typing ? <circle cx="26" cy="26" r="5" fill="var(--vc-ide-accent-action, #3b82f6)" /> : null}
          </g>
        ))}
      </g>
      <text x="20" y="118" fill="var(--vc-ide-text-secondary)" fontSize="11">
        {copy.presenceActivity}
      </text>
    </svg>
  );
}

function I18nPreview({ copy }: { copy: AgentWalkthroughCopy['preview'] }) {
  return (
    <svg viewBox="0 0 360 200" role="img" aria-label={copy.i18nAria} className="bolt-feature-doc-svg">
      <rect x="0" y="0" width="360" height="200" rx="12" fill="var(--vc-ide-bg-elevated)" />
      <text x="20" y="36" fill="var(--vc-ide-text-primary)" fontSize="13" fontWeight="600">
        {copy.i18nTitle}
      </text>
      <rect
        x="20"
        y="50"
        width="320"
        height="60"
        rx="8"
        fill="var(--vc-ide-bg-base)"
        stroke="var(--vc-ide-border-subtle)"
      />
      <text x="32" y="76" fill="var(--vc-ide-text-secondary)" fontSize="11" fontFamily="ui-monospace, monospace">
        {LANGUAGE_STORAGE_EXAMPLE}
      </text>
      <text x="32" y="98" fill="var(--vc-ide-text-secondary)" fontSize="11">
        {copy.i18nReload}
      </text>
      <text x="20" y="138" fill="var(--vc-ide-text-primary)" fontSize="12" fontWeight="500">
        {copy.i18nExamplePrimary}
      </text>
      <text x="20" y="160" fill="var(--vc-ide-text-primary)" fontSize="12" fontWeight="500">
        {copy.i18nExampleSecondary}
      </text>
    </svg>
  );
}

interface WalkthroughStep {
  label: string;
  detail: string;
}

interface WalkthroughEntry {
  id: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  tagline: string;
  why: string;
  steps: readonly WalkthroughStep[];
  preview: ReactElement;
  notes?: Readonly<{ title: string; body: string }>;
}

function createWalkthroughSections(copy: AgentWalkthroughCopy): WalkthroughEntry[] {
  return [
    {
      id: 'mentions',
      icon: AtSign,
      ...copy.sections.mentions,
      preview: <MentionsPreview copy={copy.preview} />,
    },
    {
      id: 'slash',
      icon: SlashSquare,
      ...copy.sections.slash,
      preview: <SlashCommandsPreview copy={copy.preview} />,
    },
    {
      id: 'plan',
      icon: Bot,
      ...copy.sections.plan,
      preview: <PlanChecklistPreview copy={copy.preview} />,
    },
    {
      id: 'patch-review',
      icon: Wand2,
      ...copy.sections.patchReview,
      preview: <PatchReviewPreview copy={copy.preview} />,
    },
    {
      id: 'branches',
      icon: GitBranch,
      ...copy.sections.branches,
      preview: <BranchesPreview copy={copy.preview} />,
    },
    {
      id: 'share',
      icon: Share2,
      ...copy.sections.share,
      preview: <ShareLinkPreview copy={copy.preview} />,
    },
    {
      id: 'presence',
      icon: Users,
      ...copy.sections.presence,
      preview: <PresencePreview copy={copy.preview} />,
    },
    {
      id: 'i18n',
      icon: Languages,
      ...copy.sections.i18n,
      preview: <I18nPreview copy={copy.preview} />,
    },
  ];
}

export const AGENT_WALKTHROUGH_NAV: { id: string; label: string }[] = createWalkthroughSections(agentWalkthroughEn).map(
  ({ id, title }) => ({
    id: `agent-${id}`,
    label: title,
  }),
);

interface FeatureSectionProps {
  entry: WalkthroughEntry;
  copy: AgentWalkthroughCopy;
}

function FeatureSection({ entry, copy }: FeatureSectionProps) {
  const Icon = entry.icon;

  return (
    <section id={`agent-${entry.id}`} className="bolt-feature-doc-section">
      <div className="bolt-feature-doc-header">
        <span className="bolt-feature-doc-icon" aria-hidden>
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-xl font-semibold text-bolt-elements-textPrimary">{entry.title}</h3>
          <p className="text-sm text-bolt-elements-textSecondary">{entry.tagline}</p>
        </div>
      </div>
      <div className="bolt-feature-doc-grid">
        <div className="bolt-feature-doc-copy">
          <p className="text-sm text-bolt-elements-textSecondary">{entry.why}</p>
          <ol className="bolt-feature-doc-steps">
            {entry.steps.map((step, idx) => (
              <li key={step.label}>
                <span className="bolt-feature-doc-step-index" aria-hidden>
                  {idx + 1}
                </span>
                <div>
                  <strong className="text-bolt-elements-textPrimary">{step.label}</strong>
                  <p className="text-sm text-bolt-elements-textSecondary">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          {entry.notes ? (
            <div className="bolt-feature-doc-notes">
              <p>
                <strong>{entry.notes.title}</strong> {entry.notes.body}
              </p>
            </div>
          ) : null}
        </div>
        <figure className="bolt-feature-doc-preview" aria-label={`${entry.title} ${copy.previewLabel}`}>
          {entry.preview}
          <figcaption className="bolt-feature-doc-caption">
            {copy.captionBeforePath} <code>{`/public/marketing/agent-${entry.id}.png`}</code> {copy.captionAfterPath}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

export function AgentWalkthrough() {
  const { i18n } = useTranslation();
  const copy = getAgentWalkthroughCopy(i18n.resolvedLanguage ?? i18n.language);
  const sections = createWalkthroughSections(copy);
  const navigation = sections.map(({ id, title }) => ({ id: `agent-${id}`, label: title }));

  return (
    <div id="agent-walkthrough" className="bolt-feature-doc-walkthrough">
      <header className="bolt-feature-doc-walkthrough-head">
        <h2 className="text-2xl font-semibold tracking-normal text-bolt-elements-textPrimary">{copy.title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-bolt-elements-textSecondary">{copy.description}</p>
      </header>
      <nav className="bolt-feature-doc-anchors" aria-label={copy.navigationLabel}>
        {navigation.map(({ id, label }) => (
          <a key={id} href={`#${id}`} className="bolt-feature-doc-anchor">
            {label}
          </a>
        ))}
      </nav>
      <aside className="bolt-feature-doc-prereqs" aria-label={copy.prerequisitesLabel}>
        <h3 className="text-base font-semibold text-bolt-elements-textPrimary">{copy.beforeYouStart}</h3>
        <ul>
          {copy.prerequisites.map(({ title, detail }) => (
            <li key={title}>
              <CheckCircle2 className="h-4 w-4 text-bolt-elements-icon-success" aria-hidden />
              <div>
                <strong className="text-bolt-elements-textPrimary">{title}</strong>
                <p className="text-sm text-bolt-elements-textSecondary">{detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </aside>
      {sections.map((entry) => (
        <FeatureSection key={entry.id} entry={entry} copy={copy} />
      ))}
    </div>
  );
}
