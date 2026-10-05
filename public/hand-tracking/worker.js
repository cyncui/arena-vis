let landmarker = null;
let initializing = false;

self.onmessage = async event => {
  const data = event.data;
  if (data.type === 'init') {
    if (landmarker || initializing) return;
    initializing = true;
    try {
      importScripts('/hand-tracking/vision_bundle.js');
      const files = await Vision.FilesetResolver.forVisionTasks('/hand-tracking/wasm');
      landmarker = await Vision.HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/hand-tracking/hand_landmarker.task', delegate: 'CPU' },
        runningMode: 'VIDEO',
        numHands: 2,
      });
      self.postMessage({ type: 'ready' });
    } catch {
      self.postMessage({ type: 'error' });
    } finally {
      initializing = false;
    }
    return;
  }
  if (data.type !== 'frame') return;
  try {
    if (!landmarker) throw new Error('tracking is not ready');
    const result = landmarker.detectForVideo(data.bitmap, data.timestamp);
    self.postMessage({ type: 'result', timestamp: data.timestamp, hands: result.landmarks });
  } catch {
    self.postMessage({ type: 'error' });
  } finally {
    data.bitmap?.close();
  }
};
