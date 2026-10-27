import { createHash } from 'node:crypto';

export interface RuntimeLogEvent {
  type: 'stdout';
  data: string;

  /** Empty when the source did not supply an occurrence time. */
  timestamp: string;
  timestampSource: 'source' | 'unknown';
  receivedAt: string;
  eventId?: string;
}

/** Retain nanoseconds: converting through Date would collapse distinct source events. */
export function runtimeLogEvents(workspaceId: string, lines: readonly string[], receivedAt: string): RuntimeLogEvent[] {
  const occurrences = new Map<string, number>();

  return lines.map((line) => {
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})) (.*)$/s.exec(line);
    const timestamp = match && Number.isFinite(Date.parse(match[1])) ? match[1] : '';
    const data = timestamp ? match![2] : line;

    if (!timestamp) {
      return { type: 'stdout', data, timestamp: '', timestampSource: 'unknown', receivedAt };
    }

    const identity = JSON.stringify([workspaceId, timestamp, data]);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);

    return {
      type: 'stdout',
      data,
      timestamp,
      timestampSource: 'source',
      receivedAt,
      eventId: createHash('sha256')
        .update(JSON.stringify([identity, occurrence]))
        .digest('hex'),
    };
  });
}

/** Per-socket bounded replay filter. Source IDs survive reconnects for the client filter. */
export class RuntimeLogReplay {
  private readonly _seen = new Set<string>();
  private _legacyCount = 0;

  accept(events: readonly RuntimeLogEvent[]): RuntimeLogEvent[] {
    /*
     * Old managers have no source identity. Keep their legacy positional behavior,
     * never manufacture a stable ID from text or label receipt time as occurrence time.
     */
    const unknown = events.filter((event) => !event.eventId);
    const legacyStart = unknown.length < this._legacyCount ? 0 : this._legacyCount;
    const legacyNew = new Set(unknown.slice(legacyStart));
    this._legacyCount = unknown.length;

    const result: RuntimeLogEvent[] = [];

    for (const event of events) {
      if (!event.eventId) {
        if (legacyNew.has(event)) {
          result.push(event);
        }

        continue;
      }

      if (this._seen.has(event.eventId)) {
        continue;
      }

      this._seen.add(event.eventId);
      result.push(event);
    }

    while (this._seen.size > 2000) {
      this._seen.delete(this._seen.values().next().value!);
    }

    return result;
  }
}
