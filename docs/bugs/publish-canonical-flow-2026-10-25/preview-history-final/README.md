# Final targeted Preview/Publish validation

Compiled product: `4a1bf49d6f8ef3553f376393d632f4e92dcbadba`. Six targeted cases ran once, with two workers and zero retries. Exact results, source/test hashes and provenance are in the receipt. The API process was launched from `5fbbcd07`; its API source is byte-identical to the final web revision. The final test hash includes a lint-only blank line not yet present in the compiled product commit.

The browser Back case preserves its original assertions. The Publish test now waits for the desktop deployment host after resizing before reopening Rollback, and checks the dialog heading before capturing it. A controlled counterproof on the previous build demonstrated the outgoing mobile dialog opening and then being destroyed by the desktop remount. The counterproof receipt separately records two initial non-probative attempts with an incorrect diagnostic selector.

Publication, cancel and rollback requests were intercepted before the provider path, using synthetic deployment history and disposable local accounts. No real deployment, DNS mutation or production validation is claimed. Local Chromium154 is not CI Chromium147. Previous receipts remain intact; this targeted run does not replace the earlier full19-case run. Raw logs and traces remain private under `/tmp`.
