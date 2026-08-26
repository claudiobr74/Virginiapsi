// Captures microphone audio in short, independently-decodable chunks.
//
// MediaRecorder's periodic `timeslice` blobs are NOT independently
// decodable after the first one (they are fragments of one continuous
// container, missing the header a later fragment would need to stand
// alone). Instead, this stops and immediately restarts a fresh recorder on
// the same MediaStream every `chunkMs` — each resulting blob is a complete,
// self-contained file `decodeAudioData` can open on its own.
export interface ChunkedMicCaptureOptions {
  stream: MediaStream;
  chunkMs: number;
  onChunk: (blob: Blob) => void;
  onError: (error: unknown) => void;
  /** Injectable for tests; defaults to the real MediaRecorder constructor. */
  createRecorder?: (stream: MediaStream) => MediaRecorder;
}

export class ChunkedMicCapture {
  private recorder: MediaRecorder | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(private readonly options: ChunkedMicCaptureOptions) {}

  start(): void {
    this.stopped = false;
    this.startChunk();
    this.timer = setInterval(() => this.rotateChunk(), this.options.chunkMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.recorder?.stop();
    this.recorder = null;
  }

  private startChunk(): void {
    const factory = this.options.createRecorder ?? ((stream) => new MediaRecorder(stream));
    let recorder: MediaRecorder;
    try {
      recorder = factory(this.options.stream);
    } catch (error) {
      this.options.onError(error);
      return;
    }

    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      if (chunks.length === 0) {
        return;
      }
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (blob.size > 0) {
        this.options.onChunk(blob);
      }
    };
    recorder.onerror = (event) => this.options.onError(event);

    recorder.start();
    this.recorder = recorder;
  }

  private rotateChunk(): void {
    if (this.stopped) {
      return;
    }
    this.recorder?.stop();
    this.startChunk();
  }
}
