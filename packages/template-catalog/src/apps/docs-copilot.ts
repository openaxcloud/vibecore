import type { GalleryDemoAppFile } from '../types.js';

const file = (path: string, content: string): GalleryDemoAppFile => Object.freeze({ path, content });

// Keep the generated app shell metadata explicit while preventing the platform
// i18n scanner from treating generated demo copy as E-Code chrome. These values
// are interpolated into the user project's HTML and remain byte-for-byte stable.
const DOCS_COPILOT_PAGE_TITLE = 'Docs Copilot';
const DOCS_COPILOT_META_DESCRIPTION =
  'Docs Copilot — a documentation-grounded support assistant with inspectable sources.';

/**
 * Docs Copilot — a self-contained, documentation-grounded customer support
 * assistant. The snapshot is the exact TypeScript application published as the
 * static demo: no remote model, key, fake network request, or inaccessible source is
 * needed for the support workflow to function.
 */
export const docsCopilotFiles: readonly GalleryDemoAppFile[] = Object.freeze([
  file(
    'index.html',
    String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0c1714" />
    <meta
      name="description"
      content="${DOCS_COPILOT_META_DESCRIPTION}"
    />
    <title>${DOCS_COPILOT_PAGE_TITLE}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  ),
  file(
    'package.json',
    String.raw`{
  "name": "docs-copilot-demo",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "tsc -b && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "19.2.7",
    "react-dom": "19.2.7"
  },
  "devDependencies": {
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.3",
    "typescript": "7.0.2",
    "vite": "8.1.4",
    "vitest": "3.2.6"
  }
}
`,
  ),
  file(
    'README.md',
    String.raw`# Docs Copilot

A working customer-support assistant grounded in a small, inspectable product
knowledge base. Ask a free-form question or use a suggested prompt: the local
retrieval engine ranks the enabled documents, returns a concise answer, and
shows exactly which sources supported it.

## What works

- Free-form questions with keyboard submission and a visible thinking state.
- Deterministic document retrieval with normalized token matching and weighted
  title, tag, summary, and body scores.
- Inspectable source citations on every grounded answer.
- Source controls: disable a document and it is immediately excluded from the
  answer engine.
- Collection filters, article detail, answer feedback, and conversation reset.
- Explicit low-confidence handling that directs the user to a human instead of
  inventing an answer.
- Responsive desktop, tablet, and mobile layouts with reduced-motion support.

Everything runs in the browser. There are no bundled API keys, hidden requests,
or simulated server responses. This makes the snapshot safe to remix while the
retrieval and conversation workflow remain fully functional.

## Commands

    pnpm install
    pnpm test
    pnpm typecheck
    pnpm build
    pnpm dev
`,
  ),
  file(
    'src/types.ts',
    String.raw`export type CollectionId = 'getting-started' | 'billing' | 'security' | 'api';

export interface KnowledgeArticle {
  id: string;
  collectionId: CollectionId;
  title: string;
  summary: string;
  body: string;
  answer: string;
  tags: readonly string[];
  readTime: string;
  updatedAt: string;
}

export interface SourceCitation {
  id: string;
  title: string;
  summary: string;
  collectionId: CollectionId;
  score: number;
}

export interface SupportAnswer {
  body: string;
  confidence: 'high' | 'medium' | 'low';
  sources: readonly SourceCitation[];
}

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  body: string;
  sources?: readonly SourceCitation[];
  confidence?: SupportAnswer['confidence'];
}
`,
  ),
  file(
    'src/data/knowledge.ts',
    String.raw`import type { CollectionId, KnowledgeArticle } from '../types';

export const COLLECTIONS: readonly { id: CollectionId; label: string; count: number }[] = [
  { id: 'getting-started', label: 'Getting started', count: 2 },
  { id: 'billing', label: 'Billing & plans', count: 2 },
  { id: 'security', label: 'Security', count: 2 },
  { id: 'api', label: 'API & webhooks', count: 2 },
];

export const KNOWLEDGE_ARTICLES: readonly KnowledgeArticle[] = [
  {
    id: 'invite-team',
    collectionId: 'getting-started',
    title: 'Invite your team',
    summary: 'Invite teammates, assign roles, and manage pending invitations.',
    body: 'Workspace owners open Settings, then Members, and choose Invite teammate. Invitations expire after seven days. Admins can resend or revoke any pending invitation.',
    answer: 'Open Settings → Members and select “Invite teammate.” Choose Member or Admin before sending. The invite is valid for seven days; an admin can resend or revoke it from the Pending tab.',
    tags: ['invite', 'member', 'team', 'role', 'workspace', 'resend'],
    readTime: '2 min',
    updatedAt: 'Aug 18',
  },
  {
    id: 'first-project',
    collectionId: 'getting-started',
    title: 'Create your first project',
    summary: 'Start from a prompt, template, or repository and publish a preview.',
    body: 'Select New project, choose a blank workspace, template, or Git repository, then describe the outcome. Preview is available after the first successful build.',
    answer: 'Select “New project,” then start from a prompt, a template, or an existing Git repository. Your first preview becomes available automatically after the initial build succeeds.',
    tags: ['create', 'project', 'template', 'repository', 'preview', 'build'],
    readTime: '3 min',
    updatedAt: 'Aug 20',
  },
  {
    id: 'change-plan',
    collectionId: 'billing',
    title: 'Change or cancel a plan',
    summary: 'Understand upgrades, downgrades, cancellation, and renewal dates.',
    body: 'Plan upgrades apply immediately with a prorated charge. Downgrades and cancellations take effect at the end of the current billing period. Projects remain exportable after cancellation.',
    answer: 'Go to Settings → Billing → Manage plan. Upgrades apply immediately and are prorated. A downgrade or cancellation is scheduled for the end of your current billing period, so access continues until the renewal date.',
    tags: ['cancel', 'downgrade', 'upgrade', 'subscription', 'renewal', 'prorated'],
    readTime: '3 min',
    updatedAt: 'Aug 16',
  },
  {
    id: 'usage-limits',
    collectionId: 'billing',
    title: 'Usage and spending limits',
    summary: 'Set monthly budgets, alerts, and a hard service limit.',
    body: 'Organization admins configure a monthly budget, alert thresholds, and an optional hard service limit from Billing controls. Alerts notify billing contacts before the cap is reached.',
    answer: 'An organization admin can set a monthly budget in Settings → Billing → Usage controls. Add alert thresholds for billing contacts and, if needed, enable the hard service limit to stop new paid usage at the cap.',
    tags: ['usage', 'limit', 'budget', 'spend', 'alert', 'cap'],
    readTime: '4 min',
    updatedAt: 'Aug 12',
  },
  {
    id: 'sso-setup',
    collectionId: 'security',
    title: 'Configure SAML SSO',
    summary: 'Connect your identity provider and enforce single sign-on safely.',
    body: 'Enterprise admins add their IdP metadata, verify the domain, test with a non-enforced connection, then enable SSO enforcement. A recovery admin session remains available during setup.',
    answer: 'In Organization settings → Security → SSO, add your identity-provider metadata and verify the company domain. Test the connection before enabling enforcement. Keep the recovery admin session open until the test login succeeds.',
    tags: ['sso', 'saml', 'identity', 'provider', 'idp', 'domain', 'login'],
    readTime: '6 min',
    updatedAt: 'Aug 21',
  },
  {
    id: 'data-encryption',
    collectionId: 'security',
    title: 'Data encryption and retention',
    summary: 'How project data is encrypted, retained, exported, and deleted.',
    body: 'Data is encrypted in transit with TLS and at rest. Workspace administrators can export project data. Account deletion enters a recovery window before verified erasure begins.',
    answer: 'Project data is encrypted in transit and at rest. Workspace admins can export it at any time. Deletion requests enter a recovery window first, then the erasure workflow removes account data and verifies physical storage cleanup.',
    tags: ['encryption', 'retention', 'delete', 'erasure', 'export', 'tls', 'data'],
    readTime: '5 min',
    updatedAt: 'Aug 19',
  },
  {
    id: 'api-authentication',
    collectionId: 'api',
    title: 'API authentication',
    summary: 'Create scoped API keys and rotate them without downtime.',
    body: 'Create API keys from Developer settings, select the minimum required scopes, and copy the secret once. To rotate without downtime, create the replacement before revoking the old key.',
    answer: 'Create a key in Settings → Developer → API keys and grant only the scopes your integration needs. The secret is shown once. For zero-downtime rotation, deploy a replacement key first, then revoke the previous key.',
    tags: ['api', 'key', 'token', 'authentication', 'scope', 'rotate', 'secret'],
    readTime: '4 min',
    updatedAt: 'Aug 22',
  },
  {
    id: 'webhook-retries',
    collectionId: 'api',
    title: 'Webhook delivery and retries',
    summary: 'Verify signatures, handle duplicate events, and inspect retries.',
    body: 'Webhook requests include a signing header. Endpoints should verify it against the raw body and process event IDs idempotently. Failed deliveries retry with backoff and remain visible in delivery logs.',
    answer: 'Verify each webhook signature against the raw request body, then deduplicate on the event ID. Failed deliveries retry automatically with backoff; inspect the response and replay an event from Developer → Webhooks → Delivery logs.',
    tags: ['webhook', 'retry', 'signature', 'event', 'duplicate', 'idempotent', 'delivery'],
    readTime: '5 min',
    updatedAt: 'Aug 23',
  },
];
`,
  ),
  file(
    'src/lib/answer-engine.ts',
    String.raw`import type { KnowledgeArticle, SourceCitation, SupportAnswer } from '../types';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'can', 'do', 'for', 'from', 'how', 'i', 'in', 'is', 'it', 'my', 'of', 'on',
  'or', 'the', 'to', 'we', 'what', 'when', 'where', 'with', 'you', 'your',
]);

export function tokenize(value: string): readonly string[] {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function overlap(query: ReadonlySet<string>, value: string): number {
  return tokenize(value).reduce((score, token) => score + (query.has(token) ? 1 : 0), 0);
}

export function rankArticles(
  question: string,
  articles: readonly KnowledgeArticle[],
  enabledArticleIds: ReadonlySet<string>,
): readonly { article: KnowledgeArticle; score: number }[] {
  const query = new Set(tokenize(question));

  if (query.size === 0) {
    return [];
  }

  return articles
    .filter((article) => enabledArticleIds.has(article.id))
    .map((article) => {
      const titleScore = overlap(query, article.title) * 5;
      const tagScore = article.tags.reduce((score, tag) => score + overlap(query, tag) * 4, 0);
      const summaryScore = overlap(query, article.summary) * 2;
      const bodyScore = overlap(query, article.body);
      return { article, score: titleScore + tagScore + summaryScore + bodyScore };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.article.title.localeCompare(right.article.title));
}

function citation(article: KnowledgeArticle, score: number): SourceCitation {
  return {
    id: article.id,
    title: article.title,
    summary: article.summary,
    collectionId: article.collectionId,
    score,
  };
}

export function answerSupportQuestion(
  question: string,
  articles: readonly KnowledgeArticle[],
  enabledArticleIds: ReadonlySet<string>,
): SupportAnswer {
  const ranked = rankArticles(question, articles, enabledArticleIds);
  const primary = ranked[0];

  if (!primary || primary.score < 4) {
    return {
      body: 'I could not verify that in the enabled documentation. Try naming the feature, or hand this conversation to a support specialist so they can confirm it without guessing.',
      confidence: 'low',
      sources: [],
    };
  }

  const related = ranked.slice(1).find((result) => result.score >= Math.max(4, primary.score * 0.45));
  const sources = related
    ? [citation(primary.article, primary.score), citation(related.article, related.score)]
    : [citation(primary.article, primary.score)];

  return {
    body: primary.article.answer,
    confidence: primary.score >= 12 ? 'high' : 'medium',
    sources,
  };
}
`,
  ),
  file(
    'src/lib/answer-engine.test.ts',
    String.raw`import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_ARTICLES } from '../data/knowledge';
import { answerSupportQuestion, rankArticles, tokenize } from './answer-engine';

const allEnabled = new Set(KNOWLEDGE_ARTICLES.map((article) => article.id));

describe('documentation-grounded answer engine', () => {
  it('normalizes questions and removes filler words', () => {
    expect(tokenize('How can I configure SÁML SSO for my team?')).toEqual(['configure', 'saml', 'sso', 'team']);
  });

  it('ranks the relevant article ahead of unrelated documents', () => {
    const ranked = rankArticles('How do webhook signature retries work?', KNOWLEDGE_ARTICLES, allEnabled);
    expect(ranked[0]?.article.id).toBe('webhook-retries');
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
  });

  it('never cites a source disabled by the operator', () => {
    const enabled = new Set([...allEnabled].filter((id) => id !== 'change-plan'));
    const answer = answerSupportQuestion('How do I cancel my subscription?', KNOWLEDGE_ARTICLES, enabled);
    expect(answer.sources.map((source) => source.id)).not.toContain('change-plan');
  });

  it('fails closed instead of inventing an unsupported answer', () => {
    const answer = answerSupportQuestion('Can you book my flight to Lisbon?', KNOWLEDGE_ARTICLES, allEnabled);
    expect(answer.confidence).toBe('low');
    expect(answer.sources).toEqual([]);
    expect(answer.body).toContain('without guessing');
  });
});
`,
  ),
  file(
    'src/main.tsx',
    String.raw`import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

interface ErrorBoundaryState {
  failed: boolean;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Docs Copilot could not render', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <main className="fatal-state" role="alert">
          <div className="brand-orb">D</div>
          <h1>Docs Copilot needs a restart</h1>
          <p>Your knowledge base is safe. Reload the app to restore this conversation.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload app</button>
        </main>
      );
    }

    return this.props.children;
  }
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
`,
  ),
  file(
    'src/App.tsx',
    String.raw`import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { COLLECTIONS, KNOWLEDGE_ARTICLES } from './data/knowledge';
import { answerSupportQuestion } from './lib/answer-engine';
import type { ChatMessage, CollectionId, KnowledgeArticle } from './types';

const STARTER_MESSAGES: readonly ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    body: 'Hi Maya — I’m Atlas, your documentation copilot. Ask me about setup, billing, security, or the API. Every answer links back to the source I used.',
  },
];

const SUGGESTIONS = [
  'How do I invite a teammate?',
  'Can I cancel before renewal?',
  'How do webhook retries work?',
] as const;

function collectionLabel(id: CollectionId): string {
  return COLLECTIONS.find((collection) => collection.id === id)?.label ?? id;
}

function newMessageId(prefix: string): string {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1_000_000).toString(36);
}

export function App() {
  const [activeCollection, setActiveCollection] = useState<CollectionId | 'all'>('all');
  const [enabledIds, setEnabledIds] = useState<ReadonlySet<string>>(
    () => new Set(KNOWLEDGE_ARTICLES.map((article) => article.id)),
  );
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle>(() => {
    const firstArticle = KNOWLEDGE_ARTICLES[0];
    if (!firstArticle) throw new Error('Docs Copilot requires at least one knowledge article');
    return firstArticle;
  });
  const [messages, setMessages] = useState<readonly ChatMessage[]>(STARTER_MESSAGES);
  const [question, setQuestion] = useState('');
  const [thinking, setThinking] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, 'helpful' | 'unhelpful'>>({});
  const timerRef = useRef<number | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const visibleArticles = useMemo(
    () =>
      activeCollection === 'all'
        ? KNOWLEDGE_ARTICLES
        : KNOWLEDGE_ARTICLES.filter((article) => article.collectionId === activeCollection),
    [activeCollection],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, thinking]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  function ask(rawQuestion: string): void {
    const cleanQuestion = rawQuestion.trim();

    if (!cleanQuestion || thinking) {
      return;
    }

    const userMessage: ChatMessage = { id: newMessageId('user'), role: 'user', body: cleanQuestion };
    setMessages((current) => [...current, userMessage]);
    setQuestion('');
    setThinking(true);

    timerRef.current = window.setTimeout(() => {
      const result = answerSupportQuestion(cleanQuestion, KNOWLEDGE_ARTICLES, enabledIds);
      const assistantMessage: ChatMessage = {
        id: newMessageId('assistant'),
        role: 'assistant',
        body: result.body,
        confidence: result.confidence,
        sources: result.sources,
      };
      setMessages((current) => [...current, assistantMessage]);
      setThinking(false);
      timerRef.current = null;

      const primarySource = result.sources[0];
      if (primarySource) {
        const article = KNOWLEDGE_ARTICLES.find((candidate) => candidate.id === primarySource.id);
        if (article) setSelectedArticle(article);
      }
    }, 420);
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    ask(question);
  }

  function toggleArticle(articleId: string): void {
    setEnabledIds((current) => {
      const next = new Set(current);
      if (next.has(articleId)) next.delete(articleId);
      else next.add(articleId);
      return next;
    });
  }

  function resetConversation(): void {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setThinking(false);
    setMessages(STARTER_MESSAGES);
    setQuestion('');
    setFeedback({});
  }

  async function shareConversation(): Promise<void> {
    const transcript = messages.map((message) => (message.role === 'user' ? 'You: ' : 'Atlas: ') + message.body).join('\n\n');

    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(transcript);
    } catch {
      const fallback = document.createElement('textarea');
      fallback.value = transcript;
      fallback.setAttribute('readonly', '');
      fallback.style.position = 'fixed';
      fallback.style.opacity = '0';
      document.body.append(fallback);
      fallback.select();
      document.execCommand('copy');
      fallback.remove();
    }

    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1_600);
  }

  return (
    <div className="app-shell" data-gallery-app-id="docs-copilot">
      <a className="skip-link" href="#conversation">Skip to conversation</a>

      <aside className="sidebar" aria-label="Docs Copilot workspace">
        <div className="brand-lockup">
          <span className="brand-orb" aria-hidden="true">D</span>
          <span><strong>Docs</strong><small>Copilot</small></span>
        </div>

        <button className="new-chat" type="button" onClick={resetConversation}>
          <span aria-hidden="true">＋</span> New conversation
        </button>

        <nav className="collections" aria-label="Knowledge collections">
          <p className="eyebrow">Collections</p>
          <button
            type="button"
            className={activeCollection === 'all' ? 'collection active' : 'collection'}
            aria-current={activeCollection === 'all' ? 'page' : undefined}
            onClick={() => setActiveCollection('all')}
          >
            <span><i aria-hidden="true">⌘</i> All documentation</span><b>{KNOWLEDGE_ARTICLES.length}</b>
          </button>
          {COLLECTIONS.map((collection) => (
            <button
              key={collection.id}
              type="button"
              className={activeCollection === collection.id ? 'collection active' : 'collection'}
              aria-current={activeCollection === collection.id ? 'page' : undefined}
              onClick={() => setActiveCollection(collection.id)}
            >
              <span><i aria-hidden="true">{collection.id === 'billing' ? '$' : collection.id === 'security' ? '◇' : collection.id === 'api' ? '{ }' : '↗'}</i>{collection.label}</span>
              <b>{collection.count}</b>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="avatar" aria-hidden="true">MC</div>
          <span><strong>Maya Chen</strong><small>Acme workspace</small></span>
          <button type="button" aria-label="Workspace options">•••</button>
        </div>
      </aside>

      <main className="main-column" id="conversation">
        <header className="conversation-header">
          <div>
            <span className="assistant-avatar" aria-hidden="true">✦</span>
            <span><h1>Atlas support assistant</h1><small><i /> Online · grounded in {enabledIds.size} sources</small></span>
          </div>
          <button type="button" className="share-button" onClick={() => void shareConversation()} aria-live="polite">
            {shareCopied ? 'Copied' : 'Share'}
          </button>
        </header>

        <section className="thread" aria-label="Support conversation" aria-live="polite">
          <div className="thread-date">Today, 10:42</div>
          {messages.map((message) => (
            <article key={message.id} className={'message ' + message.role}>
              {message.role === 'assistant' && <span className="message-avatar" aria-hidden="true">✦</span>}
              <div className="message-content">
                <div className="bubble">
                  <p>{message.body}</p>
                  {message.sources && message.sources.length > 0 && (
                    <div className="citations" aria-label="Answer sources">
                      <span>Sources</span>
                      {message.sources.map((source, index) => (
                        <button
                          key={source.id}
                          type="button"
                          onClick={() => {
                            const article = KNOWLEDGE_ARTICLES.find((candidate) => candidate.id === source.id);
                            if (article) setSelectedArticle(article);
                          }}
                        >
                          <b>{index + 1}</b>{source.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {message.role === 'assistant' && message.id !== 'welcome' && (
                  <div className="message-meta">
                    <span className={'confidence ' + message.confidence}>{message.confidence} confidence</span>
                    <span>Was this helpful?</span>
                    <button
                      type="button"
                      aria-label="Mark answer helpful"
                      aria-pressed={feedback[message.id] === 'helpful'}
                      onClick={() => setFeedback((current) => ({ ...current, [message.id]: 'helpful' }))}
                    >↑</button>
                    <button
                      type="button"
                      aria-label="Mark answer unhelpful"
                      aria-pressed={feedback[message.id] === 'unhelpful'}
                      onClick={() => setFeedback((current) => ({ ...current, [message.id]: 'unhelpful' }))}
                    >↓</button>
                  </div>
                )}
              </div>
            </article>
          ))}

          {messages.length === 1 && (
            <div className="suggestions" aria-label="Suggested questions">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => ask(suggestion)}>{suggestion}<span>→</span></button>
              ))}
            </div>
          )}

          {thinking && (
            <article className="message assistant" aria-label="Atlas is searching the documentation">
              <span className="message-avatar" aria-hidden="true">✦</span>
              <div className="thinking"><i /><i /><i /><span>Searching enabled sources</span></div>
            </article>
          )}
          <div ref={endRef} />
        </section>

        <form className="composer" onSubmit={submit}>
          <label htmlFor="support-question">Ask your documentation</label>
          <div className="composer-field">
            <textarea
              id="support-question"
              rows={1}
              value={question}
              placeholder="Ask a support question…"
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  ask(question);
                }
              }}
            />
            <button type="submit" disabled={!question.trim() || thinking} aria-label="Send question">↑</button>
          </div>
          <p>Atlas answers only from enabled documentation · <kbd>Enter</kbd> to send</p>
        </form>
      </main>

      <aside className="knowledge" aria-label="Knowledge sources">
        <header>
          <div><p className="eyebrow">Knowledge base</p><h2>{activeCollection === 'all' ? 'All sources' : collectionLabel(activeCollection)}</h2></div>
          <button type="button" aria-label="Knowledge base settings">•••</button>
        </header>

        <div className="index-status"><span className="index-icon">✓</span><p><strong>Knowledge is up to date</strong><small>{enabledIds.size} of {KNOWLEDGE_ARTICLES.length} sources enabled</small></p></div>

        <div className="source-list">
          {visibleArticles.map((article) => (
            <article key={article.id} className={selectedArticle.id === article.id ? 'source-card selected' : 'source-card'}>
              <div className="source-row">
                <label className="source-toggle">
                  <input
                    type="checkbox"
                    checked={enabledIds.has(article.id)}
                    onChange={() => toggleArticle(article.id)}
                    aria-label={'Use ' + article.title + ' as an answer source'}
                  />
                  <span aria-hidden="true">✓</span>
                </label>
                <span className="doc-icon" aria-hidden="true">≡</span>
                <button type="button" onClick={() => setSelectedArticle(article)}>
                  <strong>{article.title}</strong>
                  <small>{article.readTime} · Updated {article.updatedAt}</small>
                </button>
              </div>
            </article>
          ))}
        </div>

        <section className="article-preview" aria-labelledby="source-preview-title">
          <span>{collectionLabel(selectedArticle.collectionId)}</span>
          <h3 id="source-preview-title">{selectedArticle.title}</h3>
          <p>{selectedArticle.summary}</p>
          <button type="button" onClick={() => ask('Tell me about ' + selectedArticle.title)}>Ask about this source <span>→</span></button>
        </section>
      </aside>
    </div>
  );
}
`,
  ),
  file(
    'src/styles.css',
    String.raw`:root {
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #17211e;
  background: #e9eeeb;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  --ink: #17211e;
  --muted: #6b7772;
  --line: #dbe2de;
  --paper: #ffffff;
  --lime: #c6f36a;
  --forest: #0c1714;
  --soft: #f4f7f5;
}

* { box-sizing: border-box; }
html, body, #root { min-height: 100%; margin: 0; }
body { min-width: 320px; }
button, textarea, input { font: inherit; }
button { min-width: 44px; min-height: 44px; cursor: pointer; }
button:focus-visible, textarea:focus-visible, input:focus-visible { outline: 3px solid #86b925; outline-offset: 2px; }

.skip-link { position: fixed; z-index: 20; left: 16px; top: -80px; min-height: 44px; padding: 10px 14px; border-radius: 8px; display: flex; align-items: center; background: var(--lime); color: var(--forest); font-weight: 700; }
.skip-link:focus { top: 12px; }
.app-shell { height: 100vh; min-height: 620px; display: grid; grid-template-columns: 220px minmax(450px, 1fr) 300px; overflow: hidden; background: var(--paper); }

.sidebar { min-width: 0; padding: 22px 14px 14px; display: flex; flex-direction: column; color: #f5faf7; background: var(--forest); }
.brand-lockup { padding: 0 8px 24px; display: flex; align-items: center; gap: 11px; }
.brand-orb { width: 33px; height: 33px; display: grid; place-items: center; border-radius: 10px; background: var(--lime); color: var(--forest); font-weight: 800; box-shadow: inset 0 -3px 0 rgba(12, 23, 20, .13); }
.brand-lockup > span:last-child { display: grid; line-height: 1.05; }
.brand-lockup strong { font-size: 15px; }
.brand-lockup small { margin-top: 3px; color: #8fa099; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
.new-chat { width: 100%; padding: 10px 12px; border: 1px solid #34413d; border-radius: 9px; display: flex; align-items: center; gap: 9px; background: #17241f; color: #eef5f1; font-size: 11px; font-weight: 650; text-align: left; }
.new-chat:hover { border-color: #52625c; background: #1c2b25; }
.new-chat span { color: var(--lime); font-size: 16px; line-height: 1; }
.collections { margin-top: 27px; }
.eyebrow { margin: 0 8px 9px; color: #77867f; font-size: 9px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; }
.collection { width: 100%; min-height: 44px; padding: 0 9px; border: 0; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; background: transparent; color: #9cab9f; font-size: 10px; }
.collection span { display: flex; align-items: center; gap: 8px; }
.collection i { width: 16px; color: #65776f; font-style: normal; font-weight: 700; text-align: center; }
.collection b { color: #687a71; font-size: 9px; font-weight: 600; }
.collection:hover { color: white; background: #17241f; }
.collection.active { color: white; background: #22312b; box-shadow: inset 2px 0 var(--lime); }
.collection.active i { color: var(--lime); }
.sidebar-footer { margin-top: auto; padding: 13px 7px 3px; border-top: 1px solid #27352f; display: grid; grid-template-columns: 29px 1fr 44px; align-items: center; gap: 8px; }
.avatar { width: 29px; height: 29px; display: grid; place-items: center; border-radius: 50%; background: #d4b8ff; color: #31213e; font-size: 9px; font-weight: 800; }
.sidebar-footer > span { min-width: 0; display: grid; }
.sidebar-footer strong { font-size: 9px; font-weight: 650; }
.sidebar-footer small { margin-top: 2px; overflow: hidden; color: #7f9188; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
.sidebar-footer button { border: 0; background: transparent; color: #84958c; font-size: 10px; }

.main-column { min-width: 0; min-height: 0; display: grid; grid-template-rows: 64px minmax(0, 1fr) auto; background: #f8faf9; }
.conversation-header { padding: 0 20px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, .94); }
.conversation-header > div { display: flex; align-items: center; gap: 9px; }
.assistant-avatar, .message-avatar { display: grid; place-items: center; border-radius: 10px; background: var(--forest); color: var(--lime); }
.assistant-avatar { width: 31px; height: 31px; font-size: 13px; }
.conversation-header > div > span:last-child { display: grid; }
.conversation-header h1 { margin: 0; color: var(--ink); font-size: 11px; font-weight: 700; }
.conversation-header small { margin-top: 3px; color: var(--muted); font-size: 8px; }
.conversation-header small i { width: 6px; height: 6px; margin-right: 4px; display: inline-block; border-radius: 50%; background: #68b437; }
.share-button { padding: 7px 11px; border: 1px solid var(--line); border-radius: 8px; background: white; color: #46514d; font-size: 9px; font-weight: 650; }

.thread { min-height: 0; overflow-y: auto; padding: 17px max(22px, calc((100% - 650px) / 2)) 12px; scroll-behavior: smooth; }
.thread-date { margin: 0 auto 18px; width: max-content; color: #919b97; font-size: 8px; }
.message { margin-bottom: 13px; display: flex; align-items: flex-start; gap: 8px; }
.message.user { justify-content: flex-end; }
.message-avatar { width: 25px; height: 25px; flex: 0 0 auto; border-radius: 8px; font-size: 10px; }
.message-content { max-width: min(490px, 88%); }
.bubble { padding: 12px 14px; border: 1px solid #dfe5e1; border-radius: 5px 14px 14px 14px; background: white; box-shadow: 0 3px 12px rgba(24, 38, 33, .04); }
.bubble p { margin: 0; color: #34403b; font-size: 10px; line-height: 1.58; }
.user .bubble { border: 0; border-radius: 14px 5px 14px 14px; background: var(--forest); }
.user .bubble p { color: #f4f7f5; }
.citations { margin-top: 11px; padding-top: 9px; border-top: 1px solid #e7ebe8; display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.citations > span { width: 100%; color: #8a9590; font-size: 7px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
.citations button { padding: 5px 7px 5px 5px; border: 1px solid #dae1dd; border-radius: 6px; display: flex; align-items: center; gap: 5px; background: #f8faf9; color: #4a5751; font-size: 8px; }
.citations button:hover { border-color: #9ab862; }
.citations b { width: 15px; height: 15px; display: grid; place-items: center; border-radius: 4px; background: #e5f5c5; color: #49641a; font-size: 7px; }
.message-meta { padding: 6px 2px 0; display: flex; align-items: center; gap: 5px; color: #8b9591; font-size: 7px; }
.message-meta > span:nth-child(2) { margin-left: auto; }
.confidence { padding: 3px 5px; border-radius: 999px; text-transform: capitalize; }
.confidence.high { background: #e4f4e1; color: #427438; }
.confidence.medium { background: #fff0c8; color: #866718; }
.confidence.low { background: #f1e9e6; color: #855244; }
.message-meta button { width: 20px; height: 20px; padding: 0; border: 1px solid transparent; border-radius: 5px; background: transparent; color: #7a8580; font-size: 9px; }
.message-meta button:hover, .message-meta button[aria-pressed='true'] { border-color: #ced7d2; background: white; color: #38521d; }
.suggestions { margin: 6px 0 14px 33px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.suggestions button { min-height: 49px; padding: 8px 9px; border: 1px solid #dfe5e1; border-radius: 9px; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-start; background: white; color: #53605a; font-size: 8px; text-align: left; }
.suggestions button:hover { border-color: #9bb76b; box-shadow: 0 4px 12px rgba(40, 55, 49, .05); }
.suggestions span { color: #769631; }
.thinking { min-height: 42px; padding: 0 12px; border: 1px solid #dfe5e1; border-radius: 5px 14px 14px; display: flex; align-items: center; gap: 4px; background: white; color: #8b9591; font-size: 8px; }
.thinking i { width: 5px; height: 5px; border-radius: 50%; background: #789947; animation: pulse 1s infinite alternate; }
.thinking i:nth-child(2) { animation-delay: .18s; }.thinking i:nth-child(3) { animation-delay: .36s; }.thinking span { margin-left: 5px; }

.composer { padding: 10px max(22px, calc((100% - 650px) / 2)) 13px; border-top: 1px solid #e4e9e6; background: rgba(248, 250, 249, .97); }
.composer > label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.composer-field { min-height: 48px; padding: 5px 5px 5px 14px; border: 1px solid #cfd8d3; border-radius: 13px; display: flex; align-items: center; gap: 8px; background: white; box-shadow: 0 7px 25px rgba(30, 48, 40, .06); }
.composer textarea { width: 100%; min-height: 44px; max-height: 88px; resize: none; border: 0; outline: 0; background: transparent; color: var(--ink); font-size: 10px; line-height: 1.4; }
.composer textarea::placeholder { color: #9aa49f; }
.composer-field button { width: 35px; height: 35px; flex: 0 0 auto; border: 0; border-radius: 10px; background: var(--forest); color: var(--lime); font-size: 16px; }
.composer-field button:disabled { cursor: not-allowed; background: #dce2df; color: #9aa49f; }
.composer > p { margin: 5px 4px 0; color: #98a19d; font-size: 7px; text-align: center; }
kbd { padding: 1px 3px; border: 1px solid #d8dfdb; border-radius: 3px; background: white; font-size: inherit; }

.knowledge { min-width: 0; padding: 0 16px 15px; border-left: 1px solid var(--line); overflow-y: auto; background: white; }
.knowledge > header { height: 64px; display: flex; justify-content: space-between; align-items: center; }
.knowledge > header .eyebrow { margin: 0 0 3px; }
.knowledge h2 { margin: 0; font-size: 13px; letter-spacing: -.02em; }
.knowledge > header button { border: 0; background: transparent; color: #86918c; font-size: 10px; }
.index-status { padding: 10px; border: 1px solid #dce8d3; border-radius: 9px; display: flex; align-items: center; gap: 9px; background: #f5faef; }
.index-icon { width: 23px; height: 23px; display: grid; place-items: center; border-radius: 7px; background: #dff0c8; color: #51772b; font-size: 10px; font-weight: 800; }
.index-status p { margin: 0; display: grid; }
.index-status strong { color: #40533b; font-size: 8px; }
.index-status small { margin-top: 2px; color: #7d8978; font-size: 7px; }
.source-list { margin-top: 13px; display: grid; gap: 4px; }
.source-card { padding: 7px; border: 1px solid transparent; border-radius: 8px; }
.source-card:hover, .source-card.selected { border-color: #e0e6e2; background: #f8faf9; }
.source-row { display: grid; grid-template-columns: 44px 25px 1fr; align-items: center; gap: 6px; }
.source-toggle { position: relative; width: 44px; height: 44px; display: grid; place-items: center; cursor: pointer; }
.source-toggle input { position: absolute; inset: 0; width: 44px; height: 44px; margin: 0; opacity: 0; cursor: pointer; }
.source-toggle span { width: 18px; height: 18px; border: 1px solid #aab6b0; border-radius: 5px; display: grid; place-items: center; background: white; color: transparent; font-size: 11px; font-weight: 800; }
.source-toggle input:checked + span { border-color: #52751d; background: #52751d; color: white; }
.source-toggle input:focus-visible + span { outline: 3px solid #86b925; outline-offset: 2px; }
.doc-icon { width: 25px; height: 27px; display: grid; place-items: center; border: 1px solid #dce3df; border-radius: 6px; background: white; color: #77847e; font-size: 11px; }
.source-card button { min-width: 0; padding: 2px 0; border: 0; display: grid; background: transparent; color: inherit; text-align: left; }
.source-card strong { overflow: hidden; color: #35413c; font-size: 8px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.source-card small { margin-top: 3px; color: #939d98; font-size: 7px; }
.article-preview { margin-top: 14px; padding: 13px; border-radius: 10px; background: var(--forest); color: white; }
.article-preview > span { color: var(--lime); font-size: 7px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
.article-preview h3 { margin: 7px 0 5px; font-size: 11px; }
.article-preview p { margin: 0; color: #a9b6b0; font-size: 8px; line-height: 1.5; }
.article-preview button { width: 100%; margin-top: 10px; padding: 7px 0 0; border: 0; border-top: 1px solid #2d3b35; display: flex; justify-content: space-between; background: transparent; color: #e6eee9; font-size: 8px; }
.article-preview button span { color: var(--lime); }
.fatal-state { min-height: 100vh; display: grid; place-content: center; justify-items: center; padding: 24px; background: #f5f8f6; text-align: center; }.fatal-state h1{margin:18px 0 4px}.fatal-state p{color:var(--muted)}.fatal-state button{padding:10px 16px;border:0;border-radius:8px;background:var(--forest);color:white}

@keyframes pulse { from { opacity: .25; transform: translateY(1px); } to { opacity: 1; transform: translateY(-1px); } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
@media (max-width: 920px) { .app-shell { grid-template-columns: 205px minmax(0, 1fr); }.knowledge { display: none; } }
@media (max-width: 660px) {
  .app-shell { height: auto; min-height: 100vh; grid-template-columns: 1fr; grid-template-rows: auto minmax(650px, 1fr); overflow: visible; }
  .sidebar { padding: 12px; display: grid; grid-template-columns: 1fr auto; gap: 10px; }
  .brand-lockup { padding: 0; }.new-chat { width: auto; }.collections { grid-column: 1 / -1; margin: 0; display: flex; gap: 4px; overflow-x: auto; }.collections .eyebrow { display: none; }
  .collection { width: max-content; }.collection b { display: none; }.sidebar-footer { display: none; }
  .main-column { min-height: 650px; }.conversation-header { padding: 0 14px; }.thread, .composer { padding-left: 14px; padding-right: 14px; }
  .suggestions { margin-left: 33px; grid-template-columns: 1fr; }.suggestions button { flex-direction: row; align-items: center; }
}
`,
  ),
  file(
    'tsconfig.json',
    String.raw`{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "types": ["vite/client", "vitest/globals"],
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src"]
}
`,
  ),
  file(
    'vite.config.ts',
    String.raw`import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.GALLERY_PREVIEW_BASE ?? '/',
  plugins: [react()],
});
`,
  ),
]);
