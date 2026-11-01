# Mobile Agent and notice integration — 2026-11-01

Assembly base: `1ddbc51efcae09e7c71316e5d6436ad2b08443f5`.
Sources: PR #881 at `4692759e0946789104cb9df9770e51adeb30f256` and its
toast follow-up at `2117f15bcfde4ea264d52dddd6e2ac722bbc3a05`.
The latter contains the former. No source PR is closed by this assembly.

The only product overlap with main is the assistant-message catalogue. Both
the provider missing-credentials copy and the mobile actions-without-report
copy are retained. The bug index is regenerated from all 611 entries.
Backup provenance, database transport, budget and provider-routing contracts
from #882 remain unchanged.

## Local checks on the assembled source

- Chat: 184 files, 1,503 tests passed, no omitted test. This run is after the
  final toast animation-clock correction.
- Root and route graph: 38 tests passed.
- Index regeneration, migration safety and scroll placement: 23 tests passed.
- Production web/SSR build, web typecheck and changed-product lint: exit 0.
- Compiled Chromium navigation: six cases passed at 390/393/430 pixels in
  both directions. The same notification DOM, open details, focus, unique IDs
  and timer are retained. Removal occurred in 6.06–6.10 seconds including
  transitions. No duplicate or resurrection after dismissal was observed.
- Compiled Chromium geometry: three cases passed, each also exercising a
  landscape viewport and reduced-height keyboard surrogate. The reading anchor
  moved 0 px when the notice appeared in portrait at scrollTop=500.

Both compiled runners then exited 1 because their configured WebKit executable
was absent in this environment. Their Chromium receipts are preserved, but
this is **not** a successful local two-engine run. No download or replacement
of a browser executable was attempted. Source-branch WebKit receipts are
historical evidence, not the combined-tree result. CI must validate this tree.

The assembly uses the unchanged frozen-lockfile dependency installation from
the validated #882 workspace; no dependency version or generated Prisma client
is changed. Source files and build outputs are isolated. Existing binary
documentation is preserved without rewriting it.

## Boundaries

The compiled server uses an isolated fixture rejecting writes; browser tests
block external requests and WebSockets. No Aster data, paid model call, budget
activation, provider credential or production state is used.

Undo exercises a synthetic callback, not file restoration. The 0 px anchor
claim does not cover orientation or navigation. Outside Agent the notice is
still a global overlay. Very short landscape leaves about 29 px of reading
height. No physical iPhone, native keyboard, browser chrome or true safe-area
measurement is claimed. Deployment and authenticated recipe remain separate.
