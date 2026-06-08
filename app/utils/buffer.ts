export function bufferWatchEvents<T extends unknown[]>(timeInMs: number, cb: (events: T[]) => unknown) {
  let timeoutId: number | undefined;
  let events: T[] = [];

  // keep track of the processing of the previous batch so we can wait for it
  let processing: Promise<unknown> = Promise.resolve();

  const scheduleBufferTick = () => {
    timeoutId = self.setTimeout(async () => {
      try {
        // we wait until the previous batch is entirely processed so events are processed in order
        await processing;

        if (events.length > 0) {
          /*
           * isolate the callback's promise so a rejection here can't escape as an unhandled
           * rejection on the next tick's `await processing`
           */
          processing = Promise.resolve(cb(events)).catch((error) => {
            console.error('bufferWatchEvents callback failed', error);
          });
        }
      } catch (error) {
        console.error('bufferWatchEvents tick failed', error);
      } finally {
        timeoutId = undefined;
        events = [];
      }
    }, timeInMs);
  };

  return (...args: T) => {
    events.push(args);

    if (!timeoutId) {
      scheduleBufferTick();
    }
  };
}
