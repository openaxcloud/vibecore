# Mobile IDE Validation

This checklist tracks the production mobile IDE surface for Vibecore. The implementation keeps the existing Bolt IDE and adapts its real panels instead of adding standalone mock mobile screens.

## Responsive Rules

- Mobile shell: viewport width below `768px`, or any short landscape viewport below `500px` high.
- Tablet portrait shell: `768px` to `1024px` wide in portrait.
- Tablet landscape and desktop keep the full IDE shell.
- Runtime/workspace status stays in the bottom status bar. On compact shells it sits above the mobile tab bar.

## Real Surfaces

- Chat: existing project agent panel.
- Files: runtime-backed file tree through `workbenchStore.files`.
- Editor: CodeMirror mobile editor through `@vibecore/editor`.
- Terminal: real `TerminalTabs` and runtime panel state.
- Preview: real preview server state through `workbenchStore.previews` and `previewServerState`.
- Deploy/tools: real `ProjectIdeServicePanel`; deep links such as `?panel=database` load the existing authenticated IDE panel API.

## Validation Commands

- `pnpm exec tsc --noEmit --pretty false`
- `pnpm run lint`
- `pnpm --filter @vibecore/mobile test`
- `pnpm exec vitest run packages/editor/src/index.spec.ts --reporter=dot`
- `pnpm exec playwright test tests/e2e/responsive-ide.spec.ts --project=mobile`
- `pnpm exec playwright test tests/e2e/responsive-ide.spec.ts --project=tablet --project=chromium`
- `pnpm run build`

## Non-Goals

- Do not copy E-Code/Replit component names, routes, or mock endpoints into Vibecore.
- Do not replace the existing Bolt IDE.
- Do not introduce simulated backend data for mobile-only panels.
