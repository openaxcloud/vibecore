import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentLaneSummary } from '../../app/components/chat/AgentLaneSummary';
import { getAssistantMessageCopy } from '../../app/lib/i18n/catalogs/assistant-message';
const render = (streaming: boolean, value: string, result?: unknown) =>
  renderToStaticMarkup(
    <main style={{ padding: 10 }}>
      <p>Synthetic local layout fixture</p>
      <section data-card="true">
        <AgentLaneSummary copy={getAssistantMessageCopy('fr')} streaming={streaming} value={value} result={result} />
      </section>
    </main>,
  );
console.log(
  JSON.stringify({
    streaming: render(true, 'Court.'),
    terminal: render(false, 'The agent emitted actions without a valid report. Execution has not been observed.', {
      outputState: 'actions_without_report',
      emittedFiles: ['src/App.tsx', 'src/main.tsx'],
    }),
    empty: render(false, 'Terminé.'),
  }),
);
