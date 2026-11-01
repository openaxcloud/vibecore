import { Component, createRef, type ReactNode } from 'react';

type ReadingAnchor = { scroll: HTMLElement; lane: HTMLElement; top: number };

/** Keep the visible specialist in place when earlier cards finish and shrink. */
export class AgentLaneList extends Component<
  { children: ReactNode; className?: string },
  Record<string, never>,
  ReadingAnchor | null
> {
  private readonly _list = createRef<HTMLDivElement>();

  getSnapshotBeforeUpdate(): ReadingAnchor | null {
    const list = this._list.current;
    const scroll = list?.closest('.bolt-project-agent-transcript')?.parentElement;

    // The transcript hook owns bottom-following. Only preserve an escaped reader.
    if (!list || !scroll || scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <= 70) {
      return null;
    }

    const viewport = scroll.getBoundingClientRect();
    const lanes = Array.from(list.children).filter((node): node is HTMLElement => node instanceof HTMLElement);

    const lane =
      lanes.find((node) => {
        const box = node.getBoundingClientRect();
        return box.top >= viewport.top && box.top < viewport.bottom;
      }) ??
      lanes.find((node) => {
        const box = node.getBoundingClientRect();
        return box.bottom > viewport.top && box.top < viewport.bottom;
      });

    return lane ? { scroll, lane, top: lane.getBoundingClientRect().top } : null;
  }

  componentDidUpdate(
    _props: Readonly<{ children: ReactNode; className?: string }>,
    _state: Record<string, never>,
    anchor: ReadingAnchor | null,
  ) {
    if (!anchor?.lane.isConnected) {
      return;
    }

    // Read after layout so native browser anchoring is included, not applied twice.
    const delta = anchor.lane.getBoundingClientRect().top - anchor.top;

    if (Math.abs(delta) > 0.5) {
      anchor.scroll.scrollTop += delta;
    }
  }

  render() {
    return (
      <div ref={this._list} className={this.props.className}>
        {this.props.children}
      </div>
    );
  }
}
