import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../src/lib/hand-controls/gestures.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { HandGestureController, isBackPose } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

const args = process.argv.slice(2);
const write = args.includes('--write');
const directory = resolve(args.find(arg => !arg.startsWith('--')) ?? new URL('./fixtures/hand-sessions', import.meta.url).pathname);
const holds = [400, 500, 650, 800, 1000, 1200];
const swipeDistances = [0.10, 0.15, 0.20];
const swipeWindowMs = 300;
const swipeRefractoryMs = 800;

const clips = readdirSync(directory).filter(name => name.endsWith('.json')).map(name => {
  const clip = JSON.parse(readFileSync(join(directory, name), 'utf8'));
  if (clip.version !== 1 || !Array.isArray(clip.frames)) throw new Error(`${name}: not a version 1 hand session`);
  const frames = clip.frames;
  const duration = frames.length > 1 ? frames.at(-1).timestamp - frames[0].timestamp : 0;
  return { name, label: clip.label, attempts: clip.attempts ?? 0, viewport: clip.viewport, frames, duration };
});
if (!clips.length) {
  console.error(`no hand sessions in ${directory}. record some with ?record-hands, then rerun.`);
  process.exit(1);
}

const isBackClip = clip => clip.label.startsWith('back-');
const minutes = list => list.reduce((sum, clip) => sum + clip.duration, 0) / 60000;
const run = (clip, backHoldMs) => {
  const controller = new HandGestureController({ backHoldMs });
  return clip.frames.map(frame => controller.step(frame, clip.viewport, frame.timestamp));
};

const gestures = ['idle', 'aiming', 'pinch', 'orbit', 'zoom', 'pan', 'two-hand', 'locked', 'back'];
const labels = [...new Set(clips.map(clip => clip.label))].sort();
const confusion = Object.fromEntries(labels.map(label => [label, Object.fromEntries(gestures.map(gesture => [gesture, 0]))]));
const rawPose = Object.fromEntries(labels.map(label => [label, { frames: 0, backFrames: 0 }]));
for (const clip of clips) {
  for (const output of run(clip)) confusion[clip.label][output.gesture]++;
  for (const frame of clip.frames) {
    rawPose[clip.label].frames++;
    if (frame.hands.some(hand => isBackPose(hand))) rawPose[clip.label].backFrames++;
  }
}

const negatives = clips.filter(clip => !isBackClip(clip));
const victory = clips.filter(clip => clip.label === 'back-victory');
const swipe = clips.filter(clip => clip.label === 'back-swipe');
const rate = (count, list) => minutes(list) > 0 ? count / minutes(list) : null;
const poseHolds = clip => {
  let start = null;
  let previous = null;
  let holds = 0;
  for (const frame of clip.frames) {
    const pose = frame.hands.some(hand => isBackPose(hand));
    if (pose && start === null) start = frame.timestamp;
    if (!pose && start !== null) { if (previous - start > 150) holds++; start = null; }
    if (pose) previous = frame.timestamp;
  }
  return holds + (start !== null && previous - start > 150 ? 1 : 0);
};
const recall = (list, count, attempts = clip => clip.attempts) => {
  const total = list.reduce((sum, clip) => sum + attempts(clip), 0);
  return total ? Math.min(count(list), total) / total : null;
};

const victorySweep = holds.map(backHoldMs => {
  const commits = list => list.reduce((sum, clip) => sum + run(clip, backHoldMs).filter(output => output.command === 'back').length, 0);
  const falseTriggers = commits(negatives) + commits(swipe);
  const negativeClips = [...negatives, ...swipe];
  return { backHoldMs, falseTriggers, falsePerMinute: rate(falseTriggers, negativeClips), recall: recall(victory, commits, poseHolds), commits: commits(victory) };
});

const swipeTriggers = (clip, distance) => {
  const outputs = run(clip);
  const window = [];
  let last = -Infinity;
  let count = 0;
  clip.frames.forEach((frame, index) => {
    const open = outputs[index].gesture === 'aiming' && frame.hands.length === 1 && !isBackPose(frame.hands[0]);
    if (!open) { window.length = 0; return; }
    const hand = frame.hands[0];
    const palm = { x: 1 - (hand[5].x + hand[17].x) / 2, y: (hand[5].y + hand[17].y) / 2, timestamp: frame.timestamp };
    window.push(palm);
    while (window.length && palm.timestamp - window[0].timestamp > swipeWindowMs) window.shift();
    const dx = palm.x - window[0].x;
    const dy = palm.y - window[0].y;
    if (dx <= -distance && Math.abs(dy) < Math.abs(dx) * 0.5 && palm.timestamp - last >= swipeRefractoryMs) {
      count++;
      last = palm.timestamp;
      window.length = 0;
    }
  });
  return count;
};
const swipeSweep = swipeDistances.map(distance => {
  const triggers = list => list.reduce((sum, clip) => sum + swipeTriggers(clip, distance), 0);
  const negativeClips = [...negatives, ...victory];
  const falseTriggers = triggers(negativeClips);
  return { distance, falseTriggers, falsePerMinute: rate(falseTriggers, negativeClips), recall: recall(swipe, triggers), triggers: triggers(swipe) };
});

const bestRecall = Math.max(0, ...victorySweep.filter(entry => entry.falseTriggers === 0).map(entry => entry.recall ?? 0));
const eligibleHolds = victorySweep.filter(entry => entry.falseTriggers === 0 && bestRecall > 0 && entry.recall === bestRecall).map(entry => entry.backHoldMs);

const report = {
  fixtures: clips.map(({ name, label, attempts, duration, frames }) => ({ name, label, attempts, seconds: +(duration / 1000).toFixed(1), frames: frames.length })),
  negativeMinutes: +minutes(negatives).toFixed(2),
  confusionFrames: confusion,
  rawBackPoseFrameShare: Object.fromEntries(labels.map(label => [label, +(rawPose[label].backFrames / Math.max(rawPose[label].frames, 1)).toFixed(3)])),
  victorySweep,
  swipeSweep,
  victoryPoseHolds: victory.reduce((sum, clip) => sum + poseHolds(clip), 0),
  eligibleBackHoldMs: eligibleHolds,
};

const percent = value => value === null ? 'n/a' : `${(value * 100).toFixed(0)}%`;
const perMinute = value => value === null ? 'n/a' : value.toFixed(2);
console.log(`fixtures: ${clips.length} clips, ${report.negativeMinutes} min of non-back use\n`);
console.log('frames per controller state (rows: recorded activity)');
console.log(['label', ...gestures].join('\t'));
for (const label of labels) console.log([label, ...gestures.map(gesture => confusion[label][gesture])].join('\t'));
console.log('\nraw back-pose frame share:', report.rawBackPoseFrameShare);
console.log('\nvictory hold sweep');
console.log('hold ms\tfalse\tfalse/min\trecall');
for (const entry of victorySweep) console.log(`${entry.backHoldMs}\t${entry.falseTriggers}\t${perMinute(entry.falsePerMinute)}\t${percent(entry.recall)}`);
console.log('\nopen-palm swipe-left sweep');
console.log('distance\tfalse\tfalse/min\trecall');
for (const entry of swipeSweep) console.log(`${entry.distance}\t${entry.falseTriggers}\t${perMinute(entry.falsePerMinute)}\t${percent(entry.recall)}`);
console.log(`\nzero-false holds at best recall: ${eligibleHolds.length ? eligibleHolds.join(', ') + ' ms' : 'none'}`);
if (write) writeFileSync(new URL('../docs/hand-back-gesture-eval.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
