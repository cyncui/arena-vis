import type { FocusScope, HandInteraction, MovementKey } from './interaction';

const movementKeys = new Set(['w', 'a', 's', 'd', 'q', 'e']);

export function bindManualInput(graphElement: HTMLElement, interaction: HandInteraction): { dispose(): void } {
  const document = graphElement.ownerDocument;
  const window = document.defaultView!;
  const scope = (target: EventTarget | null): FocusScope => {
    const element = target instanceof window.Element ? target : null;
    return element?.closest('[data-hand-ui], input, textarea, select, [contenteditable]:not([contenteditable="false"])') || !element || !graphElement.contains(element) ? 'ui' : 'graph';
  };
  const key = (event: KeyboardEvent, phase: 'down' | 'up') => {
    const key = event.key === 'Shift' ? 'Shift' : event.key.toLowerCase();
    if (key !== 'Shift' && !movementKeys.has(key)) return;
    interaction.manual({ kind: 'key', key: key as MovementKey | 'Shift', phase, repeat: event.repeat, scope: scope(event.target) });
  };
  const down = (event: KeyboardEvent) => key(event, 'down');
  const up = (event: KeyboardEvent) => key(event, 'up');
  const pointer = (event: PointerEvent, phase: 'down' | 'up' | 'cancel') => {
    if (phase === 'down') {
      const nextScope = scope(event.target);
      if (nextScope === 'graph') graphElement.focus({ preventScroll: true });
      interaction.manual({ kind: 'focus', scope: nextScope });
    }
    interaction.manual({ kind: 'pointer', pointerId: event.pointerId, phase });
  };
  const pointerDown = (event: PointerEvent) => pointer(event, 'down');
  const pointerUp = (event: PointerEvent) => pointer(event, 'up');
  const pointerCancel = (event: PointerEvent) => pointer(event, 'cancel');
  const wheel = () => interaction.manual({ kind: 'wheel' });
  const focus = (event: FocusEvent) => interaction.manual({ kind: 'focus', scope: scope(event.target) });
  const blur = () => interaction.manual({ kind: 'blur' });
  interaction.manual({ kind: 'focus', scope: scope(document.activeElement) });
  window.addEventListener('keydown', down, true);
  window.addEventListener('keyup', up, true);
  window.addEventListener('pointerdown', pointerDown, true);
  window.addEventListener('pointerup', pointerUp, true);
  window.addEventListener('pointercancel', pointerCancel, true);
  window.addEventListener('wheel', wheel, { capture: true, passive: true });
  window.addEventListener('focusin', focus, true);
  window.addEventListener('blur', blur);
  let disposed = false;
  return { dispose() {
    if (disposed) return;
    disposed = true;
    window.removeEventListener('keydown', down, true);
    window.removeEventListener('keyup', up, true);
    window.removeEventListener('pointerdown', pointerDown, true);
    window.removeEventListener('pointerup', pointerUp, true);
    window.removeEventListener('pointercancel', pointerCancel, true);
    window.removeEventListener('wheel', wheel, true);
    window.removeEventListener('focusin', focus, true);
    window.removeEventListener('blur', blur);
    blur();
  } };
}
