# README exact locator versus Git badge — read-only diagnostic

Verified repository sources on PR834 head64ea632af8775c0248d32a96c6a42e59887c70dc via GitHub file reads: the test uses getByText(name,{exact:true}).and(.bolt-file-tree-name).filter({visible:true}); FileTreeName contains only the name; GitStatusPill is in a sibling div, not inside that span. Current local sources have the same relationship.

Chromium standalone synthetic DOM, no application server/backend/client data: three falsifiable cases in probe.cjs/receipt.json.
- No badge: locator1, visible, click reaches row.
- Actual sibling badge topology, including M and screenreader Modified text: locator1, visible, click reaches row.
- Deliberately wrong nested badge topology: locator0 although name span remains visible. Negative control confirms exact-text sensitivity only if badge is inside name.

Conclusion: Git badge exclusion is NOT reproduced for actual PR834 markup. Conditional fragility demonstrated only for a topology the inspected source does not render. No evidence that this caused CI834; that job failed later at .cm-content after archive200, not at README click.

No repository/test/assertion modified, no Git action, no workflow rerun, no artifact downloaded. Browser closed normally. This DOM probe does not certify rendered app or route lifecycle.

## Distinct incident: PR840 README row selector

PR840 head10263a1375432737ce4d008835e80e8f77d166cd verified remotely: tests/e2e/ide-editor-focus-handoff.spec.ts:230–234 selects `.bolt-file-tree-node` visible with `hasText: /^README\.md$/`, i.e. the whole row, NOT FileTreeName.

probe-two-locators.cjs / receipt-two-locators.json compare both exact selectors on the SAME synthetic DOM. With the actual sibling Git badge topology, the README name remains visible and clickable through the834 span locator (count1), but the840 whole-row exact regex excludes it (count0). Without badge both count1. This establishes conditional test fragility for840; it does NOT establish that the failed840 CI actually had a Git badge. Trace/screenshot/DOM at failure is still needed. No assertion was changed in the repository; no CI cause or product fix is claimed.
