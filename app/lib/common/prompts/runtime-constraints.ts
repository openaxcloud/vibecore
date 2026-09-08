/**
 * Runtime-aware <system_constraints> + <web_reference_instructions>
 * (BUG-AGENT-WEBCLONE-001).
 *
 * Production runs `VITE_RUNTIME_MODE=remote-kubernetes` (single-web.yaml): the
 * agent's actions execute in a workspace pod — node:24-alpine + bash, git, curl
 * — whose NetworkPolicy allows outbound HTTPS (443) to the public internet
 * (infra/kubernetes/workspaces-runtime/networkpolicies.yaml). Yet every prompt
 * still described WebContainer, « in-browser, no cloud VM ». Measured on
 * 2026-09-08: asked to clone volt-watt.com, the model answered « je tourne dans
 * WebContainer, aucun accès réseau sortant » and refused. The lie in the prompt
 * was the refusal. This module gives each prompt the constraints of the runtime
 * it really has, and one shared rule set for the observed `<web_reference>`.
 *
 * Contract: `normalizePromptRuntimeMode(undefined)` is 'webcontainer' and the
 * webcontainer blocks are the historical text byte-for-byte, so callers that
 * pass nothing keep today's prompt (prompt-include-flags.spec.ts relies on it).
 */

export type PromptRuntimeMode = 'webcontainer' | 'remote-kubernetes';

export const DEFAULT_PROMPT_RUNTIME_MODE: PromptRuntimeMode = 'webcontainer';

export function normalizePromptRuntimeMode(value: unknown): PromptRuntimeMode {
  return value === 'remote-kubernetes' ? 'remote-kubernetes' : DEFAULT_PROMPT_RUNTIME_MODE;
}

/**
 * Server-side resolution of the deployed runtime. Mirrors the client's
 * RuntimeAdapterProvider (RUNTIME_MODE ?? VITE_RUNTIME_MODE); the web pod carries
 * VITE_RUNTIME_MODE both as a build ARG/ENV (Dockerfile) and via the platform
 * configmap, and vitest/SSR expose it on import.meta.env too.
 */
export function resolvePromptRuntimeMode(env?: Record<string, string | undefined> | null): PromptRuntimeMode {
  const processEnv = typeof process !== 'undefined' ? process.env : undefined;
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;

  // A blank value (an unset configmap key renders as '') counts as absent.
  const candidate = [
    env?.RUNTIME_MODE,
    env?.VITE_RUNTIME_MODE,
    processEnv?.RUNTIME_MODE,
    processEnv?.VITE_RUNTIME_MODE,
    metaEnv?.RUNTIME_MODE,
    metaEnv?.VITE_RUNTIME_MODE,
  ].find((value) => typeof value === 'string' && value.trim() !== '');

  return normalizePromptRuntimeMode(candidate?.trim());
}

/**
 * What the remote workspace pod really offers. Facts, each traceable:
 *  - image: services/workspace-agent/Dockerfile (node:24-alpine, bash git curl tini,
 *    runs as uid 1000, no apk at runtime);
 *  - network: workspace-controlled-egress — DNS + TCP 443 to public ranges only,
 *    private ranges and the metadata server excluded; nothing on port 80;
 *  - ports: the agent detects listening ports (workspace-agent /ports) and the
 *    preview proxy opens them — no fixed port required.
 */
const REMOTE_KUBERNETES_RUNTIME_FACTS = `  You operate in an isolated Linux container provisioned for this project (Alpine, Node.js 24) — a real cloud runtime, NOT a browser sandbox:
    - Shell: bash. Available: node, npm, npx, git, curl, and the usual coreutils (cat, cp, ls, mkdir, mv, rm, head, tail, grep, sort, which, chmod, kill, ps, env). pnpm/yarn only when the project already uses them.
    - Outbound network: HTTPS (port 443) to the public internet WORKS — npm installs, "git clone https://…", and "curl -sL https://…" of public pages all succeed. Plain HTTP (port 80), private networks and the cloud metadata service are blocked, so always use https:// URLs.
    - NOT available: Python/pip, C/C++/Rust compilers, system package managers (no apk/apt, no sudo). Prefer pure-JS npm packages; native addons that must compile will fail.
    - Web servers may listen on any port; the platform detects the port and opens the preview automatically. Prefer Vite for frontends.
    - Git works locally; the platform owns remotes and pushes — never configure credentials.
    - Prefer writing Node.js scripts over shell scripts for anything beyond a one-liner.`;

/** Facts only — for prompts whose artifact/React/Vite reminders live elsewhere (fine-tuned, optimized). */
export const REMOTE_KUBERNETES_SYSTEM_CONSTRAINTS_CONCISE = `<system_constraints>
${REMOTE_KUBERNETES_RUNTIME_FACTS}
</system_constraints>`;

/** Facts + the artifact reminders the original prompt keeps inside <system_constraints>. */
export const REMOTE_KUBERNETES_SYSTEM_CONSTRAINTS = `<system_constraints>
${REMOTE_KUBERNETES_RUNTIME_FACTS}

  IMPORTANT: For React apps, the entry point (e.g. src/main.jsx or src/main.tsx) MUST mount with the React 18 client API: "import { createRoot } from 'react-dom/client'" then "createRoot(document.getElementById('root')).render(<App />)". NEVER use the legacy "ReactDOM.render".

  IMPORTANT: For Vite apps, index.html MUST contain BOTH the mount node <div id="root"></div> AND the module entry script <script type="module" src="/src/main.tsx"></script> (matching the real entry path) just before </body>. Vite serves index.html verbatim and does NOT auto-inject the entry, so without this exact tag the preview stays a blank white page.

  IMPORTANT: File edits follow a HYBRID policy — write the full file content with a "file" action by default, and use an anchored search/replace "diff" action ONLY for a small change to a large existing file (see the file-edit policy in the artifact instructions).

  CRITICAL: You must never use the "bundled" type when creating artifacts. This is non-negotiable and used internally only.

  CRITICAL: You MUST always follow the <boltArtifact> format.
</system_constraints>`;

/** Same facts, condensed for the discuss (Ask/Plan) prompt. */
export const REMOTE_KUBERNETES_DISCUSS_CONSTRAINTS = `<system_constraints>
  You operate in an isolated Linux container provisioned for this project (Alpine, Node.js 24) — a real cloud runtime, not a browser sandbox. Key points:
    - Shell: bash, with node, npm, npx, git, curl and the usual coreutils
    - Outbound HTTPS (port 443) to the public internet works: npm installs, git clone over https, curl of public pages; plain HTTP and private networks are blocked
    - No Python/pip, no C/C++/Rust compiler, no apk/apt/sudo — prefer pure-JS npm packages
    - Web servers may listen on any port; the platform opens the preview automatically
</system_constraints>`;

/**
 * How to use the observed `<web_reference>` block (built by
 * `formatWebReferenceBlock` in ~/lib/web-page-digest.ts). Present in BOTH
 * runtimes: the block is produced server-side, so a WebContainer deployment
 * benefits just the same.
 */
export const WEB_REFERENCE_INSTRUCTIONS = `<web_reference_instructions>
  When the user's request names a public website URL, the platform fetches that site BEFORE you answer and hands you the result in a <web_reference> block (in the trailing context message). It is real, observed content: title, headings, navigation links, copy, image URLs, stylesheets, colours and fonts of the pages listed.
    - Clone / reproduce / "make it like <site>" requests: the <web_reference> IS your source material. Rebuild the same page structure and section order, reuse the copy, the palette (colours listed most-frequent first), the font families and the image URLs (link them, never download them). Build every page that appears in the block and wire the navigation between them.
    - Never say you cannot access the web or that you run without network access. Never describe, summarise or "analyse" a site you were not given a <web_reference> for: if the block is missing or lists the URL under <errors>, say exactly that in one sentence and ask for the URL or the material — do not invent pages, copy or colours and present them as observed.
    - Stay within the reference: where it is silent, use clearly labelled placeholders rather than claims about the original site.
    - Reports produced by specialist lanes only count as observations when the same <web_reference> backs them.
</web_reference_instructions>`;
