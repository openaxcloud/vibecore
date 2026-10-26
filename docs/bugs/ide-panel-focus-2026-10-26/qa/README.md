# IDE local responsive audit — baseline main 798fa0f25

This is local QA against a compiled build, not authenticated production QA. The API, PostgreSQL, Redis, accounts and project files are isolated fixtures. Source and build manifests remain in `/tmp/ide-focus-qa`; their hashes and exact results are recorded in `receipt.json`.

| Recipe                         | Coverage                                                                                                   | Result                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Settled panel matrix           | Files, Editor, Problems, Shell, Webview, Git, Publish, Database, Secrets at 320 / 390 / 820 / 1440 CSS px  | 4 cases passed; 36 visits, page/surface bounds and keyboard target |
| Git loaded complement          | Waits for real branch control after Git-specific loader, same four widths                                  | 4 cases passed                                                     |
| Database read failure/recovery | Synthetic GET503 maintained until explicit Retry, then real isolated GET200, all four widths               | 4 cases passed                                                     |
| Native browser zoom200%        | Chromium default zoom2; outer1440px, inner720CSSpx; six panels, empty tab search, keyboard Escape          | 1 case passed; CDP independently reports zoom2                     |
| Git keyboard/scroll/cancel     | Branch menu Enter/Escape restores focus; scroll to Discard; cancel dialog; zero mutation POST, four widths | 4 cases passed                                                     |

Every final recipe uses zero retries. The native zoom screenshot uses CDP capture without clipping because Playwright's screenshot helper truncated this native zoom mode. No CSS zoom or DPR emulation is represented as browser zoom.

The initial shell matrix sampled some loading screens; the later matrix waits for PanelLoading to disappear, and Git has its own additional ready-control check. The first one-shot503 recipe was non-probative: automatic subsequent reads recovered before its alert assertion (four failures). The final recipe keeps the synthetic outage active until the user chooses Retry. These harness corrections did not change product code or weaken assertions.

Selected screenshots show only disposable fixtures. No create-database, provider publication, external Git connection, DNS change or real project mutation was attempted. These checks cover the listed states only, not every panel action, dark theme, external provider, authenticated production or hardware Safari. The separate parent regression addresses the intermittent mobile tabs focus defect.

The final native zoom recipe traverses Files, Editor, Git, Publish, Database and Secrets. Files/Editor have populated imported fixtures; Database and Secrets are empty. Database recovery is the explicit injected-error test. Terminal/runtime providers were not started.

## Final focus correction build

The final reviewed helper was rebuilt successfully after one earlier build was deliberately stopped for a review correction. No source changed during the final build. A single native200% zoom recipe then passed again: six panels, empty tab search and Escape, zero retries,34.9seconds. `final-zoom-receipt.json` identifies the exact uncommitted product-file hashes; the parent records the eventual commit and runs the separate focus handoff regressions. The17 baseline cases above remain explicitly baseline results.
