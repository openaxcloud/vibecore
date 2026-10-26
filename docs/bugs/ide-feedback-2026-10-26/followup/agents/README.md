# Optional terminal stream output — local UI evidence

Worktree /workspace/vibecore-ui-ide-feedback-next, base3d8059a3ad1fe8b540068ada09b5ed417ee0d169 (#807), four local UI/catalog/test files only. No commit/push/index/sharedtype/backend/retry change.

AssistantMessage retains the done annotation as opaque unknown UI data. Final agentExecution result metadata takes precedence; old/malformed fields never imply observed verification. Known outputState overrides task-finished label, including contradictory legacy complete status. Explicit interrupted output is shown stopped, without changing backend data. Emitted filenames are not applied files.

Only consensus.consolidated.agreedVerificationClaims:string[] is rendered, guarded and explicitly described as model claims without observed verification. Legacy acceptedVerification, wrong path and malformed mixed arrays are not consumed.

38 tests passed: AssistantMessage.i18n.spec.tsx20, agent-lane-state.spec.ts14, agent-003-consensus-rejete.spec.ts4. /tmp/agent-lanes-stream-tests.log. Four-file ESLint and diffcheck exit0. No full build/typecheck here; parent owns integration.

Chromium local executable /usr/bin/chromium:8 standalone actual AgentLaneSummary + AgentVerificationClaims cases FR/EN ×320/390/820/1440. Repository UnoCSS; no backend, nonlocal requests blocked. Tests44px targets, Tab/Enter open/close, resize preserving focus/disclosure, no document overflow, same mounted component short→119chars→long→JSON with changing optional metadata: height and scroll unchanged. Claims disclosure also opens/closes by keyboard. receipt.json/scripts/captures are final. Synthetic standalone shell only; state propagation/mismatch/final priority are actual AssistantMessage jsdom tests, not real backend orchestration or compiled full IDE evidence. Initial connection-refused was server startup timing before Vite ready; retried only after HTTP200, not a product failure.
