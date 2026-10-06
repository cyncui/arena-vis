import { HandGestureController } from './gestures';
import { HoverSelectionController } from './hover-selection';
import type { HandFrame, HandGesture, HandMotion, HandViewport, Point2 } from './types';
import type { HandSessionState } from './session';

export type FocusScope = 'graph' | 'ui';
export type MovementKey = 'w' | 'a' | 's' | 'd' | 'q' | 'e';
export type NavigationIntent = Readonly<{ keys: readonly MovementKey[]; shift: boolean }>;
export type Target = Readonly<{ id: string; name: string }>;
export type CameraView =
  | Readonly<{ phase: Exclude<HandSessionState, 'error'> }>
  | Readonly<{ phase: 'error'; message: string }>;
export type HandView =
  | Readonly<{ phase: 'unavailable'; reason: 'camera' | 'graph' | 'hidden' | 'ineligible' }>
  | Readonly<{ phase: 'yielded'; reason: 'manual' | 'ui' | 'release-required' }>
  | Readonly<{ phase: 'ready'; gesture: HandGesture; target: Target | null; progress: number }>;
export type InteractionView = Readonly<{ camera: CameraView; hand: HandView }>;
export type Environment = Readonly<{ visible: boolean; eligible: boolean }>;
export type ManualInput =
  | Readonly<{ kind: 'key'; key: MovementKey | 'Shift'; phase: 'down' | 'up'; repeat: boolean; scope: FocusScope }>
  | Readonly<{ kind: 'pointer'; pointerId: number; phase: 'down' | 'up' | 'cancel' }>
  | Readonly<{ kind: 'wheel' }>
  | Readonly<{ kind: 'focus'; scope: FocusScope }>
  | Readonly<{ kind: 'blur' }>;
export interface TrackingCallbacks {
  frame(frame: HandFrame): void;
  state(state: HandSessionState, message?: string): void;
}
export interface TrackingSession {
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
}
export type TrackingFactory = (callbacks: TrackingCallbacks) => TrackingSession;
export interface HandMotionLease {
  apply(motion: HandMotion): void;
  release(): void;
}
export interface GraphSurface {
  viewport(): HandViewport;
  pick(point: Point2): Target | null;
  aim(value: Readonly<{ cursor: Point2 | null; target: Target | null; progress: number }>): void;
  select(nodeId: string): void;
  captureHandMotion(): HandMotionLease;
  keyboard(intent: NavigationIntent | null): void;
}
export interface HandInteraction {
  camera(action: 'start' | 'pause' | 'resume' | 'stop'): Promise<void>;
  environment(value: Environment): void;
  attach(surface: GraphSurface): () => void;
  manual(input: ManualInput): void;
  observe(listener: (view: InteractionView) => void): () => void;
  dispose(): void;
}

type Attachment = { surface: GraphSurface; lease: HandMotionLease | null };
const emptyAim = { cursor: null, target: null, progress: 0 };

export function createHandInteraction(dependencies: { tracking: TrackingFactory; now: () => number }): HandInteraction {
  const gestures = new HandGestureController();
  const hover = new HoverSelectionController();
  const keys = new Map<MovementKey | 'Shift', boolean>();
  const pointers = new Set<number>();
  const listeners = new Set<(view: InteractionView) => void>();
  let environment: Environment = { visible: true, eligible: true };
  let focus: FocusScope = 'graph';
  let attachment: Attachment | null = null;
  let tracking: TrackingSession | null = null;
  let capture = 0;
  let disposed = false;
  let minimumTimestamp = dependencies.now();
  let effects = 0;
  let camera: CameraView = { phase: 'idle' };
  let hand: HandView = { phase: 'unavailable', reason: 'camera' };
  let lastView = '';

  const blocked = () => keys.size > 0 || pointers.size > 0;
  const unavailable = (): HandView | null => {
    if (!environment.visible) return { phase: 'unavailable', reason: 'hidden' };
    if (!environment.eligible) return { phase: 'unavailable', reason: 'ineligible' };
    if (camera.phase !== 'running') return { phase: 'unavailable', reason: 'camera' };
    if (!attachment) return { phase: 'unavailable', reason: 'graph' };
    if (focus === 'ui') return { phase: 'yielded', reason: 'ui' };
    if (blocked()) return { phase: 'yielded', reason: 'manual' };
    return null;
  };
  const publish = () => {
    const view = { camera, hand: unavailable() ?? hand };
    const serialized = JSON.stringify(view);
    if (serialized === lastView || disposed) return;
    lastView = serialized;
    for (const listener of listeners) {
      if (disposed || lastView !== serialized) break;
      listener(view);
    }
  };
  const release = (current: Attachment | null) => {
    const lease = current?.lease;
    if (current) current.lease = null;
    lease?.release();
  };
  const revoke = () => {
    effects++;
    minimumTimestamp = dependencies.now();
    gestures.reset(true);
    hover.reset();
    hand = { phase: 'yielded', reason: 'release-required' };
    const current = attachment;
    release(current);
    current?.surface.aim(emptyAim);
  };
  const keyboard = () => {
    const intent = focus === 'graph' && environment.visible && keys.size
      ? { keys: Object.freeze([...keys].filter(([key, accepted]) => accepted && key !== 'Shift').map(([key]) => key as MovementKey)), shift: keys.get('Shift') === true }
      : null;
    attachment?.surface.keyboard(intent ? Object.freeze(intent) : null);
  };
  const stop = () => {
    const previous = tracking;
    tracking = null;
    capture++;
    camera = { phase: 'idle' };
    previous?.stop();
    revoke();
    publish();
  };
  const frame = (value: HandFrame) => {
    if (disposed || unavailable() || value.timestamp < minimumTimestamp) return;
    if (!value.hands.length || dependencies.now() - value.timestamp > 200) {
      revoke();
      publish();
      return;
    }
    const current = attachment!;
    const epoch = effects;
    const active = () => attachment === current && effects === epoch && !unavailable();
    const viewport = current.surface.viewport();
    if (!active()) return;
    const output = gestures.step(value, viewport, dependencies.now());
    if (output.gesture === 'locked') {
      release(current);
      if (!active()) return;
      hover.reset();
      current.surface.aim(emptyAim);
      if (!active()) return;
      hand = { phase: 'yielded', reason: 'release-required' };
      publish();
      return;
    }
    if (output.motion) {
      if (!current.lease) {
        const lease = current.surface.captureHandMotion();
        if (!active()) { lease.release(); return; }
        current.lease = lease;
      }
      current.lease.apply(output.motion);
    } else release(current);
    if (!active()) return;
    const cursor = output.gesture === 'aiming' && !output.motion ? output.cursor : null;
    const target = cursor ? current.surface.pick(cursor) : null;
    if (!active()) return;
    if (!cursor) hover.cancel(null);
    const selection = cursor ? hover.step(target?.id ?? null, dependencies.now()) : { select: null, progress: 0 };
    current.surface.aim({ cursor, target, progress: selection.progress });
    if (!active()) return;
    hand = { phase: 'ready', gesture: output.gesture, target, progress: selection.progress };
    publish();
    if (active() && selection.select) current.surface.select(selection.select);
  };
  return {
    async camera(action) {
      if (disposed) return;
      if (action === 'stop') { stop(); return; }
      if (!environment.visible || !environment.eligible) return;
      if (action === 'pause' || action === 'resume') {
        const session = tracking;
        const generation = capture;
        if (!session || camera.phase !== (action === 'pause' ? 'running' : 'paused')) return;
        camera = { phase: action === 'pause' ? 'paused' : 'running' };
        revoke();
        if (generation !== capture || tracking !== session) return;
        session[action]();
        publish();
        return;
      }
      if (camera.phase === 'starting' || camera.phase === 'running' || camera.phase === 'paused') return;
      stop();
      if (disposed || tracking) return;
      const generation = ++capture;
      camera = { phase: 'starting' };
      revoke();
      if (disposed || generation !== capture) return;
      const session = dependencies.tracking({
        frame(value) { if (!disposed && generation === capture) frame(value); },
        state(state, message) {
          if (disposed || generation !== capture || (state === 'idle' && camera.phase === 'starting')) return;
          camera = state === 'error' ? { phase: state, message: message ?? 'hand tracking stopped. please retry.' } : { phase: state };
          if (state === 'error') {
            const previous = tracking;
            tracking = null;
            capture++;
            previous?.stop();
            revoke();
          } else if (state !== 'running') revoke();
          else minimumTimestamp = dependencies.now();
          publish();
        },
      });
      if (disposed || generation !== capture) { session.stop(); return; }
      tracking = session;
      publish();
      if (disposed || generation !== capture) return;
      await session.start();
    },
    environment(value) {
      if (disposed || (value.visible === environment.visible && value.eligible === environment.eligible)) return;
      if (value.visible !== environment.visible) {
        keys.clear();
        pointers.clear();
      }
      environment = value;
      if (!value.visible || !value.eligible) stop();
      else revoke();
      keyboard();
      publish();
    },
    attach(surface) {
      if (disposed) return () => {};
      const previous = attachment;
      const current: Attachment = { surface, lease: null };
      attachment = current;
      release(previous);
      previous?.surface.keyboard(null);
      previous?.surface.aim(emptyAim);
      if (attachment === current) {
        revoke();
        if (attachment === current) keyboard();
        publish();
      }
      return () => {
        if (attachment !== current) return;
        attachment = null;
        release(current);
        current.surface.keyboard(null);
        current.surface.aim(emptyAim);
        if (attachment === null) revoke();
        publish();
      };
    },
    manual(input) {
      if (disposed) return;
      if (input.kind === 'key') {
        if (input.phase === 'up') keys.delete(input.key);
        else if (!input.repeat && !keys.has(input.key)) keys.set(input.key, input.scope === 'graph' && focus === 'graph');
      } else if (input.kind === 'pointer') {
        if (input.phase === 'down') pointers.add(input.pointerId);
        else pointers.delete(input.pointerId);
      } else if (input.kind === 'focus') {
        focus = input.scope;
        if (focus === 'ui') for (const key of keys.keys()) keys.set(key, false);
      } else if (input.kind === 'blur') {
        keys.clear();
        pointers.clear();
      }
      revoke();
      keyboard();
      publish();
    },
    observe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      listener({ camera, hand: unavailable() ?? hand });
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      attachment?.surface.keyboard(null);
      attachment = null;
      listeners.clear();
    },
  };
}
