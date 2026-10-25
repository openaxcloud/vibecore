# Legacy Publish E2E compatibility and contrast regression

Final product: `8b51f92ffebb1bb635d01bfc62601374f383cd5c`. The three legacy specs are included in the Chromium CI suite. Their original route assumptions failed on compiled `7e21b298`; migrating the navigation without weakening assertions revealed a real placeholder-contrast regression (light 7.12, dark 6.89, maximum 6). The managed form now reuses the established desktop placeholder tokens.

The final combined run includes all ten migrated cases and the nine canonical navigation/Publish cases. Dashboard account identity and tab geometry remain checked at 1440/1280 in both themes; placeholder ratios remain 4.5–6 and actual text greater than 2×; first-publication CTA is Publish without Republish at 1440/768/390. No test was skipped or retried.

See receipt for measurements, source/build hashes and qualification of controlled publication responses. No production, external deployment or DNS validation is claimed. Earlier receipts remain unchanged; raw logs/traces/session tokens stay outside Git.
