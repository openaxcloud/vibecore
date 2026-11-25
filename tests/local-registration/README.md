# Local registration OAuth draft test

Use a clean checkout with workspace dependencies installed. Start these processes from the repository root in separate terminals. The web app, API, and Google double use loopback ports 19871, 19872, and 19873. The API uses an in-memory store and dummy provider credentials.

```sh
env -i PATH="$PATH" HOME=/tmp NODE_ENV=test node_modules/.bin/tsx tests/local-registration/provider.mts
```

```sh
env -i PATH="$PATH" HOME=/tmp VITE_DEV_HOST=127.0.0.1 VITE_DEV_PORT=19871 VITE_STRICT_PORT=true SAAS_API_URL=http://127.0.0.1:19872 node_modules/.bin/react-router dev
```

```sh
node tests/local-registration/oauth-draft.cjs
```

Set CHROMIUM_PATH to use a locally installed Chromium executable. Each case uses a fresh browser context. The script compares the complete composer value, inspects the OAuth return cookie and provider request, verifies the authenticated test identity, and checks for automatic project submissions. The fragment entry supports ideas whose encoded query would exceed the HTTP request-line limit. Stop both servers after the run.
