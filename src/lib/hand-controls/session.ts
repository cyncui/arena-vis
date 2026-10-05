import type { HandFrame, Landmark } from './types';

export type HandSessionState = 'idle' | 'starting' | 'running' | 'paused' | 'error';

export class HandTrackingSession {
  private generation = 0;
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private paused = false;
  private lastFrame = 0;
  private stale = false;
  private minimumTimestamp = 0;
  private cancelStartup: ((reason: Error) => void) | null = null;

  constructor(
    private video: HTMLVideoElement,
    private onFrame: (frame: HandFrame) => void,
    private onState: (state: HandSessionState, message?: string) => void,
  ) {}

  async start(): Promise<void> {
    this.stop();
    const generation = this.generation;
    this.onState('starting');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        throw new Error('camera access needs a secure connection and a supported browser.');
      }
      if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') {
        throw new Error('this browser does not support background hand tracking.');
      }
      const worker = new Worker('/hand-tracking/worker.js');
      this.worker = worker;
      let rejectReady: (reason: Error) => void = () => {};
      const ready = new Promise<void>((resolve, reject) => {
        rejectReady = reject;
        this.cancelStartup = reject;
        worker.onmessage = (event: MessageEvent) => {
          if (generation !== this.generation) return;
          const data = event.data;
          if (data?.type === 'ready') resolve();
          else if (data?.type === 'error') reject(new Error('hand tracking could not start. please retry.'));
        };
        worker.onerror = () => reject(new Error('hand tracking could not start. please retry.'));
      });
      const timeout = setTimeout(() => rejectReady(new Error('hand tracking took too long to start. please retry.')), 15000);
      worker.postMessage({ type: 'init' });
      let stream: MediaStream | null = null;
      const camera = navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } }).then(result => {
        if (generation !== this.generation) {
          result.getTracks().forEach(track => track.stop());
          throw new Error('camera startup cancelled.');
        }
        stream = result;
        this.stream = result;
        result.getVideoTracks().forEach(track => {
          track.onended = () => {
            if (generation === this.generation) this.fail('the camera disconnected. please retry.');
          };
        });
        this.video.srcObject = result;
        return this.video.play();
      });
      try {
        await Promise.all([ready, camera]);
      } finally {
        clearTimeout(timeout);
        if (generation === this.generation) this.cancelStartup = null;
      }
      if (generation !== this.generation || !stream) return;
      worker.onmessage = (event: MessageEvent) => {
        if (generation !== this.generation) return;
        if (event.data?.type === 'error') {
          this.fail('hand tracking stopped. please retry.');
          return;
        }
        if (event.data?.type !== 'result') return;
        this.inFlight = false;
        if (this.paused) return;
        const { timestamp, hands } = event.data;
        if (typeof timestamp === 'number' && timestamp < this.minimumTimestamp) return;
        const valid = typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > this.lastFrame &&
          Array.isArray(hands) && hands.length <= 2 && hands.every((hand: unknown) => Array.isArray(hand) && hand.length === 21 && hand.every((point: Landmark) => point && [point.x, point.y, point.z].every(Number.isFinite)));
        if (!valid || performance.now() - timestamp > 200) {
          this.onFrame({ timestamp: performance.now(), hands: [] });
          return;
        }
        this.lastFrame = timestamp;
        this.stale = false;
        this.onFrame({ timestamp, hands });
      };
      worker.onerror = () => this.fail('hand tracking stopped. please retry.');
      this.lastFrame = performance.now();
      this.timer = setInterval(() => {
        if (this.paused || generation !== this.generation) return;
        const now = performance.now();
        if (!this.stale && now - this.lastFrame > 200) {
          this.stale = true;
          this.onFrame({ timestamp: now, hands: [] });
        }
        if (this.inFlight || this.video.readyState < 2) return;
        this.inFlight = true;
        createImageBitmap(this.video).then(bitmap => {
          if (generation !== this.generation || this.paused || now < this.minimumTimestamp) {
            bitmap.close();
            if (generation === this.generation) this.inFlight = false;
            return;
          }
          worker.postMessage({ type: 'frame', bitmap, timestamp: now }, [bitmap]);
        }).catch(() => {
          if (generation === this.generation) this.fail('camera frames could not be read. please retry.');
        });
      }, 50);
      this.onState('running');
    } catch (error) {
      if (generation !== this.generation) return;
      const message = error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'camera permission was denied. enable it in your browser, then retry.'
        : error instanceof DOMException && error.name === 'NotFoundError'
          ? 'no camera was found.'
          : error instanceof DOMException && error.name === 'NotReadableError'
            ? 'the camera is busy or unavailable. close other camera apps, then retry.'
          : error instanceof Error ? error.message : 'hand tracking could not start.';
      this.fail(message);
    }
  }

  pause(): void {
    if (!this.stream) return;
    this.paused = true;
    this.minimumTimestamp = performance.now();
    this.onFrame({ timestamp: performance.now(), hands: [] });
    this.onState('paused');
  }

  resume(): void {
    if (!this.stream || !this.paused) return;
    this.paused = false;
    this.lastFrame = performance.now();
    this.minimumTimestamp = this.lastFrame;
    this.stale = false;
    this.onState('running');
  }

  stop(): void {
    this.generation++;
    this.cancelStartup?.(new Error('camera startup cancelled.'));
    this.cancelStartup = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.worker?.terminate();
    this.worker = null;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
    this.inFlight = false;
    this.paused = false;
    this.onState('idle');
  }

  private fail(message: string): void {
    this.stop();
    this.onFrame({ timestamp: performance.now(), hands: [] });
    this.onState('error', message);
  }
}
