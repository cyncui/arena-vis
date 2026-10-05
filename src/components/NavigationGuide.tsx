import InterfaceIcon from './InterfaceIcon';

const gestures = [
  { name: 'orbit', action: 'drag', highlight: 'M12 4a8 8 0 0 0-8 8v4h8Z' },
  { name: 'pan', action: 'right-drag or shift + drag', highlight: 'M12 4a8 8 0 0 1 8 8v4h-8Z' },
  { name: 'zoom', action: 'scroll', highlight: 'M10 9h4v9h-4Z' },
] as const;

const keycapClass = 'flex h-8 min-w-8 items-center justify-center rounded-[3px] border border-white/20 bg-white/[0.04] px-2 font-pixel text-[11px] uppercase leading-none text-[#d1dbd7] shadow-[0_2px_0_0_#141a1a]';

export default function NavigationGuide({ onClose }: { onClose: () => void }) {
  return (
    <aside
      aria-label="exploration controls"
      style={{ fontFamily: 'var(--font-sans)' }}
      className="w-80 max-w-[calc(100vw-2rem)] rounded-sm border border-[#b8d5c8]/25 bg-[#080c0e]/95 text-white/80 shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
    >
      <div className="flex items-center justify-between border-b border-white/10 pl-4 pr-2 py-2">
        <div>
          <div className="flex items-center gap-2 font-pixel text-xs tracking-wide text-[#c1d8cc]">
            <span className="h-1 w-1 rounded-full bg-[#c1d8cc]" />
            flight guide
          </div>
          <p className="mt-1 text-[11px] text-white/55">exploration controls</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="close controls"
          className="flex h-10 w-10 items-center justify-center rounded-sm text-white/55 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#c1d8cc]"
        >
          <InterfaceIcon name="close" />
        </button>
      </div>

      <div className="px-4 py-4">
        <p className="mb-3 font-pixel text-[10px] tracking-wider text-white/50">mouse</p>
        <div className="space-y-3">
          {gestures.map((gesture) => (
            <div key={gesture.name} className="flex items-center gap-4">
              <svg width="24" height="36" viewBox="0 0 24 36" fill="none" aria-hidden="true" className="shrink-0 text-[#bed5c8]">
                <path d={gesture.highlight} fill="currentColor" fillOpacity="0.45" />
                <rect x="4" y="4" width="16" height="28" rx="8" stroke="currentColor" strokeOpacity="0.55" />
                <path d="M4 16h16M12 4v12" stroke="currentColor" strokeOpacity="0.45" />
                <rect x="10" y="9" width="4" height="9" rx="2" fill={gesture.name === 'zoom' ? 'currentColor' : '#080c0e'} stroke="currentColor" strokeOpacity={gesture.name === 'zoom' ? 1 : 0.5} />
              </svg>
              <div>
                <p className="text-[13px] leading-5 text-white/80">{gesture.name}</p>
                <p className="text-[11px] leading-4 text-white/55">{gesture.action}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-4">
        <p className="mb-3 font-pixel text-[10px] tracking-wider text-white/50">keyboard</p>
        <div className="flex items-center gap-5">
          <div className="grid grid-cols-3 gap-1.5">
            <kbd className={`${keycapClass} col-start-2`}>w</kbd>
            {['a', 's', 'd'].map((key) => <kbd key={key} className={`${keycapClass} row-start-2`}>{key}</kbd>)}
          </div>
          <div>
            <p className="text-[13px] text-white/80">pan the view</p>
            <p className="mt-1 text-[11px] text-white/55">up, left, down, right</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-white/55">
          <div className="flex items-center gap-2"><kbd className={keycapClass}>q</kbd><span>move away</span></div>
          <div className="flex items-center gap-2"><kbd className={keycapClass}>e</kbd><span>move closer</span></div>
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-4">
        <p className="mb-3 font-pixel text-[10px] tracking-wider text-white/50">hands</p>
        <p className="mb-2 text-[11px] leading-relaxed">hover until the ring fills to select. make a fist and move it to pan. pinch thumb and index with your other fingers open; move toward the camera to zoom in or away to zoom out. release to stop. drag a pinch sideways to orbit.</p>
        <p className="text-[10px] leading-relaxed text-white/55">processed on this device. video and landmarks are never uploaded or saved. switching tabs stops the camera.</p>
      </div>

      <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3 text-[11px] text-white/55">
        <kbd className={keycapClass}>shift</kbd>
        <span>hold to move faster with keys</span>
      </div>
    </aside>
  );
}
