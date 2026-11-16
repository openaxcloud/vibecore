# Review correction: cookie compilation and host environment

This increment supersedes the production-build/development-serve description in the earlier connected-baseline report. No cookie policy or other product source changed.

## One supported compilation/serving mode

vite.config.ts:140 defines process.env.NODE_ENV from the compilation environment. Therefore setting development only when starting a previously production-built bundle was insufficient. The baseline now launches the existing React Router development server directly:

```sh
node_modules/.bin/react-router dev --mode development
```

Its allowlisted environment explicitly sets NODE_ENV=development, VITE_DEV_HOST=127.0.0.1, VITE_DEV_PORT=5173 and VITE_STRICT_PORT=true. Compilation and SSR execution happen in this same development process. The installed React Router CLI supports --mode and defaults dev to development; its source was inspected locally. No production bundle is reused and no cookie flag is overridden. The existing previewTenantCookie development branch remains responsible for HttpOnly, SameSite=Lax and omission of Domain on loopback. Production Secure-cookie behavior is unchanged. This proves configuration alignment, not actual browser acceptance of the cookie.

The installed Playwright package resolves Chromium to /home/agent/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome; that file is absent. No download or browser launch was attempted. Actual vc_preview acceptance and authenticated iframe rendering across the two HTTP loopback ports still await the compatible runner. This is not an observed browser failure.

## Explicit host process environment

Vite's config explicitly calls dotenv for .env.local and .env, and Vite additionally reads mode files. `assertNoLocalEnvFiles` now refuses any root .env or .env.* other than documentation *.example files, before cluster creation and again immediately before web startup. It reads only filenames. The check passed on this isolated checkout; only documentation examples were present. It does not silently remove or modify a user's file.

`baselineEnvironments` constructs new environment objects instead of spreading the launcher environment. Both child processes get PATH, a newly created private HOME/XDG_CONFIG_HOME/XDG_CACHE_HOME/TMPDIR, LANG, TZ, CI, HUSKY and provider-absent mode. The web additionally receives only its fixed local host/port, remote-runtime mode, relative runtime endpoint, loopback API URLs and the fresh bench tenant key. Playwright receives only its dedicated browser directory and baseline flag, then the two exact loopback origins. It receives no tenant key, kubeconfig, GitHub token, cloud profile, NODE_OPTIONS, proxy environment variable or provider credential. Neither process uses the caller's HOME or credential/config cache.

The workflow installs Chromium under the explicit RUNNER_TEMP/aster-playwright directory, which the launcher validates exactly before provisioning. That same path is passed to Playwright despite its isolated HOME. The existing .env refusal/provider checks and all cluster/event/ownership guards remain enabled. Actual API/manager/proxy workloads still receive only the bench manifest values and fresh local Secret, not the host environment.

This is environment minimization, NOT network isolation. No namespace/firewall/egress setting was changed or verified. Host application code can technically reach the runner network; no claim of an egress sandbox is made. The intended application destinations are the fixed loopback web/API/preview ports and cluster-internal manager/agent addresses. The browser's route policy is an additional browser-only restriction. No external integration is configured in the minimal web environment, and no application integration was invoked in this lot. Actual runtime network traffic remains unobserved until execution.

## Setup traffic versus application traffic

Future official setup can download checkout/actions, locked npm packages, the pinned kind/kubectl clients, pinned images, and Playwright/OS browser dependencies. These are setup downloads; they are not evidence of zero external traffic or of provider calls. The application phase is a synthetic npm fixture without dependencies; its existing install command uses --no-audit --no-fund. AI providers remain absent. No setup download, application server startup, cluster operation or remote action was performed for this correction.

Local verification: targeted lint exit0, recipe TypeScript exit0, 11 tests passed (2 environment, 1 manifest, 8 existing tenant-cookie). The filename-only guard passed against the actual checkout. Browser-cookie behavior and the complete connected baseline remain unexecuted. Earlier archives are preserved; apply this increment after connected-baseline patch3620849c.
