'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import InterfaceIcon from './InterfaceIcon';
import { HandTrackingSession } from '@/lib/hand-controls/session';
import { createHandInteraction, type HandInteraction, type InteractionView } from '@/lib/hand-controls/interaction';
import type { HandGesture, HandViewport, Landmark } from '@/lib/hand-controls/types';

type HandControlsPanelProps = {
  viewport: HandViewport;
  available: boolean;
  onInteraction: (interaction: HandInteraction | null) => void;
};

const connections = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 10, 11, 12], [9, 13, 14, 15, 16], [13, 17, 18, 19, 20], [0, 17]];
const gestureLabels: Record<HandGesture, string> = {
  idle: 'show an open hand inside the preview', aiming: 'hold the cursor over a node until the ring fills', pinch: 'move your pinch sideways to orbit or toward or away from the camera to zoom', zoom: 'toward camera to zoom in · away to zoom out · release to stop', pan: 'move your fist to pan · open to stop', orbit: 'move your pinch to orbit · release to stop', 'two-hand': 'move both pinches to pan · spread or bring together to zoom', locked: 'open all visible hands to resume',
};
const gestureTips: { label: string; instruction: string; gestures: HandGesture[] }[] = [
  { label: 'select', instruction: 'open hand · hover until the ring fills', gestures: ['aiming'] },
  { label: 'pan', instruction: 'fist · move sideways or up and down', gestures: ['pan'] },
  { label: 'orbit and zoom', instruction: 'pinch thumb and index · sideways to orbit · toward or away to zoom', gestures: ['pinch', 'orbit', 'zoom'] },
  { label: 'two hands', instruction: 'two pinches · move to pan, spread or close to zoom', gestures: ['two-hand'] },
];

export default function HandControlsPanel(props: HandControlsPanelProps) {
  const [open, setOpen] = useState(false);
  const [desktopInput, setDesktopInput] = useState(false);
  const [view, setView] = useState<InteractionView>({ camera: { phase: 'idle' }, hand: { phase: 'unavailable', reason: 'camera' } });
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const interaction = useRef<HandInteraction | null>(null);
  const latest = useRef(props);
  const eligible = useRef(false);
  latest.current = props;
  eligible.current = props.viewport.width >= 768 && desktopInput;
  const state = view.camera.phase;
  const message = view.camera.phase === 'error' ? view.camera.message : null;
  const gesture = view.hand.phase === 'ready' ? view.hand.gesture : view.hand.phase === 'yielded' ? 'locked' : 'idle';
  const draw = useCallback((hands: Landmark[][]) => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, 240, 180);
    context.strokeStyle = '#b5c7c2';
    context.fillStyle = '#f2eadb';
    context.lineWidth = 1;
    const videoWidth = video.current?.videoWidth || 640;
    const videoHeight = video.current?.videoHeight || 480;
    const scale = Math.min(240 / videoWidth, 180 / videoHeight);
    const width = videoWidth * scale;
    const height = videoHeight * scale;
    const left = (240 - width) / 2;
    const top = (180 - height) / 2;
    for (const hand of hands) {
      for (const chain of connections) {
        context.beginPath();
        chain.forEach((index, offset) => {
          const point = hand[index];
          if (offset === 0) context.moveTo(left + (1 - point.x) * width, top + point.y * height);
          else context.lineTo(left + (1 - point.x) * width, top + point.y * height);
        });
        context.stroke();
      }
      for (const point of hand) {
        context.beginPath();
        context.arc(left + (1 - point.x) * width, top + point.y * height, 2, 0, Math.PI * 2);
        context.fill();
      }
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(pointer: fine)');
    const update = () => setDesktopInput(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const owner = createHandInteraction({
      now: () => performance.now(),
      tracking: callbacks => new HandTrackingSession(video.current!, frame => {
        draw(frame.hands);
        callbacks.frame(frame);
      }, (state, message) => {
        if (state !== 'running') draw([]);
        callbacks.state(state, message);
      }),
    });
    interaction.current = owner;
    const unobserve = owner.observe(setView);
    const update = () => owner.environment({ visible: !document.hidden, eligible: eligible.current });
    update();
    document.addEventListener('visibilitychange', update);
    latest.current.onInteraction(owner);
    return () => {
      document.removeEventListener('visibilitychange', update);
      latest.current.onInteraction(null);
      unobserve();
      owner.dispose();
      interaction.current = null;
    };
  }, [draw]);

  useEffect(() => {
    interaction.current?.environment({ visible: !document.hidden, eligible: eligible.current });
  }, [props.viewport.width, desktopInput]);

  const active = state === 'running' || state === 'paused';
  const gestureLabel = view.hand.phase === 'yielded'
    ? view.hand.reason === 'ui' ? 'click the graph, then open all visible hands to resume.'
      : view.hand.reason === 'manual' ? 'mouse or keyboard is active. release it, then open all visible hands to resume.'
        : gestureLabels.locked
    : gesture === 'aiming' && view.hand.phase === 'ready' && view.hand.target
      ? `hold over ${view.hand.target.name} until the ring fills`
      : gestureLabels[gesture];
  const buttonClass = 'border border-white/20 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10 disabled:opacity-40';

  return (
    <>
      <div hidden={props.viewport.width < 768 || !desktopInput} className="relative z-20" style={{ fontFamily: 'var(--font-sans)' }}>
        {!open && props.available && <button type="button" aria-expanded={false} onClick={() => setOpen(true)} className="flex items-center gap-2 border border-white/20 bg-black/70 px-3 py-2 text-xs text-white/80 hover:bg-black/90"><InterfaceIcon name="orbit" /> hand controls</button>}
        <div hidden={!open} className="w-[264px] max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-6rem)] overflow-y-auto custom-scrollbar border border-white/20 bg-[#090b10]/95 p-3 text-white/75">
          <div className="mb-3 flex items-center justify-between text-xs">
            <span>hand controls</span>
            <button type="button" aria-label="close hand controls" onClick={() => { void interaction.current?.camera('stop'); setOpen(false); }} className="p-1 text-white/50 hover:text-white"><InterfaceIcon name="close" /></button>
          </div>
          <div hidden={!active && state !== 'starting'} className="relative mb-3 aspect-[4/3] overflow-hidden bg-black">
            <video ref={video} muted playsInline className="h-full w-full -scale-x-100 object-contain" />
            <canvas ref={canvas} width={240} height={180} className="pointer-events-none absolute inset-0 h-full w-full" />
          </div>
          <p role="status" className="mb-2 break-words text-[11px] leading-relaxed">{state === 'starting' ? 'starting camera and tracker...' : state === 'paused' ? 'paused. camera preview stays on. open your hands before you resume.' : state === 'running' ? props.available ? gestureLabel : 'waiting for the graph...' : 'camera starts only when you enable it.'}</p>
          {!active && state !== 'starting' && <p className="mb-3 text-[10px] leading-relaxed text-white/45">processed on this device. video and landmarks are never uploaded or saved.</p>}
          {message && <p role="alert" className="mb-2 text-[11px] leading-relaxed text-[#dfaba6]">{message}</p>}
          <div className="flex gap-2">
            {!active && <button type="button" disabled={state === 'starting' || !props.available} onClick={() => void interaction.current?.camera('start')} className={buttonClass}>{state === 'error' ? 'retry camera' : 'enable camera'}</button>}
            {active && <button type="button" onClick={() => void interaction.current?.camera(state === 'paused' ? 'resume' : 'pause')} className={buttonClass}>{state === 'paused' ? 'resume' : 'pause'}</button>}
            {(active || state === 'starting') && <button type="button" onClick={() => void interaction.current?.camera('stop')} className={buttonClass}>stop camera</button>}
          </div>
          <details className="mt-3 border-t border-white/10 pt-3 text-[11px] leading-relaxed">
            <summary className="cursor-pointer text-white/80 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#c1d8cc]">gesture reference</summary>
            <dl aria-label="hand gestures" className="mt-2 space-y-2">
              {gestureTips.map(tip => (
                <div key={tip.label} className={state === 'running' && props.available && tip.gestures.includes(gesture) ? 'text-[#e9dfc4]' : 'text-white/50'}>
                  <dt className="text-white/80">{tip.label}</dt>
                  <dd>{tip.instruction}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[10px] leading-relaxed text-white/50">keep your other fingers open when pinching. release to stop.</p>
          </details>
          <p className="mt-3 text-[10px] leading-relaxed text-white/50">mouse and keyboard still work.</p>
        </div>
      </div>
    </>
  );
}
