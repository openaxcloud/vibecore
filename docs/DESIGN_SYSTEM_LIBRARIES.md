# Vibecore Design-System Libraries

Vibecore uses one primary accessible UI foundation across the public site and the IDE: Radix primitives wrapped by local components in `app/components/ui`.

## Installed Foundation

- `@radix-ui/react-select`: accessible select menus for provider, model, theme and settings pickers.
- `@radix-ui/react-toggle-group`: segmented controls for IDE panels, view modes and density controls.
- `@radix-ui/react-slider`: numeric controls for editor, terminal and theme tuning.
- `@radix-ui/react-avatar`: user and workspace identity surfaces with robust image fallback.

These additions complement the existing UI stack: Radix dialog/dropdown/tabs/switch, Headless UI, Framer Motion, CodeMirror, xterm, lucide and the current Vibecore CSS token system.

## Usage Rule

New site or IDE controls should import the local Vibecore wrappers rather than importing Radix primitives directly:

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui';
```

The wrappers are themed with `--bolt-elements-*` tokens so controls stay visible in both dark and light modes. Direct third-party styling is allowed only when a surface has a specific product requirement that the shared wrappers cannot satisfy.

## Acceptance Criteria

- Controls must be keyboard accessible.
- Controls must preserve contrast in `data-theme="dark"` and `data-theme="light"`.
- IDE surfaces should use compact sizing by default.
- Public marketing surfaces can layer additional motion or spacing, but should keep these primitives for menus, selectors and identity.
