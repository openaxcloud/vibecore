# Main d090 integration — Account and payment recovery

Local compiled integration build at `http://127.0.0.1:7099`, synthetic API3199. Parent incorporated main/PR791 (`d090`) and preserved PR788 before building. Worktree HEAD observed during this run: `3084fcf74`. These results are local integration evidence, not production/deployment acceptance.

## Results

- **88 viewport observations:** Data deletion dialog and Connected accounts ×11 viewports ×FR/EN ×light/dark. Exact dimensions:320×740,360×800,390×844,844×390,768×1024,820×1180,1024×768,1280×800,1440×900,1920×1080,2560×1440.
- **8 interaction groups:** for every language/theme combination, initial dialog focus, associated description, Tab containment, unfinished confirmation preserved through resizing, disabled deletion confirmation visible after scroll, Escape focus restoration, Cancel focus restoration, reopened draft cleared; then navigation to Connected accounts and native Back to Data with no residual dialog. No deletion was submitted.
- **4 rejected payment saves:** two successive HTTP503 responses in each language FR/EN. Same email draft survives; alert receives focus and is inside the viewport after each failure; Tab moves to portal button, then email input. Prior resize320→820→390→320 preserves the draft. The portal button is focused only, never activated.
- No JavaScript page errors recorded in either harness. All browser processes closed after completion.

`receipt.json` contains the Account matrix and8 interaction groups. `interactions.json` contains payment requests/status/focus assertions. Logs are `account.txt` and `payment.txt`. Dialog captures are FR/light at320,844landscape,1440. Payment captures occur after subsequent Tab navigation and therefore show the email field focused, not the earlier alert-focus assertion.

The API fixture rejects all mutations with503; no real data or external service was accessed. Account matrix performs no mutation; four local payment POSTs were rejected. Successful payment-email saving remains covered only by the earlier unit test. No payment/upgrade geometry matrix was repeated, because its route source was unchanged. The640×400 additional dialog check is CSS reflow only, **not native zoom**; native200% evidence exists separately.

These tests exercise modal keyboard behavior after the PR788 integration, but do not establish all `useKeybindings` behavior across the IDE. No IDE was opened. Virtual keyboards, production authentication, assistive-technology announcements, Safari and Firefox are untested.

## Reproduce

From the repository root, with installed Playwright and `/usr/bin/chromium`, and an app configured for the synthetic API contracts:

```sh
UI_BASE_URL=http://127.0.0.1:7099 UI_EVIDENCE_DIR=/tmp/main-d090-account-payment node docs/bugs/user-area-2026-10-25/integration-main-d090/account-payment/account.cjs
UI_BASE_URL=http://127.0.0.1:7099 UI_EVIDENCE_DIR=/tmp/main-d090-account-payment node docs/bugs/user-area-2026-10-25/integration-main-d090/account-payment/payment.cjs
```

The scripts use synthetic session cookie `vc_session=synthetic-ui-fixture`; required GET fixtures cover authenticated user/organization, account deletion status and account connections. Third-party browser requests are blocked. No source, fixture, index, commit or push change was performed for this integration run.
