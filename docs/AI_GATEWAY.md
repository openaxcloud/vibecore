# AI Gateway And Coding Agent

## Scope

The SaaS AI path is split into two production boundaries:

- `services/ai-gateway`: provider routing, model catalog, streaming, retries, fallback, health checks, token estimates, and cost estimates.
- `services/api`: authenticated coding-agent tool execution, RBAC, audit logs, quotas, path normalization, destructive-operation snapshots, and persistence in PostgreSQL through `PrismaApiStore`.

Bolt UI and the IDE runtime stay intact. AI file operations go through the runtime API/workspace agent path, not direct filesystem or WebContainer access.

## Providers

`services/ai-gateway/src/app.ts` builds the Fastify app for testable route wiring. `services/ai-gateway/src/server.ts` only starts the listener.

`services/ai-gateway/src/gateway.ts` supports:

- OpenAI-compatible providers: OpenAI, OpenRouter, Mistral, Groq, xAI.
- Native providers: Anthropic Messages API, Google Gemini generate/stream APIs, Ollama local `/api/chat`.
- Token/cost accounting uses `gpt-tokenizer` BPE counts before quota and ledger writes; it falls back to `length / 4` only if the tokenizer import fails.

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
- `POST /v1/agent-runs`

`POST /chat/completions` accepts `{ messages, provider, model, plan, stream }`. Streaming responses are emitted as server-sent `data:` events.

## Multi-Agent Executor

`POST /v1/agent-runs` executes E-Code specialist lanes through the same provider router as chat completions. The app enables this path with:

- `ECODE_PARALLEL_SUBAGENTS_ENABLED=1`
- `ECODE_SUBAGENT_EXECUTOR_URL=http://127.0.0.1:3030` locally, or a private production AI gateway URL
- `ECODE_SUBAGENT_EXECUTOR_TOKEN=<shared secret>` in production
- `ECODE_SUBAGENT_EXECUTOR_RATE_LIMIT_PER_MINUTE=30` to cap agent runs per organization or client IP
- `REDIS_URL=rediss://...` in production so rate limits are shared across AI gateway replicas
- `ECODE_SUBAGENT_EXECUTOR_RATE_LIMIT_REDIS_PREFIX=vibecore` to isolate Redis keys per environment

The endpoint accepts `{ mode: "parallel-subagents", roles, messages, plan?, provider?, model?, maxTokens? }`, runs the requested roles concurrently, and returns `{ runId, status, results }`. Each result includes the role id, status, summary, files, risks, and verification notes. If one role fails, the run returns `partial` with the failed role recorded instead of hiding the failure.

When `ECODE_SUBAGENT_EXECUTOR_TOKEN` is configured on the gateway, `/v1/agent-runs` requires `Authorization: Bearer <token>`. The app sends this header automatically when the same variable is configured in its server environment.
The gateway also rate-limits `/v1/agent-runs` per `organizationId` when present, otherwise per client IP, and returns `429 AGENT_RUN_RATE_LIMITED` with rate-limit headers. When `REDIS_URL` is configured, the limiter uses an atomic Redis `INCR`/`PEXPIRE` window shared by all replicas. Without `REDIS_URL`, it falls back to an in-memory limiter for local development only; that mode is not sufficient for multi-replica production.
Agent-run payloads are bounded before execution: 5 unique roles maximum, 30 chat messages maximum, 200,000 message characters maximum, and `maxTokens` is capped at 4,000 per role.

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
- Multi-agent execution can be restricted with `ECODE_SUBAGENT_EXECUTOR_TOKEN`; production should also keep the endpoint on a private service network.
- Multi-agent execution is rate-limited at the gateway with `ECODE_SUBAGENT_EXECUTOR_RATE_LIMIT_PER_MINUTE`; production requires `REDIS_URL` so the limit is distributed across replicas.
- Agent-run request size and token limits are enforced before provider calls.
- Token counts for AI quota/cost accounting are BPE counts from `gpt-tokenizer` in both the API quota preflight and gateway usage reporting.

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
- BPE token counting with known-token assertions.
- Parallel agent-run execution and payload validation.
- HTTP route behavior for agent-run auth, memory and distributed rate limiting, bad payloads, and success responses.
- Runtime-only file modification through the workspace agent.
- RBAC on project access through existing API guards.
- Path traversal rejection.
- Dangerous command blocklist.
- Snapshot before destructive AI tool calls.
- PostgreSQL migration and Prisma persistence tests.
