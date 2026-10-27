import React from 'react';
import { createRoot } from 'react-dom/client';
import { useStickToBottom } from '~/lib/hooks/useStickToBottom.tsx';
function App() {
  const h = useStickToBottom({ initial: 'instant', resize: 'instant' });
  window.hook = h;
  return (
    <>
      <div ref={h.scrollRef} id="scroll" style={{ height: 400, overflow: 'auto' }}>
        <div ref={h.contentRef} id="content">
          {Array.from({ length: 28 }, (_, i) => (
            <p key={i} style={{ height: 100 }}>
              Synthetic message {i}
            </p>
          ))}
          {!h.isAtBottom && (
            <button
              style={{ position: 'sticky', bottom: 8, minHeight: 44 }}
              id="pill"
              onClick={() => h.scrollToBottom()}
            >
              Last message
            </button>
          )}
        </div>
      </div>
      <output id="state">{JSON.stringify({ isAtBottom: h.isAtBottom, escaped: h.escapedFromLock })}</output>
    </>
  );
}
createRoot(document.getElementById('root')).render(<App />);
