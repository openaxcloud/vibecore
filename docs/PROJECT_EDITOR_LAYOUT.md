# Project Editor layout

The Project Editor uses the same three-level layout vocabulary as the Replit
editor:

- A **Window** is one browser tab. A project can own several independent
  Windows, selected with the `window` URL parameter.
- A **Pane** is a resizable section inside a Window. Panes can be split
  horizontally or vertically, maximized, moved to a floating frame, and docked
  back into their exact former tree position.
- A **Tab** belongs to exactly one Pane and contains exactly one tool. Tabs can
  be reordered or moved between Panes. Editor tabs keep their own file path;
  selecting a file in one Pane must not replace the document in another.

`Workspace` is reserved for the organizational container. The editing surface
is called **Project Editor** in user-facing copy.

## Controls

- The left Tools dock opens frequently used tools. **All tools** opens the
  searchable canonical tool catalogue.
- The active Pane's `…` menu groups Window, Pane, and Tab actions. It supports
  opening the active Tab in a new Window, horizontal/vertical splits,
  float/dock, maximize/restore, moving the active Tab, pinning, and close
  operations.
- The project name opens Spotlight. The Resources control beside it reports
  live CPU, RAM, and storage telemetry when the backend supplies it; missing
  telemetry is reported as unavailable rather than estimated.

Files and Logs are ordinary Tabs. The former parallel Library/right-panel shell
must not be reintroduced. The Agent and pinned terminal remain deliberate docks
around the Pane tree so the existing Bolt workflows stay available.

## Persistence and responsive behavior

The canonical layout is stored in the project IDE memory envelope. It includes
every Window's Pane tree, split ratios, active Pane/Tab, floating bounds, and
the origin required to dock a floating Pane exactly where it came from.

Desktop renders the full Pane tree. Tablet and mobile project the focused Pane
from that same canonical Window rather than creating a second layout model.
Window/Panes/Tabs therefore persist when moving between screen sizes. Touch
targets remain at least 44 px, floating bounds are clamped to the viewport, and
keyboard actions are available for moving and resizing a floating Pane.

## Validation

The reducer and persistence tests cover normalization, splits, ratios,
move/reorder, float/dock, bounds, multi-Window isolation, and file-specific
editor tabs. Browser evidence must additionally prove:

1. horizontal and vertical split geometry plus divider resizing;
2. one Tab moved between Panes without duplication;
3. a Pane floated, keyboard-moved/resized, and docked back into the same tree;
4. a second browser Window with an independent layout and preserved active Tab;
5. Resources, Spotlight, All tools, reload persistence, and no horizontal
   overflow;
6. real web, tablet, and mobile captures.

Evidence for the July 2026 implementation lives in
`docs/ui-ux-evidence/2026-07-15/replit-layout/`. Captures are reviewed before
commit or push.
