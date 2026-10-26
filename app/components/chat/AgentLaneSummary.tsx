import { formatAssistantMessageCopy, type AssistantMessageCopy } from '~/lib/i18n/catalogs/assistant-message';

/** Presentation only: retain the original report without treating it as validation. */
export function AgentLaneSummary({
  value,
  copy,
  result,
}: {
  value: string;
  copy: AssistantMessageCopy;
  result?: unknown;
}) {
  const outputLabel = getAgentOutputLabel(result, copy);

  const emitted = result && typeof result === 'object' && 'emittedFiles' in result ? result.emittedFiles : undefined;

  const emittedFiles =
    Array.isArray(emitted) && emitted.every((file): file is string => typeof file === 'string') ? emitted : undefined;
  const emissionLabel = emittedFiles
    ? formatAssistantMessageCopy(copy['assistantMessage.lanes.emittedFiles'], { count: emittedFiles.length })
    : undefined;

  let summary = value;

  try {
    const parsed: unknown = JSON.parse(value);

    if (parsed !== null && typeof parsed === 'object') {
      const report = parsed as Record<string, unknown>;
      const prose = report.summary ?? report.text ?? report.message;
      summary = typeof prose === 'string' ? prose : copy['assistantMessage.lanes.structured'];
    }
  } catch {
    if (/^[{[]/.test(value.trim())) {
      summary = copy['assistantMessage.lanes.structured'];
    }
  }

  if (summary.trim() === 'The agent returned an empty response.') {
    summary = copy['assistantMessage.lanes.emptyResponse'];
  }

  return (
    <>
      <div
        data-testid="agent-lane-output"
        className="h-8 overflow-hidden text-[11px] leading-4 text-bolt-elements-textSecondary"
      >
        {outputLabel && <div className="truncate">{outputLabel}</div>}
        {emissionLabel && <div className="truncate">{emissionLabel}</div>}
      </div>
      <div
        data-testid="agent-lane-apercu"
        className="mt-1 h-12 overflow-hidden line-clamp-3 text-[11px] leading-4 text-bolt-elements-textSecondary"
      >
        {summary}
      </div>
      <details className="mt-1 min-w-0 text-[11px] text-bolt-elements-textSecondary">
        <summary className="flex min-h-[44px] cursor-pointer items-center rounded focus-visible:outline focus-visible:outline-2">
          {copy['assistantMessage.lanes.details']}
        </summary>
        {outputLabel && <p>{outputLabel}</p>}
        {emissionLabel && <p>{emissionLabel}</p>}
        {emittedFiles && (
          <ul>
            {emittedFiles.map((file, index) => (
              <li key={index} className="break-words [overflow-wrap:anywhere]">
                {file}
              </li>
            ))}
          </ul>
        )}
        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {value}
        </pre>
      </details>
    </>
  );
}

/** Consensus contains model claims, not proof that a check ran. */
export function AgentVerificationClaims({ consensus, copy }: { consensus: unknown; copy: AssistantMessageCopy }) {
  const consolidated =
    consensus && typeof consensus === 'object' && 'consolidated' in consensus ? consensus.consolidated : undefined;
  const claims =
    consolidated && typeof consolidated === 'object' && 'agreedVerificationClaims' in consolidated
      ? consolidated.agreedVerificationClaims
      : undefined;

  if (
    !Array.isArray(claims) ||
    !claims.length ||
    !claims.every((claim): claim is string => typeof claim === 'string')
  ) {
    return null;
  }

  return (
    <details className="min-w-0 text-xs">
      <summary className="flex min-h-[44px] cursor-pointer items-center rounded focus-visible:outline focus-visible:outline-2">
        {copy['assistantMessage.lanes.agreedClaims']}
      </summary>
      <p>{copy['assistantMessage.lanes.unverifiedClaims']}</p>
      <ul>
        {claims.map((claim, index) => (
          <li key={index} className="break-words [overflow-wrap:anywhere]">
            {claim}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function getAgentOutputLabel(result: unknown, copy: AssistantMessageCopy): string | undefined {
  const outputState = result && typeof result === 'object' && 'outputState' in result ? result.outputState : undefined;

  const outputKey =
    typeof outputState === 'string' &&
    ['empty', 'actions_without_report', 'report', 'invalid_report', 'interrupted'].includes(outputState)
      ? (`assistantMessage.lanes.output.${outputState}` as keyof AssistantMessageCopy)
      : undefined;

  return outputKey ? copy[outputKey] : undefined;
}
