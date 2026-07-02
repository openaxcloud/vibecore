/**
 * Strip internal agent prompt-scaffolding wrappers from a message before it is
 * shown to the user.
 *
 * The composer prepends instruction-only scaffolding to the user's message before
 * sending it to the model — e.g.
 *   <vibecore_agent_request>
 *   - Mode: Agent. …
 *   - Plan first is disabled: …
 *   - Diff review is enforced by the IDE: …
 *   </vibecore_agent_request>
 *
 *   <the actual user message>
 *
 * That block is guidance FOR the model, never a message for the human, but it is
 * part of the persisted message content — so without stripping it renders verbatim
 * in the chat transcript. Remove any `vibecore_*` wrapper (matched open/close tag)
 * so this and any future wrapper of the same shape never leak into the UI.
 *
 * Pure + exported so the behaviour is unit-tested independently of the (render-only)
 * message component.
 */
const INTERNAL_WRAPPER_REGEX = /<(vibecore_[a-z0-9_]+)>[\s\S]*?<\/\1>\s*/gi;

export function stripInternalAgentScaffolding(content: string): string {
  if (!content) {
    return content;
  }

  return content.replace(INTERNAL_WRAPPER_REGEX, '');
}
