export type Point2 = { x: number; y: number };
export type Landmark = { x: number; y: number; z: number };
export type HandFrame = { timestamp: number; hands: Landmark[][] };
export type HandViewport = { width: number; height: number };
export type HandMotion =
  | { kind: 'orbit'; dx: number; dy: number }
  | { kind: 'transform'; dx: number; dy: number; scale: number };
export type HandGesture = 'idle' | 'aiming' | 'pinch' | 'pan' | 'orbit' | 'zoom' | 'two-hand' | 'locked';
export type HandOutput = {
  cursor: Point2 | null;
  gesture: HandGesture;
  motion: HandMotion | null;
};
