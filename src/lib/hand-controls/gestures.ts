import type { HandFrame, HandOutput, HandViewport, Landmark, Point2 } from './types';

type TrackedHand = {
  id: number;
  palm: Point2;
  cursor: Point2;
  width: number;
  rawWidth: number;
  rawRatio: number;
  fist: boolean;
  rawFist: boolean;
  fistConfirmation: number;
  pinched: boolean;
  confirmation: number;
};
type GestureState =
  | { kind: 'aiming' }
  | { kind: 'locked'; releaseFrames: number }
  | { kind: 'pinch'; hand: number; startWidth: number; previousWidth: number; origin: Point2; previous: Point2 }
  | { kind: 'pan'; hand: number; previous: Point2 }
  | { kind: 'orbit'; hand: number; previous: Point2 }
  | { kind: 'zoom'; hand: number; previousWidth: number }
  | { kind: 'two-hand'; midpoint: Point2; separation: number };

const distance = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point2, b: Point2): Point2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const mirror = (point: Point2): Point2 => ({ x: 1 - point.x, y: point.y });
const pixels = (point: Point2, viewport: HandViewport): Point2 => ({ x: point.x * viewport.width, y: point.y * viewport.height });
const smooth = (previous: Point2, current: Point2, alpha: number): Point2 => ({
  x: previous.x + (current.x - previous.x) * alpha,
  y: previous.y + (current.y - previous.y) * alpha,
});
const palmOf = (hand: Landmark[]) => midpoint(hand[5], hand[17]);
const isFist = (hand: Landmark[]) => [8, 12, 16, 20].every(tip => {
  const jointDistance = distance(hand[tip - 2], hand[0]);
  return jointDistance > 0.001 && distance(hand[tip], hand[0]) < jointDistance * 0.9;
});
const pinchRatio = (hand: Landmark[]) => distance(hand[4], hand[8]) / Math.max(distance(hand[5], hand[17]), 0.001);

export class HandGestureController {
  private state: GestureState = { kind: 'aiming' };
  private hands: TrackedHand[] = [];
  private lastTimestamp: number | null = null;
  private nextId = 0;
  private primaryId: number | null = null;

  reset(requireRelease = false): void {
    this.state = requireRelease ? { kind: 'locked', releaseFrames: 0 } : { kind: 'aiming' };
    this.hands = [];
    this.lastTimestamp = null;
    this.primaryId = null;
  }

  step(frame: HandFrame, viewport: HandViewport, now: number): HandOutput {
    const output: HandOutput = { cursor: null, gesture: 'idle', motion: null };
    if (now - frame.timestamp > 200 || frame.hands.length === 0) {
      this.reset(true);
      return { ...output, gesture: 'locked' };
    }
    if (this.lastTimestamp !== null && frame.timestamp <= this.lastTimestamp) {
      return { ...output, cursor: this.hands[0] ? pixels(this.hands[0].cursor, viewport) : null, gesture: this.state.kind };
    }
    const dt = this.lastTimestamp === null ? 60 : frame.timestamp - this.lastTimestamp;
    if (dt > 200 || (this.hands.length > 0 && frame.hands.length < this.hands.length)) this.reset(true);
    const alpha = 1 - Math.exp(-dt / 60);
    const raw = frame.hands.slice(0, 2).map(hand => ({ palm: mirror(palmOf(hand)), cursor: mirror(hand[8]), ratio: pinchRatio(hand), width: Math.hypot(hand[5].x - hand[17].x, hand[5].y - hand[17].y, hand[5].z - hand[17].z), fist: isFist(hand) }));
    let previous: (TrackedHand | undefined)[] = [...this.hands];
    const ambiguousArrival = previous.length === 1 && raw.length === 2
      && Math.abs(distance(previous[0]!.palm, raw[0].palm) - distance(previous[0]!.palm, raw[1].palm)) < 0.035;
    if (raw.length === 2 && (distance(raw[0].palm, raw[1].palm) < 0.075 || ambiguousArrival)) {
      this.reset(true);
      previous = [];
    }
    if (previous.length === 2 && raw.length === 2) {
      const straight = distance(previous[0]!.palm, raw[0].palm) + distance(previous[1]!.palm, raw[1].palm);
      const reversed = distance(previous[0]!.palm, raw[1].palm) + distance(previous[1]!.palm, raw[0].palm);
      if (Math.abs(straight - reversed) < 0.035) {
        this.reset(true);
        previous = [];
      } else if (reversed < straight) previous.reverse();
    } else if (previous.length === 1 && raw.length === 2 && distance(previous[0]!.palm, raw[1].palm) < distance(previous[0]!.palm, raw[0].palm)) {
      previous = [undefined, previous[0]];
    }
    if (raw.some((hand, index) => previous[index] && distance(hand.palm, previous[index].palm) > 0.3)) {
      this.reset(true);
      previous = [];
    }
    this.hands = raw.map((hand, index) => {
      const old = previous[index];
      const pinched = old?.pinched ?? false;
      const changing = !hand.fist && (pinched ? hand.ratio >= 0.40 : hand.ratio <= 0.25);
      const confirmation = changing ? (old?.confirmation ?? 0) + 1 : 0;
      const fist = old?.fist ?? false;
      const fistConfirmation = hand.fist !== fist ? (old?.fistConfirmation ?? 0) + 1 : 0;
      return {
        id: old?.id ?? this.nextId++,
        palm: old ? smooth(old.palm, hand.palm, alpha) : hand.palm,
        cursor: old ? smooth(old.cursor, hand.cursor, alpha) : hand.cursor,
        width: old ? old.width + (hand.width - old.width) * alpha : hand.width,
        rawWidth: hand.width,
        fist: fistConfirmation >= 2 ? !fist : fist,
        rawFist: hand.fist,
        fistConfirmation: fistConfirmation >= 2 ? 0 : fistConfirmation,
        rawRatio: hand.ratio,
        pinched: hand.fist ? false : confirmation >= 2 ? !pinched : pinched,
        confirmation: confirmation >= 2 ? 0 : confirmation,
      };
    });
    this.lastTimestamp = frame.timestamp;
    const activeId = 'hand' in this.state ? this.state.hand : null;
    const primary = this.hands.find(hand => hand.id === (activeId ?? this.primaryId)) ?? this.hands[0];
    this.primaryId = primary.id;
    output.cursor = pixels(primary.cursor, viewport);
    const pinched = this.hands.filter(hand => hand.pinched);
    if (this.state.kind === 'locked') {
      this.state.releaseFrames = raw.every(hand => !hand.fist && hand.ratio >= 0.40) ? this.state.releaseFrames + 1 : 0;
      if (this.state.releaseFrames >= 2) this.state = { kind: 'aiming' };
      return { ...output, gesture: this.state.kind };
    }
    if (this.state.kind === 'two-hand' && this.hands.some(hand => hand.rawFist)) {
      this.state = { kind: 'locked', releaseFrames: 0 };
      return { ...output, gesture: 'locked' };
    }
    const fist = this.hands.find(hand => hand.fist && hand.rawFist);
    if (fist && this.state.kind !== 'pan') {
      this.state = { kind: 'pan', hand: fist.id, previous: fist.palm };
      return { ...output, gesture: 'pan' };
    }
    if (this.state.kind === 'pan') {
      const hand = this.hands.find(candidate => candidate.id === activeId);
      if (!hand) this.state = { kind: 'locked', releaseFrames: 0 };
      else if (!hand.fist) this.state = { kind: 'aiming' };
      else {
        if (hand.rawFist) output.motion = { kind: 'transform', dx: hand.palm.x - this.state.previous.x, dy: hand.palm.y - this.state.previous.y, scale: 1 };
        this.state.previous = hand.palm;
      }
      return { ...output, gesture: this.state.kind };
    }
    if (this.hands.some(hand => hand.rawFist)) return { ...output, gesture: this.state.kind };
    if (this.state.kind === 'two-hand') {
      if (pinched.length !== 2) {
        this.state = { kind: 'locked', releaseFrames: 0 };
        return { ...output, gesture: 'locked' };
      }
      const center = midpoint(pinched[0].palm, pinched[1].palm);
      const separation = distance(pinched[0].palm, pinched[1].palm);
      if (pinched.every(hand => hand.rawRatio < 0.40)) output.motion = { kind: 'transform', dx: center.x - this.state.midpoint.x, dy: center.y - this.state.midpoint.y, scale: separation / this.state.separation };
      this.state = { kind: 'two-hand', midpoint: center, separation };
      return { ...output, gesture: 'two-hand' };
    }
    if (pinched.length === 2) {
      this.state = { kind: 'two-hand', midpoint: midpoint(pinched[0].palm, pinched[1].palm), separation: distance(pinched[0].palm, pinched[1].palm) };
      return { ...output, gesture: 'two-hand' };
    }
    if (this.state.kind === 'pinch' || this.state.kind === 'orbit' || this.state.kind === 'zoom') {
      const hand = this.hands.find(candidate => candidate.id === activeId);
      if (!hand) this.state = { kind: 'locked', releaseFrames: 0 };
      else if (!hand.pinched) this.state = { kind: 'aiming' };
      else if (hand.rawRatio >= 0.40) {
        if (this.state.kind === 'zoom' || this.state.kind === 'pinch') this.state.previousWidth = hand.width;
        if (this.state.kind === 'orbit' || this.state.kind === 'pinch') this.state.previous = hand.palm;
      } else {
        if (this.state.kind === 'pinch' && Math.abs(hand.width / this.state.startWidth - 1) >= 0.03) {
          this.state = { kind: 'zoom', hand: hand.id, previousWidth: this.state.previousWidth };
        } else if (this.state.kind === 'pinch' && distance(pixels(hand.palm, viewport), this.state.origin) >= 12) {
          this.state = { kind: 'orbit', hand: hand.id, previous: this.state.previous };
        }
        if (this.state.kind === 'zoom') {
          output.motion = { kind: 'transform', dx: 0, dy: 0, scale: (hand.width / this.state.previousWidth) ** 0.65 };
          this.state.previousWidth = hand.width;
        } else {
          if (this.state.kind === 'orbit') output.motion = { kind: 'orbit', dx: hand.palm.x - this.state.previous.x, dy: hand.palm.y - this.state.previous.y };
          if (this.state.kind === 'pinch') this.state.previousWidth = hand.width;
          this.state.previous = hand.palm;
        }
      }
    } else if (pinched.length === 1) {
      const hand = pinched[0];
      hand.width = Math.max(hand.rawWidth, 0.001);
      output.cursor = pixels(hand.cursor, viewport);
      this.state = { kind: 'pinch', hand: hand.id, startWidth: hand.width, previousWidth: hand.width, origin: pixels(hand.palm, viewport), previous: hand.palm };
    }
    return { ...output, gesture: this.state.kind };
  }
}
