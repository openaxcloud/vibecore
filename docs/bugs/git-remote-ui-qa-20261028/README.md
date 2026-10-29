# Canonical Git remote UI browser evidence — 28 October 2026

Base commit `3170d2fe84005da78a23c6bdb22f13c60724ff35`, local candidate `GitProviderConnectPanel.tsx` SHA256 `ea7bceb1f9eee6e00f58a99bf096dc40a4d5c918c4cbb84056a5577fa7e32444`. Client and SSR build completed with exit0;3063 tracked product/package source hashes remained unchanged during build and tests. Parent added only bug documentation/index while QA ran.

Two browser cases passed on the first execution,11.8 seconds total, zero retries or skips, at viewport320 and1440px. Both used the canonical IDE URL `/projects/<fixture>/ide?panel=git` and real GitTab/connection components.

Measured behavior:
- Repository picker renders a synthetic repository returned by a controlled `/api/github-stats` GET. The Git status envelope is also a clearly controlled GET fixture.
- Double-click selection produces one pending `configure-remote` POST and disables the repository item.
- The browser holds that POST and returns a controlled503 without forwarding it to the BFF or provider. The error is visible after selection and stays within the viewport.
- Selecting again produces exactly the second POST, fulfilled with controlled200. The success toast and Git reload occur. This is UI response handling only; no Git origin was configured.
- Opening the custom URL form, editing its URL, focusing Close and pressing Enter closes it without a third mutation. Escape is not claimed: this inline dialog has no dedicated Escape handler.
- Repository and error bounds remain within each tested viewport; screenshots show the mobile panel scroll and readable error.

Local account/project/conversation fixtures were genuinely created in the isolated API/Postgres stack to reach the real shell. No real OAuth, GitHub account, remote repository, provider request, customer project, DNS mutation, paid resource or new persistent credential was used. Nonlocal browser requests and unrelated mutations were aborted. A controlled success must not be described as a real GitHub connection or push/pull validation.

Only curated screenshots and compact receipts are included; raw traces/API logs containing local session data are excluded. Own API/web processes stopped, ports5199/3018/55448/56388 closed, database/cache containers retained stopped. No unrelated service touched. No production-authenticated or Safari hardware validation.
