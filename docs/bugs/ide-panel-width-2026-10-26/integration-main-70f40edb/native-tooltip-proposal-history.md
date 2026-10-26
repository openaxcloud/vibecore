# Native tooltip reinjection — unapplied proposal

Base: PR811 fd5a063a98a99f5457e76f6f75f3f6d60e5d1577. Repository source unchanged.

`proposed.patch` changes only BaseChat.tsx around lines 5703 and 5758: respect Radix/hidden markers before enrichment, remove obsolete native/global metadata and stash, observe those markers with the existing MutationObserver. No new observer, no FileTree changes. Reserved BaseChat owner coordination required before application.

`audit.cjs` executes the exact current/proposed enrichment effect with the actual GlobalTooltip and actual FileTree toolbar JSX in Chromium, synthetic local GET only. Both phases exit successfully: current title returns after childList during hover and focus, while the proposed title stays absent and one Radix tooltip remains. Accessible name and focused element preserved. Filename title, non-Radix Save contextual help/shortcut and locked custom tooltip unchanged. Marker-only transition to hidden also removes title. See receipt.json and before/proposed.png.

Initial audit.txt failure was a harness translation stub omitting interpolation; audit-final.txt uses interpolation-preserving stub. No product failure hidden.

Scope: mounted IDE enrichment effect, not full production browser delivery, native tooltip paint not screenshot-certifiable. FileTree outside this IDE effect retains its existing titles; removing its five titles is not needed for this reproduced reinjection and was not proposed. No tests/build/commit/push of repository; PR811 untouched.

## Title-only review correction
The proposed branch preserves `title` when no nonempty independent aria-label exists. This deliberately conservative rule avoids removing a title-only accessible name; such controls retain their title until their owner supplies an explicit label. Actual FileTree targets already have aria-label. Updated audit-title-only.txt exits0 and receipt.json proves both Radix and hidden title-only controls retain names while labeled controls remain fixed. The patch remains unapplied.
