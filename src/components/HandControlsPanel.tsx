'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import InterfaceIcon from './InterfaceIcon';
import { HandGestureController } from '@/lib/hand-controls/gestures';
import { HandTrackingSession, type HandSessionState } from '@/lib/hand-controls/session';
import type { HandGesture, HandOutput, HandViewport, Landmark } from '@/lib/hand-controls/types';

type HandControlsPanelProps = {
  viewport: HandViewport;
  graphKey: string;
  available: boolean;
  hoveredNodeName: string | null;
  hoverProgressRef: { current: number };
  onOutput: (output: HandOutput) => void;
  onReset: () => void;
};

const connections = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 10, 11, 12], [9, 13, 14, 15, 16], [13, 17, 18, 19, 20], [0, 17]];
const gestureLabels: Record<HandGesture, string> = {
  idle: 'show your hand', aiming: 'hover to select', pinch: 'hold pinch · move toward or away from camera', zoom: 'toward camera to zoom in · away to zoom out', pan: 'move your fist to pan · open to stop', orbit: 'orbiting', 'two-hand': 'pan and zoom', locked: 'open your hand to resume',
};

export default function HandControlsPanel(props: HandControlsPanelProps) {
  const [open, setOpen] = useState(false);
  const [desktopInput, setDesktopInput] = useState(false);
  const [state, setState] = useState<HandSessionState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [gesture, setGesture] = useState<HandGesture>('idle');
  const panel = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const hoverRing = useRef<SVGCircleElement>(null);
  const session = useRef<HandTrackingSession | null>(null);
  const controller = useRef(new HandGestureController());
  const gestureRef = useRef<HandGesture>('idle');
  const latest = useRef(props);
  latest.current = props;

  const reset = useCallback((requireRelease = true) => {
    controller.current.reset(requireRelease);
    if (cursor.current) cursor.current.hidden = true;
    gestureRef.current = requireRelease ? 'locked' : 'idle';
    setGesture(gestureRef.current);
    latest.current.onReset();
    if (hoverRing.current) hoverRing.current.style.strokeDashoffset = '56.55';
  }, []);
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
    const tracking = new HandTrackingSession(video.current!, frame => {
      draw(frame.hands);
      if (!latest.current.available) {
        controller.current.reset(true);
        if (cursor.current) cursor.current.hidden = true;
        return;
      }
      const output = controller.current.step(frame, latest.current.viewport, performance.now());
      const nextGesture = frame.hands.length ? output.gesture : 'idle';
      if (nextGesture !== gestureRef.current) {
        gestureRef.current = nextGesture;
        setGesture(nextGesture);
      }
      if (cursor.current) {
        cursor.current.hidden = output.cursor === null;
        if (output.cursor) cursor.current.style.transform = `translate3d(${output.cursor.x}px, ${output.cursor.y}px, 0)`;
      }
      latest.current.onOutput(output);
      if (hoverRing.current) hoverRing.current.style.strokeDashoffset = String(56.55 * (1 - latest.current.hoverProgressRef.current));
    }, (nextState, error) => {
      setState(nextState);
      setMessage(error ?? null);
      if (nextState !== 'running') {
        reset();
        draw([]);
      }
    });
    session.current = tracking;
    const hide = () => { if (document.hidden) tracking.stop(); };
    const manual = (event: Event) => {
      if (panel.current?.contains(event.target as Node)) return;
      if (event instanceof KeyboardEvent && !['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(event.key.toLowerCase())) return;
      reset();
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pointerdown', manual, true);
    window.addEventListener('wheel', manual, { capture: true, passive: true });
    window.addEventListener('keydown', manual, true);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pointerdown', manual, true);
      window.removeEventListener('wheel', manual, true);
      window.removeEventListener('keydown', manual, true);
      tracking.stop();
      session.current = null;
    };
  }, [draw, reset]);

  useEffect(() => {
    reset();
  }, [props.graphKey, props.available, reset]);

  useEffect(() => {
    if (props.viewport.width < 768 || !desktopInput) session.current?.stop();
  }, [props.viewport.width, desktopInput]);

  const active = state === 'running' || state === 'paused';
  const buttonClass = 'border border-white/20 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10 disabled:opacity-40';

  return (
    <>
      <div ref={cursor} hidden aria-hidden="true" className="fixed left-0 top-0 z-30 pointer-events-none">
        <svg viewBox="0 0 24 24" className="absolute -left-3 -top-3 h-6 w-6 text-[#e9dfc4]" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.35" />
          <circle ref={hoverRing} cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeDasharray="56.55" strokeDashoffset="56.55" transform="rotate(-90 12 12)" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
        {props.hoveredNodeName && <span className="absolute left-3 top-2 whitespace-nowrap bg-black/70 px-2 py-1 text-xs text-white font-sans">{props.hoveredNodeName}</span>}
      </div>
      <div ref={panel} hidden={props.viewport.width < 768 || !desktopInput} className="relative z-20" style={{ fontFamily: 'var(--font-sans)' }}>
        {!open && props.available && <button type="button" aria-expanded={false} onClick={() => setOpen(true)} className="flex items-center gap-2 border border-white/20 bg-black/70 px-3 py-2 text-xs text-white/80 hover:bg-black/90"><InterfaceIcon name="orbit" /> hand controls</button>}
        <div hidden={!open} className="w-[264px] max-w-[calc(100vw-2rem)] border border-white/20 bg-[#090b10]/95 p-3 text-white/75">
          <div className="mb-3 flex items-center justify-between text-xs">
            <span>hand controls</span>
            <button type="button" aria-label="close hand controls" onClick={() => { session.current?.stop(); setOpen(false); }} className="p-1 text-white/50 hover:text-white"><InterfaceIcon name="close" /></button>
          </div>
          <div hidden={!active && state !== 'starting'} className="relative mb-3 aspect-[4/3] overflow-hidden bg-black">
            <video ref={video} muted playsInline className="h-full w-full -scale-x-100 object-contain" />
            <canvas ref={canvas} width={240} height={180} className="pointer-events-none absolute inset-0 h-full w-full" />
          </div>
          <p role="status" className="mb-2 text-[11px] leading-relaxed">{state === 'starting' ? 'starting camera and tracker...' : state === 'paused' ? 'paused. camera preview stays on.' : state === 'running' ? props.available ? gestureLabels[gesture] : 'waiting for the graph...' : 'camera starts only when you enable it.'}</p>
          {message && <p role="alert" className="mb-2 text-[11px] leading-relaxed text-[#dfaba6]">{message}</p>}
          <div className="flex gap-2">
            {!active && <button type="button" disabled={state === 'starting' || !props.available} onClick={() => { reset(); void session.current?.start(); }} className={buttonClass}>{state === 'error' ? 'retry camera' : 'enable camera'}</button>}
            {active && <button type="button" onClick={() => { reset(); if (state === 'paused') session.current?.resume(); else session.current?.pause(); }} className={buttonClass}>{state === 'paused' ? 'resume' : 'pause'}</button>}
            {(active || state === 'starting') && <button type="button" onClick={() => session.current?.stop()} className={buttonClass}>stop camera</button>}
          </div>
        </div>
      </div>
    </>
  );
}
