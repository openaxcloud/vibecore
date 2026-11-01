/** @vitest-environment jsdom */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentLaneList } from './AgentLaneList';

afterEach(cleanup);

describe('AgentLaneList reading position', () => {
  it.each([false, true])('preserves the reader without doubling native anchoring (native=%s)', (native) => {
    let laneTop = 80;

    const fixture = (version: number) => (
      <div data-testid="scroll">
        <div className="bolt-project-agent-transcript">
          <AgentLaneList>
            <div
              key="reader"
              ref={(node) => {
                if (node) {
                  laneTop = native ? 80 : version ? 40 : 80;
                }
              }}
            >
              Reader {version}
            </div>
          </AgentLaneList>
        </div>
      </div>
    );

    const { getByTestId, getByText, rerender } = render(fixture(0));
    const scroll = getByTestId('scroll');
    Object.defineProperties(scroll, {
      scrollHeight: { value: 2000 },
      clientHeight: { value: 600 },
      scrollTop: { value: 500, writable: true },
    });
    scroll.getBoundingClientRect = () => ({ top: 0, bottom: 600 }) as DOMRect;
    getByText('Reader 0').getBoundingClientRect = () => ({ top: laneTop, bottom: laneTop + 100 }) as DOMRect;
    rerender(fixture(1));
    expect(scroll.scrollTop).toBe(native ? 500 : 460);
  });

  it('leaves bottom following to the transcript hook', () => {
    let laneTop = 80;

    const fixture = (version: number) => (
      <div data-testid="scroll">
        <div className="bolt-project-agent-transcript">
          <AgentLaneList>
            <div
              ref={(node) => {
                if (node) {
                  laneTop = version ? 40 : 80;
                }
              }}
            >
              Reader {version}
            </div>
          </AgentLaneList>
        </div>
      </div>
    );

    const { getByTestId, getByText, rerender } = render(fixture(0));
    const scroll = getByTestId('scroll');
    Object.defineProperties(scroll, {
      scrollHeight: { value: 2000 },
      clientHeight: { value: 600 },
      scrollTop: { value: 1400, writable: true },
    });
    scroll.getBoundingClientRect = () => ({ top: 0, bottom: 600 }) as DOMRect;
    getByText('Reader 0').getBoundingClientRect = () => ({ top: laneTop, bottom: laneTop + 100 }) as DOMRect;
    rerender(fixture(1));
    expect(scroll.scrollTop).toBe(1400);
  });
});
