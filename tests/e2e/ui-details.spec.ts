import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { compileAsync } from 'sass-embedded';

let compiledIdeStyles: string | null = null;

async function readCompiledIdeStyles() {
  if (!compiledIdeStyles) {
    const result = await compileAsync('app/styles/index.scss', { style: 'expanded' });
    compiledIdeStyles = result.css;
  }

  return compiledIdeStyles;
}

async function mountAgentMessageContextDocument(page: Page) {
  const stylesheet = await readFile('app/styles/index.scss', 'utf8');
  const start = stylesheet.indexOf('.bolt-message-context-trigger');
  const end = stylesheet.indexOf('/*\n * Sprint 2');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Unable to locate agent message context styles');
  }

  await page.setContent(`
    <html>
      <head>
        <style>
          :root {
            color-scheme: dark;
            --bolt-elements-artifacts-inlineCode-background: #0a0f1c;
            --bolt-elements-artifacts-inlineCode-text: #c2c8cc;
            --bolt-elements-textPrimary: #f5f9fc;
            --mobile-nav-bg: rgb(14 21 37 / 0.94);
            --mobile-nav-border: rgb(43 50 69 / 0.9);
            --mobile-nav-border-top: rgb(122 133 153 / 0.42);
            --mobile-nav-height: 72px;
            --mobile-nav-inner-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08);
            --mobile-nav-shadow: 0 20px 60px rgb(0 4 20 / 0.55);
            --vc-animation-popover: 150ms;
            --vc-ide-accent-action: #0099ff;
            --vc-ide-bg-card: #1a2030;
            --vc-ide-bg-elevated: #0e1525;
            --vc-ide-bg-hover: #2b3245;
            --vc-ide-bg-panel: #0e1525;
            --vc-ide-border-subtle: #1a2030;
            --vc-ide-border-visible: #2b3245;
            --vc-ide-text-muted: #6e7681;
            --vc-ide-text-primary: #f5f9fc;
            --vc-ui-shadow-xl: 0 24px 64px rgb(0 4 20 / 0.7);
          }

          body {
            margin: 0;
            min-height: 100vh;
            background: #0a0f1c;
            color: var(--vc-ide-text-primary);
            font-family:
              Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }

          .grid {
            display: grid;
          }

          .gap-2 {
            gap: 0.5rem;
          }

          .text-xs {
            font-size: 12px;
            line-height: 16px;
          }

          .font-medium {
            font-weight: 500;
          }

          .text-bolt-elements-textPrimary {
            color: var(--bolt-elements-textPrimary);
          }

          @keyframes vc-popover-in {
            from {
              opacity: 0;
              transform: translateY(2px);
            }

            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          ${stylesheet.slice(start, end)}
        </style>
      </head>
      <body></body>
    </html>
  `);
}

async function injectUiDetailsFixture(page: Page) {
  await page.evaluate(() => {
    const fixture = document.createElement('section');
    fixture.setAttribute('data-testid', 'ui-details-fixture');
    fixture.innerHTML = `
      <button data-testid="ui-details-button">Button</button>
      <button class="vc-button-solid" data-testid="ui-button-solid">Solid</button>
      <button data-testid="ui-button-hover">Hover</button>
      <button data-testid="ui-button-active">Active</button>
      <button disabled data-testid="ui-button-disabled">Disabled</button>
      <button data-loading="true" data-testid="ui-button-loading" style="width: 28px; height: 28px;">
        <svg class="lucide" data-testid="ui-button-loading-icon" viewBox="0 0 24 24"><path d="M4 12h16" /></svg>
      </button>
      <button aria-label="Icon settings" data-testid="ui-icon-only-button">
        <svg class="lucide" viewBox="0 0 24 24"><path d="M4 12h16" /></svg>
      </button>
      <button class="vc-run-button" data-run-state="running" data-testid="ui-run-button">Stop</button>
      <div role="button" tabindex="0" data-testid="ui-role-button">Role button</div>
      <input data-testid="ui-details-input" value="Input" />
      <div class="card" data-testid="ui-details-card">Card</div>
      <div class="vc-animated-tab" role="tab" data-testid="ui-tab-open">Open tab</div>
      <div class="vc-animated-tab" role="tab" data-closing="true" data-testid="ui-tab-closing">Closing tab</div>
      <div role="dialog" data-testid="ui-details-modal">Modal</div>
      <div class="popover" data-testid="ui-details-popover">Popover</div>
      <div class="overlay" data-testid="ui-details-overlay">Overlay</div>
      <div class="vc-split-panel" data-testid="ui-split-panel" style="flex-basis: 50%;"></div>
      <div class="vc-drop-zone" data-testid="ui-drop-zone"></div>
      <div class="vc-typing-indicator" data-testid="ui-typing-indicator">
        <span></span><span></span><span></span>
      </div>
      <div class="vc-sr-only" data-testid="ui-sr-only">Screen reader only text</div>
      <div role="status" aria-live="polite" data-testid="ui-live-region">Accessible live update</div>
      <div data-testid="ui-contrast-primary" style="color: #F5F9FC; background: #0A0F1C;">Primary contrast</div>
      <div data-testid="ui-contrast-secondary" style="color: #C2C8CC; background: #0A0F1C;">Secondary contrast</div>
      <div role="tooltip" data-testid="ui-details-tooltip">Tooltip</div>
      <svg class="tooltip-arrow" data-testid="ui-details-tooltip-arrow" viewBox="0 0 10 5"><path d="M0 0h10L5 5Z" /></svg>
      <svg class="lucide" data-testid="ui-details-icon" viewBox="0 0 24 24" stroke-width="2"><path d="M4 12h16" /></svg>
      <div data-testid="ui-details-scroll" style="width: 120px; height: 80px; overflow: auto;">
        <div style="width: 240px; height: 180px;"></div>
      </div>
    `;
    document.body.appendChild(fixture);
  });
}

async function injectAgentMessageContextFixture(page: Page) {
  await page.evaluate(() => {
    document.querySelector('[data-testid="agent-message-context-fixture"]')?.remove();
    document.documentElement.style.setProperty('--mobile-nav-height', '72px');

    const roles = [
      ['Architect', 'Define architecture, state boundaries, API contracts, data ownership, and integration order.'],
      [
        'Frontend',
        'Build components, layouts, state management, accessibility, responsive behavior, loading states, and error states.',
      ],
      [
        'Backend',
        'Build API routes, validation, persistence adapters, auth boundaries, realtime handlers, and error handling.',
      ],
      [
        'DevOps',
        'Create runtime scripts, dependency setup, environment examples, build config, and deploy configuration.',
      ],
      ['QA', 'Write critical-path tests, verify build/typecheck, inspect preview behavior, and fix failures.'],
      ['Security', 'Validate tenant isolation, secrets handling, auditability, permissions, and recovery behavior.'],
      ['Performance', 'Inspect bundle size, render cost, reconnect behavior, caching, and slow runtime workflows.'],
      ['Observability', 'Confirm logs, metrics, healthchecks, diagnostics, and user-visible failure recovery.'],
    ];

    const roleCards = roles
      .map(
        ([title, responsibility]) => `
          <div class="bolt-message-context-item">
            <div class="text-xs font-medium text-bolt-elements-textPrimary">${title}</div>
            <div class="bolt-message-context-meta">${responsibility}</div>
          </div>
        `,
      )
      .join('');

    const fixture = document.createElement('section');
    fixture.setAttribute('data-testid', 'agent-message-context-fixture');
    fixture.innerHTML = `
      <button type="button" class="bolt-message-context-trigger" aria-label="Show agent message context" data-testid="agent-message-context-trigger">
        <span class="i-ph:info" aria-hidden="true"></span>
      </button>
      <div class="bolt-popover-content bolt-message-context-popover" data-testid="agent-message-context-popover" style="position: fixed; top: 64px; right: 16px;">
        <div class="bolt-message-context-panel">
          <div class="agent-orchestration bolt-message-context-card">
            <div>
              <h2 class="bolt-message-context-title">Agent orchestration</h2>
              <p class="bolt-message-context-subtitle">Parallel specialist agents planned inside the active model.</p>
            </div>
            <div class="grid gap-2">${roleCards}</div>
          </div>
          <div class="summary bolt-message-context-card">
            <h2 class="bolt-message-context-title">Summary</h2>
            <div class="bolt-message-context-markdown">
              <p><strong>Project:</strong> Production portfolio application with case studies, posts, contact workflows, backend routes, and visual QA.</p>
              <ul>
                <li>Current phase: responsive shell hardening and message context validation.</li>
                <li>Risk focus: mobile information density, viewport-constrained panels, and accessible interaction targets.</li>
                <li>Verification: typecheck, lint, build, tests, and compact viewport measurements before release.</li>
              </ul>
              <p>The summary intentionally contains enough content to require internal scrolling instead of expanding beyond the viewport.</p>
            </div>
          </div>
          <div class="code-context bolt-message-context-card">
            <h2 class="bolt-message-context-title">Context</h2>
            <div class="bolt-message-context-file-list">
              <button type="button" class="bolt-message-context-file"><code>src/App.tsx</code></button>
              <button type="button" class="bolt-message-context-file"><code>src/components/PortfolioShell.tsx</code></button>
              <button type="button" class="bolt-message-context-file"><code>app/components/chat/AssistantMessage.tsx</code></button>
              <button type="button" class="bolt-message-context-file"><code>package.json</code></button>
            </div>
          </div>
        </div>
      </div>
      <nav class="bolt-mobile-replit-nav" aria-label="IDE panels" data-testid="agent-message-context-mobile-nav" style="position: fixed; right: 12px; bottom: 0; left: 12px; display: flex; height: var(--mobile-nav-height, 72px);"></nav>
    `;
    document.body.appendChild(fixture);
  });
}

async function mountFloatingSurfacesDocument(page: Page) {
  const stylesheet = await readCompiledIdeStyles();

  await page.setContent(`
    <html>
      <head>
        <style>
          ${stylesheet}

          :root {
            color-scheme: dark;
            --bolt-elements-borderColor: #2b3245;
            --bolt-elements-bg-depth-1: #0a0f1c;
            --bolt-elements-bg-depth-2: #0e1525;
            --bolt-elements-bg-depth-3: #1a2030;
            --bolt-elements-textPrimary: #f5f9fc;
            --mobile-nav-bg: rgb(14 21 37 / 0.94);
            --mobile-nav-border: rgb(43 50 69 / 0.9);
            --mobile-nav-border-top: rgb(122 133 153 / 0.42);
            --mobile-nav-height: 72px;
            --mobile-nav-shadow: 0 20px 60px rgb(0 4 20 / 0.55);
            --vc-ide-accent-action: #0099ff;
            --vc-ide-bg-app: #0a0f1c;
            --vc-ide-bg-card: #1a2030;
            --vc-ide-bg-card-hover: #2b3245;
            --vc-ide-bg-elevated: #0e1525;
            --vc-ide-bg-hover: #2b3245;
            --vc-ide-bg-panel: #0e1525;
            --vc-ide-border-subtle: #1a2030;
            --vc-ide-border-visible: #2b3245;
            --vc-ide-text-muted: #6e7681;
            --vc-ide-text-primary: #f5f9fc;
            --vc-ide-text-secondary: #c2c8cc;
            --vc-ui-overlay-blur: blur(16px);
            --vc-ui-radius-popover: 12px;
            --vc-ui-shadow-lg: 0 12px 32px rgb(0 4 20 / 0.6);
            --vc-ui-shadow-xl: 0 24px 64px rgb(0 4 20 / 0.7);
          }

          body {
            margin: 0;
            min-height: 100dvh;
            overflow: hidden;
            background: var(--vc-ide-bg-app);
            color: var(--vc-ide-text-primary);
            font-family:
              Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }

          .floating-surface {
            font-size: 12px;
          }

          .floating-token {
            min-width: 0;
            overflow-wrap: anywhere;
          }
        </style>
      </head>
      <body>
        <main class="bolt-responsive-ide-mobile" data-testid="floating-surfaces-fixture">
          <div class="bolt-composer-mentions-overlay floating-surface" data-testid="floating-mentions" style="position: fixed; bottom: 92px; left: 12px;">
            <div class="bolt-file-mentions-palette">
              <ul class="bolt-file-mentions-list">
                ${Array.from(
                  { length: 12 },
                  (_, index) => `
                    <li class="bolt-file-mentions-item">
                      <span class="bolt-file-mentions-icon">F</span>
                      <span class="bolt-file-mentions-basename">component-${index}.tsx</span>
                      <span class="bolt-file-mentions-path">src/components/responsive/surface-${index}.tsx</span>
                    </li>
                  `,
                ).join('')}
              </ul>
            </div>
          </div>

          <div class="bolt-composer-slash-overlay floating-surface" data-testid="floating-slash" style="position: fixed; bottom: 92px; right: 12px; left: auto;">
            <div class="bolt-slash-commands-palette">
              <ul class="bolt-slash-commands-list">
                ${Array.from(
                  { length: 12 },
                  (_, index) => `
                    <li class="bolt-slash-commands-item">
                      <span class="bolt-slash-commands-keyword">/command-${index}</span>
                      <span class="bolt-slash-commands-label">Run command ${index}</span>
                      <span class="bolt-slash-commands-description">Executes a responsive IDE workflow without forcing horizontal overflow.</span>
                    </li>
                  `,
                ).join('')}
              </ul>
            </div>
          </div>

          <div class="bolt-branches-menu-popover floating-surface" data-testid="floating-branches" style="position: fixed; top: 16px; right: 8px;">
            <div class="bolt-branches-list">
              ${Array.from(
                { length: 16 },
                (_, index) => `
                  <div class="bolt-branches-row">
                    <button class="bolt-branches-row-switch" type="button">
                      <span class="bolt-branches-row-icon">B</span>
                      <span class="bolt-branches-row-label">feature/responsive-floating-panel-${index}</span>
                    </button>
                  </div>
                `,
              ).join('')}
            </div>
          </div>

          <div class="bolt-chatbox-tools-menu floating-surface" data-testid="floating-chatbox-tools" style="position: fixed; bottom: 92px; left: 8px;">
            ${['Upload files', 'Design Palette', 'Fetch URL content', 'Voice input', 'Runtime tools', 'Project context']
              .map(
                (item) => `
                  <button class="bolt-chatbox-tools-menu-item" type="button">
                    <span class="floating-token">${item}</span>
                  </button>
                `,
              )
              .join('')}
          </div>

          <div class="bolt-project-statusbar-overflow-content floating-surface" data-testid="floating-statusbar" style="position: fixed; right: 8px; bottom: 12px;">
            <div class="bolt-project-statusbar-overflow-list" role="list">
              ${['Current cursor position', 'Indentation: 2 spaces', 'File encoding: UTF-8', 'Detected language mode']
                .map(
                  (label) => `
                    <div class="bolt-project-statusbar-overflow-row" role="listitem">
                      <span class="bolt-project-statusbar-overflow-label">${label}</span>
                      <span class="bolt-project-statusbar-overflow-value">TypeScript</span>
                    </div>
                  `,
                )
                .join('')}
            </div>
          </div>

          <div class="bolt-project-tool-menu floating-surface" data-testid="floating-project-tool" style="top: 80px; right: 8px;">
            <header class="bolt-project-tool-menu-header">
              <div class="bolt-project-tool-menu-title">
                <strong>Project tool menu</strong>
                <small>Responsive surface</small>
              </div>
            </header>
            <div class="bolt-project-tool-menu-body">
              ${Array.from({ length: 12 }, (_, index) => `<p class="floating-token">Tool action ${index} with production context.</p>`).join('')}
            </div>
            <footer class="bolt-project-tool-footer">
              <span class="floating-token">Keyboard accessible</span>
              <kbd>Esc</kbd>
            </footer>
          </div>

          <div class="vc-sidebar-popover floating-surface" data-testid="floating-sidebar" style="position: fixed; top: 16px; left: 8px; width: 224px; padding: 8px; border: 1px solid var(--vc-ide-border-visible); border-radius: 10px; background: var(--vc-ide-bg-card);">
            <p class="floating-token">Account menu with a long profile description that wraps instead of widening the popover.</p>
          </div>

          <div class="bolt-project-notification-popover floating-surface" data-testid="floating-notification" style="position: fixed; top: 160px; right: 8px; width: 420px; padding: 10px; border: 1px solid var(--vc-ide-border-visible); border-radius: 12px;">
            <div class="bolt-project-notification-list">
              ${Array.from(
                { length: 8 },
                (_, index) => `
                  <div class="bolt-project-notification-item">
                    <span class="bolt-project-notification-icon">N</span>
                    <span class="floating-token">
                      <span class="bolt-project-notification-title">Notification ${index}</span>
                      <span class="bolt-project-notification-detail">Runtime, preview and backend event details wrap safely.</span>
                    </span>
                  </div>
                `,
              ).join('')}
            </div>
          </div>

          <details class="bolt-project-collaborate-menu" open>
            <summary>Collaborate</summary>
            <div class="bolt-project-collaborate-popover floating-surface" data-testid="floating-collaborate" style="position: fixed; top: 260px; left: 8px; width: 220px; padding: 8px; border: 1px solid var(--vc-ide-border-visible); border-radius: 12px;">
              <button class="bolt-project-overflow-item" type="button"><span class="floating-token">Share project with collaborators</span></button>
              <button class="bolt-project-overflow-item" type="button"><span class="floating-token">Invite team members</span></button>
            </div>
          </details>

          <div class="bolt-project-action-group--overflow">
            <div class="bolt-project-overflow-popover floating-surface" data-testid="floating-overflow" style="position: fixed; top: 360px; right: 8px; width: 360px; padding: 10px; border: 1px solid var(--vc-ide-border-visible); border-radius: 12px;">
              <div class="bolt-project-overflow-section bolt-project-overflow-section--grid">
                ${['Help & support', 'Collaborators', 'Account', 'Sign out']
                  .map((item) => `<button class="bolt-project-overflow-item" type="button"><span class="floating-token">${item}</span></button>`)
                  .join('')}
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  `);
}

async function readFloatingSurfaceDetails(page: Page) {
  return page.getByTestId('floating-surfaces-fixture').evaluate(() => {
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

    return {
      documentOverflowsX: document.documentElement.scrollWidth > viewportWidth + 1,
      surfaces: Array.from(document.querySelectorAll<HTMLElement>('.floating-surface')).map((surface) => {
        const rect = surface.getBoundingClientRect();
        const style = window.getComputedStyle(surface);

        return {
          id: surface.getAttribute('data-testid') ?? surface.className,
          bottom: rect.bottom,
          clientWidth: surface.clientWidth,
          height: rect.height,
          left: rect.left,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          right: rect.right,
          scrollHeight: surface.scrollHeight,
          scrollWidth: surface.scrollWidth,
          top: rect.top,
          transform: style.transform,
          width: rect.width,
        };
      }),
      viewportHeight,
      viewportWidth,
    };
  });
}

function expectFloatingSurfacesConstrained(
  details: Awaited<ReturnType<typeof readFloatingSurfaceDetails>>,
  label: string,
) {
  expect(details.documentOverflowsX, `${label} document horizontal overflow`).toBe(false);

  for (const surface of details.surfaces) {
    expect(surface.left, `${label} ${surface.id} left edge`).toBeGreaterThanOrEqual(0);
    expect(surface.top, `${label} ${surface.id} top edge`).toBeGreaterThanOrEqual(0);
    expect(surface.right, `${label} ${surface.id} right edge`).toBeLessThanOrEqual(details.viewportWidth + 1);
    expect(surface.bottom, `${label} ${surface.id} bottom edge`).toBeLessThanOrEqual(details.viewportHeight + 1);
    expect(surface.width, `${label} ${surface.id} width`).toBeLessThanOrEqual(details.viewportWidth - 12 + 1);
    expect(surface.height, `${label} ${surface.id} height`).toBeLessThanOrEqual(details.viewportHeight - 12 + 1);
    expect(surface.scrollWidth, `${label} ${surface.id} internal horizontal overflow`).toBeLessThanOrEqual(
      surface.clientWidth + 1,
    );

    if (surface.id === 'floating-overflow' && details.viewportWidth <= 1199) {
      expect(surface.transform, `${label} mobile overflow transform`).toBe('none');
    }

    if (
      [
        'floating-branches',
        'floating-chatbox-tools',
        'floating-statusbar',
        'floating-notification',
      ].includes(surface.id)
    ) {
      expect(surface.overflowY, `${label} ${surface.id} vertical overflow mode`).not.toBe('visible');
    }
  }
}

async function readAgentMessageContextDetails(page: Page) {
  return page.getByTestId('agent-message-context-popover').evaluate((surface) => {
    const rect = surface.getBoundingClientRect();
    const panel = surface.querySelector('.bolt-message-context-panel') as HTMLElement | null;
    const trigger = document.querySelector('[data-testid="agent-message-context-trigger"]') as HTMLElement | null;
    const mobileNav = document.querySelector('[data-testid="agent-message-context-mobile-nav"]') as HTMLElement | null;
    const mobileNavRect = mobileNav?.getBoundingClientRect();
    const triggerRect = trigger?.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;

    return {
      bottom: rect.bottom,
      cardCount: surface.querySelectorAll('.bolt-message-context-card').length,
      documentOverflowsX: document.documentElement.scrollWidth > window.innerWidth + 1,
      hasInlineZoom: Array.from(surface.querySelectorAll<HTMLElement>('[style]')).some((element) =>
        /(^|;)\s*zoom\s*:/i.test(element.getAttribute('style') ?? ''),
      ),
      height: rect.height,
      left: rect.left,
      mobileNavTop: mobileNavRect?.top,
      panelOverflowsX: panel ? panel.scrollWidth > panel.clientWidth + 1 : true,
      panelOverflowY: panel ? window.getComputedStyle(panel).overflowY : '',
      panelScrolls: panel ? panel.scrollHeight > panel.clientHeight + 1 : false,
      right: rect.right,
      top: rect.top,
      triggerHeight: triggerRect?.height ?? 0,
      triggerWidth: triggerRect?.width ?? 0,
      viewportHeight,
      viewportWidth,
      width: rect.width,
    };
  });
}

function expectAgentMessageContextDetails(
  details: Awaited<ReturnType<typeof readAgentMessageContextDetails>>,
  label: string,
) {
  const isCompact = details.viewportWidth <= 1024;
  const expectedMaxWidth = !isCompact ? 430 : details.viewportWidth < 700 ? details.viewportWidth - 24 : 568;

  expect(details.documentOverflowsX, `${label} document horizontal overflow`).toBe(false);
  expect(details.left, `${label} left edge`).toBeGreaterThanOrEqual(0);
  expect(details.top, `${label} top edge`).toBeGreaterThanOrEqual(0);
  expect(details.right, `${label} right edge`).toBeLessThanOrEqual(details.viewportWidth + 1);
  expect(details.bottom, `${label} bottom edge`).toBeLessThanOrEqual(details.viewportHeight + 1);
  expect(details.width, `${label} popover width`).toBeLessThanOrEqual(expectedMaxWidth);
  expect(details.height, `${label} popover height`).toBeLessThanOrEqual(
    isCompact ? Math.min(details.viewportHeight * 0.58, 520) + 18 : Math.min(details.viewportHeight * 0.7, 560) + 2,
  );
  expect(details.panelOverflowsX, `${label} panel horizontal overflow`).toBe(false);
  expect(details.panelOverflowY, `${label} panel overflow mode`).toBe('auto');
  expect(details.panelScrolls, `${label} panel scroll`).toBe(true);
  expect(details.cardCount, `${label} content cards`).toBeGreaterThanOrEqual(3);
  expect(details.hasInlineZoom, `${label} inline zoom`).toBe(false);
  expect(details.triggerWidth, `${label} trigger width`).toBeGreaterThanOrEqual(isCompact ? 32 : 28);
  expect(details.triggerHeight, `${label} trigger height`).toBeGreaterThanOrEqual(isCompact ? 32 : 28);

  if (isCompact && typeof details.mobileNavTop === 'number') {
    expect(details.bottom, `${label} bottom navigation overlap`).toBeLessThanOrEqual(details.mobileNavTop - 8);
  }
}

async function readUiDetails(page: Page) {
  return page.locator('[data-testid="ui-details-fixture"]').evaluate(() => {
    const get = (selector: string, pseudo?: string) =>
      window.getComputedStyle(document.querySelector(selector)!, pseudo);
    const root = window.getComputedStyle(document.documentElement);
    const body = window.getComputedStyle(document.body);
    const button = get('[data-testid="ui-details-button"]');
    const input = get('[data-testid="ui-details-input"]');
    const card = get('[data-testid="ui-details-card"]');
    const modal = get('[data-testid="ui-details-modal"]');
    const popover = get('[data-testid="ui-details-popover"]');
    const overlay = get('[data-testid="ui-details-overlay"]');
    const tooltip = get('[data-testid="ui-details-tooltip"]');
    const tooltipArrow = get('[data-testid="ui-details-tooltip-arrow"]');
    const icon = get('[data-testid="ui-details-icon"]');
    const scrollbar = get('[data-testid="ui-details-scroll"]', '::-webkit-scrollbar');
    const scrollbarThumb = get('[data-testid="ui-details-scroll"]', '::-webkit-scrollbar-thumb');

    return {
      themeApp: root.getPropertyValue('--vc-ide-bg-app').trim().toLowerCase(),
      themePanel: root.getPropertyValue('--vc-ide-bg-panel').trim().toLowerCase(),
      themeCard: root.getPropertyValue('--vc-ide-bg-card').trim().toLowerCase(),
      themeHover: root.getPropertyValue('--vc-ide-bg-hover').trim().toLowerCase(),
      themeBorderSubtle: root.getPropertyValue('--vc-ide-border-subtle').trim().toLowerCase(),
      themeBorderVisible: root.getPropertyValue('--vc-ide-border-visible').trim().toLowerCase(),
      themeTextPrimary: root.getPropertyValue('--vc-ide-text-primary').trim().toLowerCase(),
      themeTextSecondary: root.getPropertyValue('--vc-ide-text-secondary').trim().toLowerCase(),
      themeTextMuted: root.getPropertyValue('--vc-ide-text-muted').trim().toLowerCase(),
      themeAiStart: root.getPropertyValue('--vc-ide-accent-ai-start').trim().toLowerCase(),
      themeAiEnd: root.getPropertyValue('--vc-ide-accent-ai-end').trim().toLowerCase(),
      themeSuccess: root.getPropertyValue('--vc-ide-accent-success').trim().toLowerCase(),
      themeAction: root.getPropertyValue('--vc-ide-accent-action').trim().toLowerCase(),
      themeOrange: root.getPropertyValue('--vc-ide-accent-orange').trim().toLowerCase(),
      themeError: root.getPropertyValue('--vc-ide-accent-error').trim().toLowerCase(),
      themeWarning: root.getPropertyValue('--vc-ide-accent-warning').trim().toLowerCase(),
      boltDepth1: root.getPropertyValue('--bolt-elements-bg-depth-1').trim(),
      boltDepth2: root.getPropertyValue('--bolt-elements-bg-depth-2').trim(),
      boltDepth3: root.getPropertyValue('--bolt-elements-bg-depth-3').trim(),
      boltTextPrimary: root.getPropertyValue('--bolt-elements-textPrimary').trim(),
      bodyBackground: body.backgroundColor,
      bodyColor: body.color,
      radiusButton: root.getPropertyValue('--vc-ui-radius-button').trim(),
      radiusInput: root.getPropertyValue('--vc-ui-radius-input').trim(),
      radiusCard: root.getPropertyValue('--vc-ui-radius-card').trim(),
      radiusModal: root.getPropertyValue('--vc-ui-radius-modal').trim(),
      radiusPopover: root.getPropertyValue('--vc-ui-radius-popover').trim(),
      shadowSm: root.getPropertyValue('--vc-ui-shadow-sm').trim(),
      shadowMd: root.getPropertyValue('--vc-ui-shadow-md').trim(),
      shadowLg: root.getPropertyValue('--vc-ui-shadow-lg').trim(),
      shadowXl: root.getPropertyValue('--vc-ui-shadow-xl').trim(),
      transitionHover: root.getPropertyValue('--vc-ui-transition-hover').trim(),
      transitionPanel: root.getPropertyValue('--vc-ui-transition-panel').trim(),
      transitionPopover: root.getPropertyValue('--vc-ui-transition-popover').trim(),
      focusRing: root.getPropertyValue('--vc-ui-focus-ring').trim().toLowerCase(),
      tooltipBg: root.getPropertyValue('--vc-ui-tooltip-bg').trim().toLowerCase(),
      tooltipBorder: root.getPropertyValue('--vc-ui-tooltip-border').trim().toLowerCase(),
      tooltipDelay: root.getPropertyValue('--vc-ui-tooltip-delay').trim(),
      scrollbarSize: root.getPropertyValue('--vc-ui-scrollbar-size').trim(),
      buttonBgToken: root.getPropertyValue('--vc-button-bg').trim(),
      buttonSolidBgToken: root.getPropertyValue('--vc-button-solid-bg').trim().toLowerCase(),
      buttonHoverBgToken: root.getPropertyValue('--vc-button-hover-bg').trim().toLowerCase(),
      buttonActiveBgToken: root.getPropertyValue('--vc-button-active-bg').trim().toLowerCase(),
      buttonDisabledOpacityToken: root.getPropertyValue('--vc-button-disabled-opacity').trim(),
      buttonLoadingSpinnerSizeToken: root.getPropertyValue('--vc-button-loading-spinner-size').trim(),
      buttonRadius: button.borderRadius,
      buttonTransitionDuration: button.transitionDuration,
      buttonTransitionTiming: button.transitionTimingFunction,
      inputRadius: input.borderRadius,
      cardRadius: card.borderRadius,
      cardBackground: card.backgroundColor,
      cardColor: card.color,
      cardBorderColor: card.borderColor,
      cardShadow: card.boxShadow,
      modalRadius: modal.borderRadius,
      modalShadow: modal.boxShadow,
      popoverRadius: popover.borderRadius,
      popoverShadow: popover.boxShadow,
      popoverTransitionDuration: popover.transitionDuration,
      overlayBackdrop: overlay.backdropFilter || overlay.getPropertyValue('-webkit-backdrop-filter'),
      overlayBackground: overlay.backgroundColor,
      tooltipBackground: tooltip.backgroundColor,
      tooltipBorderColor: tooltip.borderColor,
      tooltipFontSize: tooltip.fontSize,
      tooltipArrowFill: tooltipArrow.fill,
      iconWidth: icon.width,
      iconHeight: icon.height,
      iconStrokeWidth: icon.strokeWidth,
      scrollbarWidth: scrollbar.width,
      scrollbarHeight: scrollbar.height,
      scrollbarThumbBackground: scrollbarThumb.backgroundColor,
    };
  });
}

function contrastRatio(foreground: string, background: string) {
  const parse = (value: string) => {
    const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);

    if (!match) {
      throw new Error(`Unsupported color: ${value}`);
    }

    return [Number(match[1]), Number(match[2]), Number(match[3])].map((channel) => {
      const normalized = channel / 255;

      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
  };
  const luminance = (value: string) => {
    const [r, g, b] = parse(value);

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

async function expectAccessibilityDetails(page: Page) {
  const details = await page.locator('[data-testid="ui-details-fixture"]').evaluate(() => {
    const root = window.getComputedStyle(document.documentElement);
    const iconButton = document.querySelector('[data-testid="ui-icon-only-button"]')!;
    const liveRegion = document.querySelector('[data-testid="ui-live-region"]')!;
    const srOnly = window.getComputedStyle(document.querySelector('[data-testid="ui-sr-only"]')!);
    const primaryContrast = window.getComputedStyle(document.querySelector('[data-testid="ui-contrast-primary"]')!);
    const secondaryContrast = window.getComputedStyle(document.querySelector('[data-testid="ui-contrast-secondary"]')!);

    return {
      focusWidth: root.getPropertyValue('--vc-accessibility-focus-width').trim(),
      reducedMotionDuration: root.getPropertyValue('--vc-accessibility-reduced-motion-duration').trim(),
      contrastText: root.getPropertyValue('--vc-accessibility-contrast-text').trim().toLowerCase(),
      contrastMuted: root.getPropertyValue('--vc-accessibility-contrast-muted').trim().toLowerCase(),
      iconButtonLabel: iconButton.getAttribute('aria-label'),
      liveRegionRole: liveRegion.getAttribute('role'),
      liveRegionMode: liveRegion.getAttribute('aria-live'),
      srOnlyPosition: srOnly.position,
      srOnlyWidth: srOnly.width,
      srOnlyHeight: srOnly.height,
      srOnlyClipPath: srOnly.clipPath,
      primaryColor: primaryContrast.color,
      primaryBackground: primaryContrast.backgroundColor,
      secondaryColor: secondaryContrast.color,
      secondaryBackground: secondaryContrast.backgroundColor,
    };
  });

  expect(details.focusWidth).toBe('2px');
  expect(details.reducedMotionDuration).toBe('50ms');
  expect(details.contrastText).toBe('#f5f9fc');
  expect(details.contrastMuted).toBe('#c2c8cc');
  expect(details.iconButtonLabel).toBe('Icon settings');
  expect(details.liveRegionRole).toBe('status');
  expect(details.liveRegionMode).toBe('polite');
  expect(details.srOnlyPosition).toBe('absolute');
  expect(details.srOnlyWidth).toBe('1px');
  expect(details.srOnlyHeight).toBe('1px');
  expect(details.srOnlyClipPath).toContain('inset(50');
  expect(contrastRatio(details.primaryColor, details.primaryBackground)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(details.secondaryColor, details.secondaryBackground)).toBeGreaterThanOrEqual(4.5);

  const roleButton = page.getByTestId('ui-role-button');
  for (let index = 0; index < 120; index += 1) {
    const isFocused = await roleButton.evaluate((node) => node === document.activeElement);

    if (isFocused) {
      break;
    }

    await page.keyboard.press('Tab');
  }

  await expect(roleButton).toBeFocused();
  await expect(roleButton).toHaveCSS('outline-width', '2px');
  await expect(roleButton).toHaveCSS('outline-color', 'rgb(0, 153, 255)');
}

async function expectReducedMotionDetails(page: Page) {
  const details = await page.locator('[data-testid="ui-details-fixture"]').evaluate(() => {
    const tabOpen = window.getComputedStyle(document.querySelector('[data-testid="ui-tab-open"]')!);
    const popover = window.getComputedStyle(document.querySelector('[data-testid="ui-details-popover"]')!);
    const button = window.getComputedStyle(document.querySelector('[data-testid="ui-details-button"]')!);

    return {
      tabAnimationDuration: tabOpen.animationDuration,
      popoverAnimationDuration: popover.animationDuration,
      buttonTransitionDuration: button.transitionDuration,
    };
  });

  expect(details.tabAnimationDuration).toBe('0.05s');
  expect(details.popoverAnimationDuration).toBe('0.05s');
  expect(details.buttonTransitionDuration).toContain('0.05s');
}

async function expectAnimationDetails(page: Page) {
  const details = await page.locator('[data-testid="ui-details-fixture"]').evaluate(() => {
    const root = window.getComputedStyle(document.documentElement);
    const tabOpen = window.getComputedStyle(document.querySelector('[data-testid="ui-tab-open"]')!);
    const tabClosing = window.getComputedStyle(document.querySelector('[data-testid="ui-tab-closing"]')!);
    const popover = window.getComputedStyle(document.querySelector('[data-testid="ui-details-popover"]')!);
    const modal = window.getComputedStyle(document.querySelector('[data-testid="ui-details-modal"]')!);
    const overlay = window.getComputedStyle(document.querySelector('[data-testid="ui-details-overlay"]')!);
    const splitPanel = window.getComputedStyle(document.querySelector('[data-testid="ui-split-panel"]')!);
    const dropZone = window.getComputedStyle(document.querySelector('[data-testid="ui-drop-zone"]')!);
    const typingDot = window.getComputedStyle(document.querySelector('[data-testid="ui-typing-indicator"] span')!);
    const runButton = window.getComputedStyle(document.querySelector('[data-testid="ui-run-button"]')!);
    const runButtonBefore = window.getComputedStyle(
      document.querySelector('[data-testid="ui-run-button"]')!,
      '::before',
    );

    return {
      tokenTabOpen: root.getPropertyValue('--vc-animation-tab-open').trim(),
      tokenTabClose: root.getPropertyValue('--vc-animation-tab-close').trim(),
      tokenPopover: root.getPropertyValue('--vc-animation-popover').trim(),
      tokenModal: root.getPropertyValue('--vc-animation-modal').trim(),
      tokenSplit: root.getPropertyValue('--vc-animation-split-panel').trim(),
      tokenDropZone: root.getPropertyValue('--vc-animation-drop-zone').trim(),
      tokenTyping: root.getPropertyValue('--vc-animation-typing').trim(),
      tokenRunStop: root.getPropertyValue('--vc-run-stop-bg').trim().toLowerCase(),
      tabOpenAnimationName: tabOpen.animationName,
      tabOpenAnimationDuration: tabOpen.animationDuration,
      tabClosingAnimationName: tabClosing.animationName,
      tabClosingAnimationDuration: tabClosing.animationDuration,
      popoverAnimationName: popover.animationName,
      popoverAnimationDuration: popover.animationDuration,
      modalAnimationName: modal.animationName,
      modalAnimationDuration: modal.animationDuration,
      overlayAnimationName: overlay.animationName,
      overlayAnimationDuration: overlay.animationDuration,
      splitTransitionDuration: splitPanel.transitionDuration,
      splitTransitionProperty: splitPanel.transitionProperty,
      dropZoneAnimationName: dropZone.animationName,
      dropZoneAnimationDuration: dropZone.animationDuration,
      typingAnimationName: typingDot.animationName,
      typingAnimationDuration: typingDot.animationDuration,
      runButtonBackground: runButton.backgroundColor,
      runButtonColor: runButton.color,
      runButtonBeforeContent: runButtonBefore.content,
      runButtonBeforeWidth: runButtonBefore.width,
      runButtonBeforeAnimationName: runButtonBefore.animationName,
    };
  });

  expect(details.tokenTabOpen).toBe('200ms');
  expect(details.tokenTabClose).toBe('150ms');
  expect(details.tokenPopover).toBe('150ms');
  expect(details.tokenModal).toBe('200ms');
  expect(details.tokenSplit).toBe('250ms ease-out');
  expect(details.tokenDropZone).toBe('100ms');
  expect(details.tokenTyping).toBe('1.4s');
  expect(details.tokenRunStop).toBe('#f85149');
  expect(details.tabOpenAnimationName).toBe('vc-tab-slide-in');
  expect(details.tabOpenAnimationDuration).toBe('0.2s');
  expect(details.tabClosingAnimationName).toBe('vc-tab-fade-out');
  expect(details.tabClosingAnimationDuration).toBe('0.15s');
  expect(details.popoverAnimationName).toBe('vc-popover-in');
  expect(details.popoverAnimationDuration).toBe('0.15s');
  expect(details.modalAnimationName).toBe('vc-modal-in');
  expect(details.modalAnimationDuration).toBe('0.2s');
  expect(details.overlayAnimationName).toBe('vc-modal-backdrop-in');
  expect(details.overlayAnimationDuration).toBe('0.2s');
  expect(details.splitTransitionProperty).toContain('flex-basis');
  expect(details.splitTransitionDuration).toContain('0.25s');
  expect(details.dropZoneAnimationName).toBe('vc-drop-zone-in');
  expect(details.dropZoneAnimationDuration).toBe('0.1s');
  expect(details.typingAnimationName).toBe('vc-typing-dot');
  expect(details.typingAnimationDuration).toBe('1.4s');
  expect(details.runButtonBackground).toBe('rgb(248, 81, 73)');
  expect(details.runButtonColor).toBe('rgb(255, 255, 255)');
  expect(details.runButtonBeforeContent).toBe('""');
  expect(details.runButtonBeforeWidth).toBe('14px');
  expect(details.runButtonBeforeAnimationName).toBe('vc-button-spinner');
}

async function expectButtonStates(page: Page) {
  const details = await page.locator('[data-testid="ui-details-fixture"]').evaluate(() => {
    const root = window.getComputedStyle(document.documentElement);
    const plain = window.getComputedStyle(document.querySelector('[data-testid="ui-details-button"]')!);
    const solid = window.getComputedStyle(document.querySelector('[data-testid="ui-button-solid"]')!);
    const disabled = window.getComputedStyle(document.querySelector('[data-testid="ui-button-disabled"]')!);
    const loading = window.getComputedStyle(document.querySelector('[data-testid="ui-button-loading"]')!);
    const loadingBefore = window.getComputedStyle(
      document.querySelector('[data-testid="ui-button-loading"]')!,
      '::before',
    );
    const loadingIcon = window.getComputedStyle(document.querySelector('[data-testid="ui-button-loading-icon"]')!);

    return {
      tokenDefault: root.getPropertyValue('--vc-button-bg').trim(),
      tokenSolid: root.getPropertyValue('--vc-button-solid-bg').trim().toLowerCase(),
      tokenHover: root.getPropertyValue('--vc-button-hover-bg').trim().toLowerCase(),
      tokenActive: root.getPropertyValue('--vc-button-active-bg').trim().toLowerCase(),
      tokenDisabledOpacity: root.getPropertyValue('--vc-button-disabled-opacity').trim(),
      tokenSpinnerSize: root.getPropertyValue('--vc-button-loading-spinner-size').trim(),
      plainBackground: plain.backgroundColor,
      solidBackground: solid.backgroundColor,
      disabledOpacity: disabled.opacity,
      disabledCursor: disabled.cursor,
      loadingCursor: loading.cursor,
      loadingBeforeContent: loadingBefore.content,
      loadingBeforeWidth: loadingBefore.width,
      loadingBeforeHeight: loadingBefore.height,
      loadingBeforeBorderRadius: loadingBefore.borderRadius,
      loadingBeforeAnimationName: loadingBefore.animationName,
      loadingIconOpacity: loadingIcon.opacity,
    };
  });

  expect(details.tokenDefault).toBe('transparent');
  expect(details.tokenSolid).toBe('#1a2030');
  expect(details.tokenHover).toBe('#2b3245');
  expect(details.tokenActive).toBe('#3b4358');
  expect(details.tokenDisabledOpacity).toBe('0.4');
  expect(details.tokenSpinnerSize).toBe('14px');
  expect(details.plainBackground).toBe('rgba(0, 0, 0, 0)');
  expect(details.solidBackground).toBe('rgb(26, 32, 48)');
  expect(details.disabledOpacity).toBe('0.4');
  expect(details.disabledCursor).toBe('not-allowed');
  expect(details.loadingCursor).toBe('progress');
  expect(details.loadingBeforeContent).toBe('""');
  expect(details.loadingBeforeWidth).toBe('14px');
  expect(details.loadingBeforeHeight).toBe('14px');
  expect(details.loadingBeforeBorderRadius).toBe('9999px');
  expect(details.loadingBeforeAnimationName).toBe('vc-button-spinner');
  expect(details.loadingIconOpacity).toBe('0');

  await page.getByTestId('ui-button-hover').hover();
  await expect(page.getByTestId('ui-button-hover')).toHaveCSS('background-color', 'rgb(43, 50, 69)');

  const activeButton = page.getByTestId('ui-button-active');
  const box = await activeButton.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await expect(activeButton).toHaveCSS('background-color', 'rgb(59, 67, 88)');
  await page.mouse.up();
}

function expectThemeDetails(details: Awaited<ReturnType<typeof readUiDetails>>) {
  expect(details).toMatchObject({
    themeApp: '#0a0f1c',
    themePanel: '#0e1525',
    themeCard: '#1a2030',
    themeHover: '#2b3245',
    themeBorderSubtle: '#1a2030',
    themeBorderVisible: '#2b3245',
    themeTextPrimary: '#f5f9fc',
    themeTextSecondary: '#c2c8cc',
    themeTextMuted: '#6e7681',
    themeAiStart: '#7b61ff',
    themeAiEnd: '#ff6b9d',
    themeSuccess: '#3fb950',
    themeAction: '#0099ff',
    themeOrange: '#f26207',
    themeError: '#f85149',
    themeWarning: '#d29922',
    bodyBackground: 'rgb(10, 15, 28)',
    bodyColor: 'rgb(245, 249, 252)',
    cardBackground: 'rgb(26, 32, 48)',
    cardColor: 'rgb(245, 249, 252)',
    cardBorderColor: 'rgb(43, 50, 69)',
  });
  expect(['#0a0f1c', 'var(--vc-ide-bg-app)']).toContain(details.boltDepth1);
  expect(['#0e1525', 'var(--vc-ide-bg-panel)']).toContain(details.boltDepth2);
  expect(['#1a2030', 'var(--vc-ide-bg-card)']).toContain(details.boltDepth3);
  expect(['#f5f9fc', 'var(--vc-ide-text-primary)']).toContain(details.boltTextPrimary);
}

function expectUiDetails(details: Awaited<ReturnType<typeof readUiDetails>>) {
  expect(details.radiusButton).toBe('4px');
  expect(details.radiusInput).toBe('6px');
  expect(details.radiusCard).toBe('6px');
  expect(details.radiusModal).toBe('8px');
  expect(details.radiusPopover).toBe('12px');
  expect(details.shadowSm).toBe('0 1px 2px rgb(0 4 20 / 0.4)');
  expect(details.shadowMd).toBe('0 4px 12px rgb(0 4 20 / 0.5)');
  expect(details.shadowLg).toBe('0 12px 32px rgb(0 4 20 / 0.6)');
  expect(details.shadowXl).toBe('0 24px 64px rgb(0 4 20 / 0.7)');
  expect(details.transitionHover).toBe('150ms ease-out');
  expect(details.transitionPanel).toBe('200ms cubic-bezier(0.2, 0, 0, 1)');
  expect(details.transitionPopover).toBe('100ms ease-out');
  expect(details.focusRing).toBe('#0099ff');
  expect(details.tooltipBg).toBe('#0e1525');
  expect(details.tooltipBorder).toBe('#2b3245');
  expect(details.tooltipDelay).toBe('500ms');
  expect(details.scrollbarSize).toBe('10px');
  expect(details.buttonBgToken).toBe('transparent');
  expect(details.buttonSolidBgToken).toBe('#1a2030');
  expect(details.buttonHoverBgToken).toBe('#2b3245');
  expect(details.buttonActiveBgToken).toBe('#3b4358');
  expect(details.buttonDisabledOpacityToken).toBe('0.4');
  expect(details.buttonLoadingSpinnerSizeToken).toBe('14px');
  expect(details.buttonRadius).toBe('4px');
  expect(details.buttonTransitionDuration).toContain('0.15s');
  expect(details.buttonTransitionTiming).toContain('ease-out');
  expect(details.inputRadius).toBe('6px');
  expect(details.cardRadius).toBe('6px');
  expect(details.cardShadow).toBe('rgba(0, 4, 20, 0.5) 0px 4px 12px 0px');
  expect(details.modalRadius).toBe('8px');
  expect(details.modalShadow).toBe('rgba(0, 4, 20, 0.7) 0px 24px 64px 0px');
  expect(details.popoverRadius).toBe('12px');
  expect(details.popoverShadow).toBe('rgba(0, 4, 20, 0.7) 0px 24px 64px 0px');
  expect(details.popoverTransitionDuration).toContain('0.1s');
  expect(details.overlayBackdrop).toContain('blur(12px)');
  expect(details.overlayBackground).toBe('rgba(26, 32, 48, 0.85)');
  expect(details.tooltipBackground).toBe('rgb(14, 21, 37)');
  expect(details.tooltipBorderColor).toBe('rgb(43, 50, 69)');
  expect(details.tooltipFontSize).toBe('11px');
  expect(details.tooltipArrowFill).toBe('rgb(14, 21, 37)');
  expect(details.iconWidth).toBe('16px');
  expect(details.iconHeight).toBe('16px');
  expect(details.iconStrokeWidth).toBe('1.5px');
  expect(details.scrollbarWidth).toBe('10px');
  expect(details.scrollbarHeight).toBe('10px');
}

test('public platform applies section 10 color theme globally', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await injectUiDetailsFixture(page);
  expectThemeDetails(await readUiDetails(page));
});

test('admin console applies section 10 color theme globally', async ({ page }) => {
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await injectUiDetailsFixture(page);
  expectThemeDetails(await readUiDetails(page));
});

test('public platform applies section 12 UI detail tokens', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await injectUiDetailsFixture(page);
  expectUiDetails(await readUiDetails(page));
});

test('public platform keeps agent message context popovers constrained', async ({ page }) => {
  await mountAgentMessageContextDocument(page);

  for (const viewport of [
    { label: 'desktop', width: 1280, height: 720 },
    { label: 'tablet', width: 1024, height: 768 },
    { label: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await injectAgentMessageContextFixture(page);
    await expect(page.getByRole('button', { name: 'Show agent message context' })).toBeVisible();
    expectAgentMessageContextDetails(await readAgentMessageContextDetails(page), viewport.label);
  }
});

test('public platform keeps IDE floating menus constrained', async ({ page }) => {
  for (const viewport of [
    { label: 'desktop', width: 1280, height: 720 },
    { label: 'tablet', width: 820, height: 1180 },
    { label: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mountFloatingSurfacesDocument(page);
    expectFloatingSurfacesConstrained(await readFloatingSurfaceDetails(page), viewport.label);
  }
});

test('admin console applies section 12 UI detail tokens', async ({ page }) => {
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await injectUiDetailsFixture(page);
  expectUiDetails(await readUiDetails(page));
});

test('public platform applies section 13 button states', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await injectUiDetailsFixture(page);
  await expectButtonStates(page);
});

test('admin console applies section 13 button states', async ({ page }) => {
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await injectUiDetailsFixture(page);
  await expectButtonStates(page);
});

test('public platform applies section 14 animation system', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await injectUiDetailsFixture(page);
  await expectAnimationDetails(page);
});

test('admin console applies section 14 animation system', async ({ page }) => {
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await injectUiDetailsFixture(page);
  await expectAnimationDetails(page);
});

test('public platform applies section 15 accessibility system', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await injectUiDetailsFixture(page);
  await expectAccessibilityDetails(page);
});

test('admin console applies section 15 accessibility system', async ({ page }) => {
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await injectUiDetailsFixture(page);
  await expectAccessibilityDetails(page);
});

test('public platform applies section 15 reduced motion preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await injectUiDetailsFixture(page);
  await expectReducedMotionDetails(page);
});

test('admin console applies section 15 reduced motion preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await injectUiDetailsFixture(page);
  await expectReducedMotionDetails(page);
});
