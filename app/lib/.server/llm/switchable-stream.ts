export default class SwitchableStream extends TransformStream {
  private _controller: TransformStreamDefaultController | null = null;
  private _currentReader: ReadableStreamDefaultReader | null = null;
  private _switches = 0;

  constructor() {
    let controllerRef: TransformStreamDefaultController | undefined;

    super({
      start(controller) {
        controllerRef = controller;
      },
    });

    if (controllerRef === undefined) {
      throw new Error('Controller not properly initialized');
    }

    this._controller = controllerRef;
  }

  async switchSource(newStream: ReadableStream) {
    if (this._currentReader) {
      await this._currentReader.cancel();
    }

    this._currentReader = newStream.getReader();

    /*
     * Fire-and-forget pump: catch rejections so they don't become unhandled
     * promise rejections that crash the worker.
     */
    this._pumpStream().catch((error) => {
      console.error('SwitchableStream pump failed:', error);
    });

    this._switches++;
  }

  private async _pumpStream() {
    if (!this._currentReader || !this._controller) {
      throw new Error('Stream is not properly initialized');
    }

    try {
      while (true) {
        const { done, value } = await this._currentReader.read();

        if (done) {
          break;
        }

        this._controller.enqueue(value);
      }
    } catch (error) {
      console.error(error);

      try {
        this._controller.error(error);
      } catch {
        // controller already terminated/closed — nothing to signal
      }
    }
  }

  close() {
    if (this._currentReader) {
      this._currentReader.cancel().catch(() => {
        // reader already released/cancelled — ignore
      });
    }

    this._controller?.terminate();
  }

  get switches() {
    return this._switches;
  }
}
