import { AtSign, Bot, CheckCircle2, GitBranch, Languages, Share2, SlashSquare, Users, Wand2 } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

/*
 * Inline SVG mockups. Each renders an approximation of the real UI so the
 * walkthrough is meaningful even before someone uploads a real PNG. They
 * use the same SCSS tokens as the IDE so they pick up the active theme.
 * Replace by swapping the body of each *Preview function for an <img> tag
 * pointing at /public/marketing/agent-<id>.png.
 */
function MentionsPreview() {
  return (
    <svg viewBox="0 0 360 220" role="img" aria-label="@-mentions palette mockup" className="bolt-feature-doc-svg">
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
        @app
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
        App.tsx
      </text>
      <text x="100" y="60" fill="var(--vc-ide-text-secondary)" fontSize="11" fontFamily="ui-monospace, monospace">
        src/App.tsx
      </text>
      <text x="40" y="86" fill="var(--vc-ide-text-primary)" fontSize="12" fontWeight="500">
        AppShell.tsx
      </text>
      <text x="118" y="86" fill="var(--vc-ide-text-secondary)" fontSize="11" fontFamily="ui-monospace, monospace">
        src/components/AppShell.tsx
      </text>
      <text x="40" y="108" fill="var(--vc-ide-text-primary)" fontSize="12" fontWeight="500">
        useApp.ts
      </text>
      <text x="100" y="108" fill="var(--vc-ide-text-secondary)" fontSize="11" fontFamily="ui-monospace, monospace">
        src/hooks/useApp.ts
      </text>
      <text x="40" y="130" fill="var(--vc-ide-text-primary)" fontSize="12" fontWeight="500">
        app.config.ts
      </text>
      <text x="108" y="130" fill="var(--vc-ide-text-secondary)" fontSize="11" fontFamily="ui-monospace, monospace">
        ./app.config.ts
      </text>
    </svg>
  );
}

function SlashCommandsPreview() {
  return (
    <svg viewBox="0 0 360 240" role="img" aria-label="Slash commands palette mockup" className="bolt-feature-doc-svg">
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
      {(
        [
          ['/run', 'Run shell command', 'Output streams to terminal'],
          ['/snapshot', 'Create project snapshot', 'POST /snapshots'],
          ['/diff', 'Show diff for file', 'Switches workbench view'],
          ['/open', 'Open file in editor', 'Code view + select'],
          ['/preview-error', 'Fix last preview error', 'Pre-fill the prompt'],
        ] as const
      ).map(([cmd, label, hint], idx) => (
        <g key={cmd}>
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
            {cmd}
          </text>
          <text x="100" y={47 + idx * 26} fill="var(--vc-ide-text-primary)" fontSize="11" fontWeight="500">
            {label}
          </text>
          <text x="100" y={47 + idx * 26 + 9} fill="var(--vc-ide-text-secondary)" fontSize="9">
            {hint}
          </text>
        </g>
      ))}
    </svg>
  );
}

function PlanChecklistPreview() {
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label="Plan checklist mockup" className="bolt-feature-doc-svg">
      <rect x="0" y="0" width="360" height="230" rx="12" fill="var(--vc-ide-bg-elevated)" />
      <text x="20" y="32" fill="var(--vc-ide-text-primary)" fontSize="13" fontWeight="600">
        Plan
      </text>
      <text x="20" y="50" fill="var(--vc-ide-text-secondary)" fontSize="11">
        4 of 5 done · 1 running
      </text>
      <rect x="20" y="60" width="320" height="6" rx="3" fill="var(--vc-ide-bg-hover)" />
      <rect x="20" y="60" width="256" height="6" rx="3" fill="var(--vc-ide-accent-action, #3b82f6)" />
      {(
        [
          ['done', 'Sketch the data model'],
          ['done', 'Generate Prisma schema'],
          ['done', 'Add API route'],
          ['done', 'Wire React form'],
          ['in_progress', 'Write integration test'],
        ] as const
      ).map(([state, label], idx) => (
        <g key={label} transform={`translate(20 ${82 + idx * 28})`}>
          <rect
            x="0"
            y="0"
            width="14"
            height="14"
            rx="3"
            fill={state === 'done' ? 'var(--vc-ide-accent-action, #3b82f6)' : 'transparent'}
            stroke="var(--vc-ide-border-subtle)"
          />
          {state === 'done' ? (
            <path d="M3 7 L6 10 L11 4" stroke="white" strokeWidth="1.5" fill="none" />
          ) : (
            <circle cx="7" cy="7" r="2" fill="var(--vc-ide-accent-action, #3b82f6)" />
          )}
          <text
            x="24"
            y="11"
            fill={state === 'done' ? 'var(--vc-ide-text-secondary)' : 'var(--vc-ide-text-primary)'}
            fontSize="12"
            textDecoration={state === 'done' ? 'line-through' : 'none'}
          >
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function PatchReviewPreview() {
  return (
    <svg viewBox="0 0 360 240" role="img" aria-label="Patch review panel mockup" className="bolt-feature-doc-svg">
      <rect x="0" y="0" width="360" height="240" rx="12" fill="var(--vc-ide-bg-elevated)" />
      <rect x="20" y="20" width="320" height="36" rx="8" fill="var(--vc-ide-bg-base)" />
      <text x="32" y="42" fill="var(--vc-ide-text-primary)" fontSize="12" fontWeight="600">
        Files changed
      </text>
      <text x="124" y="42" fill="var(--vc-ide-text-secondary)" fontSize="11">
        3 files · +48 −12
      </text>
      <rect x="252" y="28" width="76" height="20" rx="4" fill="var(--vc-ide-accent-action, #3b82f6)" />
      <text x="290" y="42" fill="white" fontSize="11" fontWeight="600" textAnchor="middle">
        Apply all
      </text>
      <rect x="20" y="68" width="320" height="68" rx="8" fill="var(--vc-ide-bg-base)" />
      <text x="32" y="86" fill="var(--vc-ide-text-primary)" fontSize="11" fontFamily="ui-monospace, monospace">
        app/routes/projects.tsx
      </text>
      <text x="32" y="104" fill="var(--vc-ide-text-secondary)" fontSize="11" fontFamily="ui-monospace, monospace">
        + return new Response(JSON.stringify(rows));
      </text>
      <text x="32" y="120" fill="var(--vc-ide-text-secondary)" fontSize="11" fontFamily="ui-monospace, monospace">
        − return json(rows);
      </text>
      <rect x="22" y="146" width="62" height="22" rx="4" fill="var(--vc-ide-accent-action, #3b82f6)" />
      <text x="53" y="161" fill="white" fontSize="11" fontWeight="600" textAnchor="middle">
        Accept
      </text>
      <rect x="92" y="150" width="62" height="22" rx="4" stroke="var(--vc-ide-border-subtle)" fill="transparent" />
      <text x="123" y="165" fill="var(--vc-ide-text-primary)" fontSize="11" textAnchor="middle">
        Reject
      </text>
    </svg>
  );
}

function BranchesPreview() {
  return (
    <svg viewBox="0 0 360 220" role="img" aria-label="Branches dropdown mockup" className="bolt-feature-doc-svg">
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
        ⌥ branches
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
      {(
        [
          ['Live thread', '12', true],
          ['Dark mode exp', '8', false],
          ['Refactor router', '24', false],
        ] as const
      ).map(([label, count, active], idx) => (
        <g key={label} transform={`translate(168 ${64 + idx * 38})`}>
          <rect width="164" height="32" rx="6" fill={active ? 'rgba(59,130,246,0.12)' : 'transparent'} />
          <text x="14" y="20" fill="var(--vc-ide-text-primary)" fontSize="12" fontWeight={active ? '600' : '400'}>
            {label}
          </text>
          <text x="140" y="20" fill="var(--vc-ide-text-secondary)" fontSize="11" textAnchor="end">
            {count}
          </text>
        </g>
      ))}
    </svg>
  );
}

function ShareLinkPreview() {
  return (
    <svg viewBox="0 0 360 200" role="img" aria-label="Share link toast mockup" className="bolt-feature-doc-svg">
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
        https://vibecore.app/share/aZk4…u2
      </text>
      <rect x="252" y="50" width="76" height="30" rx="6" fill="var(--vc-ide-accent-action, #3b82f6)" />
      <text x="290" y="69" fill="white" fontSize="12" fontWeight="600" textAnchor="middle">
        Copy
      </text>
      <rect x="20" y="120" width="320" height="50" rx="8" fill="rgba(34,197,94,0.12)" stroke="rgba(34,197,94,0.4)" />
      <text x="32" y="142" fill="var(--vc-ide-text-primary)" fontSize="12" fontWeight="600">
        Conversation link copied
      </text>
      <text x="32" y="160" fill="var(--vc-ide-text-secondary)" fontSize="11">
        Anyone with the link can view this thread (read-only).
      </text>
    </svg>
  );
}

function PresencePreview() {
  return (
    <svg viewBox="0 0 360 180" role="img" aria-label="Presence avatars mockup" className="bolt-feature-doc-svg">
      <rect x="0" y="0" width="360" height="180" rx="12" fill="var(--vc-ide-bg-elevated)" />
      <text x="20" y="36" fill="var(--vc-ide-text-primary)" fontSize="13" fontWeight="600">
        Demo project — chat
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
        AV is typing… · MC viewing src/App.tsx · JD viewing src/components/Header.tsx
      </text>
    </svg>
  );
}

function I18nPreview() {
  return (
    <svg viewBox="0 0 360 200" role="img" aria-label="i18n mockup" className="bolt-feature-doc-svg">
      <rect x="0" y="0" width="360" height="200" rx="12" fill="var(--vc-ide-bg-elevated)" />
      <text x="20" y="36" fill="var(--vc-ide-text-primary)" fontSize="13" fontWeight="600">
        Switch language
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
        localStorage.setItem('vibecore:user-language', 'fr');
      </text>
      <text x="32" y="98" fill="var(--vc-ide-text-secondary)" fontSize="11">
        Reload — labels switch to French immediately.
      </text>
      <text x="20" y="138" fill="var(--vc-ide-text-primary)" fontSize="12" fontWeight="500">
        EN → "Files changed"
      </text>
      <text x="20" y="160" fill="var(--vc-ide-text-primary)" fontSize="12" fontWeight="500">
        FR → "Fichiers modifiés"
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
  steps: WalkthroughStep[];
  preview: ReactNode;
  notes?: ReactNode;
}

const WALKTHROUGH_SECTIONS: WalkthroughEntry[] = [
  {
    id: 'mentions',
    icon: AtSign,
    title: '@ file mentions',
    tagline: 'Reference any project file from the composer without leaving the keyboard.',
    why: 'Typing the path manually is slow and error-prone. The mentions palette opens automatically when you type @, fuzzy-matches across the whole workspace, and remembers the files you mention most often.',
    steps: [
      { label: 'Type @ in the composer', detail: 'The palette opens anchored above the textarea. No mouse needed.' },
      { label: 'Filter with letters', detail: 'Fuzzy match across path + basename. Recent picks float to the top.' },
      {
        label: 'Press Enter / Tab',
        detail: 'Inserts @src/path.tsx in your prompt; the agent backend parses it as a file context attachment.',
      },
    ],
    preview: <MentionsPreview />,
  },
  {
    id: 'slash',
    icon: SlashSquare,
    title: '/ slash commands',
    tagline: 'Eleven built-in quick actions, no documentation lookup required.',
    why: 'Common workflows (snapshot the repo, open a file diff, run a shell command, fix the last preview error) should be one keystroke away. The slash palette mirrors VS Code / Replit conventions.',
    steps: [
      {
        label: 'Type / at the start of the prompt',
        detail: 'Palette opens with all 11 commands. Typing more characters filters down.',
      },
      {
        label: 'Pick the command',
        detail:
          'Built-ins include /build /clear /discuss /diff /file /help /open /plan /preview-error /run /snapshot. Press Enter to execute.',
      },
      {
        label: 'Frequent commands rise to the top',
        detail: 'Most-recently-used commands earn a boost in the ranking so they stay one keystroke away.',
      },
    ],
    preview: <SlashCommandsPreview />,
    notes: (
      <p>
        <strong>Standalone E-Code safety:</strong> commands that need a project context (/snapshot, /run,
        /preview-error) no-op gracefully when the user is not in a project IDE.
      </p>
    ),
  },
  {
    id: 'plan',
    icon: Bot,
    title: 'Plan-first checklist',
    tagline: "See the agent's intent before any file lands.",
    why: "For larger changes the agent emits an actionable checklist (Markdown task list) before touching files. The checklist renders as a live progress widget so you can see what's done, in flight or failing without scrolling through walls of text.",
    steps: [
      { label: 'Toggle Plan', detail: 'Use the compact Plan button in the composer toolbar, or type /plan.' },
      {
        label: 'Send your request',
        detail: 'The agent emits a `- [ ] step` list which is parsed and rendered as a checklist.',
      },
      {
        label: 'Watch the bar fill',
        detail: 'Items flip done / in-progress / failed as the agent reports back, with strikethrough on completion.',
      },
    ],
    preview: <PlanChecklistPreview />,
  },
  {
    id: 'patch-review',
    icon: Wand2,
    title: 'Auto-apply & patch recovery',
    tagline: 'Successful patches apply immediately; failed validation stays reviewable.',
    why: 'Auto-apply is always enabled for successful patches, matching the fast Replit / Cursor default. Validation failures stay visible in review surfaces with retry, reject and recovery affordances instead of being hidden.',
    steps: [
      {
        label: 'Check policy',
        detail: 'Agent settings show auto-apply as enabled and read-only so the behaviour is predictable.',
      },
      {
        label: 'Recover failures',
        detail: 'Failed validation remains in review with retry and reject actions instead of silently disappearing.',
      },
      {
        label: 'Undo fast',
        detail: 'Successful writes still surface the coalesced Undo toast for quick rollback.',
      },
    ],
    preview: <PatchReviewPreview />,
    notes: (
      <p>
        <strong>Auto-apply enabled?</strong> The review panel is hidden for successful writes; failed validation remains
        visible so users can recover deliberately.
      </p>
    ),
  },
  {
    id: 'branches',
    icon: GitBranch,
    title: 'Conversation branches',
    tagline: 'Fork a conversation at any message — keep variants side-by-side.',
    why: 'Long agent sessions branch naturally: you try an approach, decide to back up, try another. Branches archive the prior thread without losing it. The dropdown lets you switch, rename or delete each branch from the header.',
    steps: [
      {
        label: 'Branches accumulate automatically',
        detail: 'Each "New chat" archives the previous thread as a branch.',
      },
      {
        label: 'Switch from the header dropdown',
        detail: 'The git-branch icon next to the theme switch opens the list with one click per branch.',
      },
      {
        label: 'Rename or delete',
        detail: 'Hover a branch row to reveal Rename + Delete; deletion removes the branch and any sub-branches.',
      },
    ],
    preview: <BranchesPreview />,
  },
  {
    id: 'share',
    icon: Share2,
    title: 'Share read-only conversations',
    tagline: 'Copy a link that anyone can open.',
    why: 'Pairing on a bug, asking for design feedback or onboarding a new teammate is faster when you can paste a URL to the conversation. The share link bundles the conversation snapshot client-side; an opt-in server signing step is on the roadmap for ACL-gated shares.',
    steps: [
      {
        label: 'Click the Share icon',
        detail: 'Located in the agent header next to the theme switch. Disabled when there are no messages yet.',
      },
      {
        label: 'Link copied automatically',
        detail: 'A clipboard toast confirms. The link opens at /share/<token>.',
      },
      {
        label: 'Receivers see the full thread',
        detail: 'Inline message bodies up to 32 KB are embedded — no server fetch required for v1.',
      },
    ],
    preview: <ShareLinkPreview />,
  },
  {
    id: 'presence',
    icon: Users,
    title: 'Live presence',
    tagline: 'See who else is in the project, at a glance.',
    why: 'Collaboration only feels real when you can see the other people. The presence avatars in the header show online sessions with status hints (viewing, typing, idle); the collaborators tab still hosts the full panel for fine-grained controls.',
    steps: [
      { label: 'Open the project in two browsers', detail: 'A normal + incognito window, or invite a teammate.' },
      {
        label: 'Avatars stack in the header',
        detail: 'Up to 3 visible, then a `+N` overflow chip. Hover for the name + status.',
      },
      {
        label: 'Typing indicator',
        detail: 'A subtle dot appears on the avatar when a collaborator is composing a message.',
      },
    ],
    preview: <PresencePreview />,
  },
  {
    id: 'i18n',
    icon: Languages,
    title: 'French / English UI',
    tagline: 'The agent panel speaks two languages out of the box.',
    why: 'The seed dictionary ships full English + French translations for every Agent-panel surface. New languages slot in as additional bundles without code changes.',
    steps: [
      {
        label: 'Detect or override',
        detail:
          'Browser navigator.language is honoured by default. Override with localStorage `vibecore:user-language`.',
      },
      {
        label: 'Reload to apply',
        detail: 'A persistent preference column on the User model is on the roadmap for cross-device sync.',
      },
      {
        label: 'Translation gaps fall back to English',
        detail: 'Untranslated keys render the English seed so partial coverage never crashes the UI.',
      },
    ],
    preview: <I18nPreview />,
  },
];

export const AGENT_WALKTHROUGH_NAV: { id: string; label: string }[] = WALKTHROUGH_SECTIONS.map(({ id, title }) => ({
  id: `agent-${id}`,
  label: title,
}));

const PREREQUISITES = [
  {
    title: 'Sign in to your E-Code workspace',
    detail: 'Free accounts get a workspace immediately; enterprise SSO is available for admins.',
  },
  {
    title: 'Open or create a project',
    detail: 'Pick a template (React, Remix, Node, Python) or import an existing repo to spin up the IDE.',
  },
  {
    title: 'Know the patch policy',
    detail: 'Auto-apply is always enabled for successful patches; failed validation remains reviewable.',
  },
];

interface FeatureSectionProps {
  entry: WalkthroughEntry;
}

function FeatureSection({ entry }: FeatureSectionProps) {
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
          {entry.notes ? <div className="bolt-feature-doc-notes">{entry.notes}</div> : null}
        </div>
        <figure className="bolt-feature-doc-preview" aria-label={`${entry.title} preview`}>
          {entry.preview}
          <figcaption className="bolt-feature-doc-caption">
            UI mockup — replace with a real screenshot in <code>/public/marketing/agent-{entry.id}.png</code> once
            captured.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

export function AgentWalkthrough() {
  return (
    <div id="agent-walkthrough" className="bolt-feature-doc-walkthrough">
      <header className="bolt-feature-doc-walkthrough-head">
        <h2 className="text-2xl font-semibold tracking-normal text-bolt-elements-textPrimary">
          Agent panel walkthrough
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-bolt-elements-textSecondary">
          A feature-by-feature tour of the IDE agent: the keystroke you actually press, what happens behind it, and a UI
          mockup for each surface. Jump straight to a section using the links below.
        </p>
      </header>
      <nav className="bolt-feature-doc-anchors" aria-label="Agent feature sections">
        {AGENT_WALKTHROUGH_NAV.map(({ id, label }) => (
          <a key={id} href={`#${id}`} className="bolt-feature-doc-anchor">
            {label}
          </a>
        ))}
      </nav>
      <aside className="bolt-feature-doc-prereqs" aria-label="Prerequisites">
        <h3 className="text-base font-semibold text-bolt-elements-textPrimary">Before you start</h3>
        <ul>
          {PREREQUISITES.map(({ title, detail }) => (
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
      {WALKTHROUGH_SECTIONS.map((entry) => (
        <FeatureSection key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
