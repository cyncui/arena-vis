import { createHandInteraction, type HandInteraction, type InteractionView, type GraphSurface, type TrackingCallbacks, type TrackingSession } from '../../src/lib/hand-controls/interaction';
import { bindManualInput } from '../../src/lib/hand-controls/dom-input';

export function callerSketch(dependencies: {
  video: HTMLVideoElement;
  graphElement: HTMLElement;
  surface: GraphSurface;
  trackingForVideo(video: HTMLVideoElement, callbacks: TrackingCallbacks): TrackingSession;
  renderPanel(view: InteractionView): void;
}): Readonly<{ interaction: HandInteraction; dispose: () => void }> {
  const interaction = createHandInteraction({
    tracking: callbacks => dependencies.trackingForVideo(dependencies.video, callbacks),
    now: () => performance.now(),
  });
  const detach = interaction.attach(dependencies.surface);
  const input = bindManualInput(dependencies.graphElement, interaction);
  const unobserve = interaction.observe(dependencies.renderPanel);
  interaction.environment({ visible: true, eligible: true });
  return { interaction, dispose: () => {
    input.dispose();
    detach();
    unobserve();
    interaction.dispose();
  } };
}
