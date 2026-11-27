# Two-tab restore and static publication

From a disposable Linux checkout with the repository's locked dependencies installed and Prisma Client generated, run:

```sh
bash tests/local-restore-publication/run-local.sh
```

The test requires Chromium (override its path with `PLAYWRIGHT_CHROMIUM_EXECUTABLE`), OpenSSL, GNU coreutils, Docker and the locally cached `pgvector/pgvector:pg16` and `redis:7-alpine` images. The script builds the current web checkout, checks for occupied ports and creates a temporary database, Redis instance, agent directory and TLS identity. It discards inherited service credentials.

Two Chromium tabs share a synthetic project. One restores snapshot A while the second has C open. The second reopens the file, saves B through Monaco, checks the exact PUT and manifest acknowledgement, publishes B, then repeats the restore and republishes A. Each deployment must produce a fresh ID and serve the expected bytes and heading to a fresh anonymous browser context at the emitted URL. The scenario also checks whether the browser requested deletion of files in the active build directory.

The API, manager, workspace agent, worker, static build, preview proxy and browser are local processes. The Kubernetes CLI fixture supplies pod responses, and a loopback TLS listener fronts the proxy. The test covers version selection and publication without an external DNS zone, certificate or cluster. The scheduled dynamic Node/Kubernetes proof remains a separate test.

The workspace starts with a disposable cache entry as left by a stopped build. The project also contains a user directory with the historical build prefix and a binary file. The exported ZIP after restoring A, saving and publishing B, and restoring A again must have exactly the expected filenames and bytes. Builds run under `.cache/.vibecore-builds/` on the selected workspace PVC. A hard interruption can leave a copy there; no marker controls visibility of any user path.
