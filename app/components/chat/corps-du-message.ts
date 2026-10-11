/** Source commune du texte rendu et du signal d’attente de l’agent. */
export function corpsDuMessage(
  content: string | undefined,
  parts?: readonly { type: string; text?: unknown }[],
): string {
  if (content && content.trim().length > 0) {
    return content;
  }

  return (parts ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('');
}
