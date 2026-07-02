/**
 * Keyboard "skip to content" link, shared by the marketing shell and the app
 * AppShell. Rendered as the first focusable element of the page: invisible and
 * out of the way until it receives keyboard focus, then shown as a small
 * floating pill. The target container must carry id="main-content" and
 * tabIndex={-1} so focus lands on it after activation.
 */
export function SkipLink({ targetId = 'main-content' }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="fixed left-4 top-4 z-[10000] -translate-y-24 rounded-lg border bg-bolt-elements-background-depth-2 px-4 py-2 text-sm font-medium text-bolt-elements-textPrimary shadow-md focus:translate-y-0"
      style={{ borderColor: 'var(--ecode-focus-ring)' }}
    >
      Skip to content
    </a>
  );
}
