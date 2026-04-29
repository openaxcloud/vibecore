# AI Gateway And Coding Agent

## Scope

The SaaS AI path is split into two production boundaries:

- `services/ai-gateway`: provider routing, model catalog, streaming, retries, fallback, health checks, token estimates, and cost estimates.
- `services/api`: authenticated coding-agent tool execution, RBAC, audit logs, quotas, path normalization, destructive-operation snapshots, and persistence in PostgreSQL through `PrismaApiStore`.

Bolt UI and the IDE runtime stay intact. AI file operations go through the runtime API/workspace agent path, not direct filesystem or WebContainer access.

## Providers

`services/ai-gateway/src/gateway.ts` supports:

- OpenAI-compatible providers: OpenAI, OpenRouter, Mistral, Groq, xAI.
- Native providers: Anthropic Messages API, Google Gemini generate/stream APIs, Ollama local `/api/chat`.

Runtime environment variables:

- `OPENAI_API_KEY`, `OPENAI_BASE_URL`
- `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`
- `GOOGLE_GEMINI_API_KEY`, `GOOGLE_GEMINI_BASE_URL`
- `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`
- `MISTRAL_API_KEY`, `MISTRAL_BASE_URL`
- `GROQ_API_KEY`, `GROQ_BASE_URL`
- `XAI_API_KEY`, `XAI_BASE_URL`
- `OLLAMA_BASE_URL`
- `AI_FALLBACK_PROVIDERS=openrouter,groq`

Endpoints:

- `GET /health`
- `GET /providers/health`
- `GET /models?plan=business`
- `POST /chat/completions`

`POST /chat/completions` accepts `{ messages, provider, model, plan, stream }`. Streaming responses are emitted as server-sent `data:` events.

## Agent Tools

Tool endpoint:

`POST /projects/:projectId/ai/tools/:toolName`

Supported tools:

- `list_files`
- `read_file`
- `write_file`
- `create_file`
- `delete_file`
- `rename_file`
- `search_code`
- `apply_patch`
- `run_command`
- `get_terminal_output`
- `get_workspace_status`
- `get_preview_url`
- `list_ports`
- `create_snapshot`
- `restore_snapshot`
- `commit_to_git`
- `deploy_project`

The API validates project membership before every tool call. Read tools require workspace/project read permission. Mutating tools require write permission.

## Security Controls

- Paths are normalized and `..`, absolute traversal, and NUL segments are rejected.
- Tool inputs and outputs are redacted before audit persistence.
- Destructive tools create a `before-ai-change` snapshot before execution.
- Dangerous commands such as privileged shell operations, Docker/Kubernetes access, host shutdown, and pipe-to-shell installers return `AI_COMMAND_CONFIRMATION_REQUIRED`.
- Token quota is checked before chat completion.
- Provider keys remain inside `services/ai-gateway`; they are not returned to the frontend.
- The system prompt is built separately from user messages.

## Persistence

Prisma models used by the agent:

- `AiConversation`
- `AiMessage`
- `AiToolCall`
- `AiTokenUsage`
- `AiCostLedger`

Migration: `packages/database/prisma/migrations/0005_ai_cost_ledger/migration.sql`.

## Verification

Current coverage includes:

- Provider fallback.
- Streaming responses.
- Runtime-only file modification through the workspace agent.
- RBAC on project access through existing API guards.
- Path traversal rejection.
- Dangerous command blocklist.
- Snapshot before destructive AI tool calls.
- PostgreSQL migration and Prisma persistence tests.
