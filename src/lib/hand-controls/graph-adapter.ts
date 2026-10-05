import * as THREE from 'three';
import type { HandMotion, HandViewport, Point2 } from './types';

export type HandGraphHit = { id: string; object: THREE.Object3D };
export type HandGraphControls = {
  target: THREE.Vector3;
  enabled: boolean;
  enableDamping: boolean;
  update: () => void;
};

export function applyHandMotion(
  camera: THREE.PerspectiveCamera,
  controls: HandGraphControls,
  motion: HandMotion,
  viewport: HandViewport,
) {
  const offset = camera.position.clone().sub(controls.target);
  if (motion.kind === 'orbit') {
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta -= motion.dx * Math.PI * 2;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi - motion.dy * Math.PI, 0.05, Math.PI - 0.05);
    camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
  } else {
    const height = 2 * offset.length() * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const pan = right.multiplyScalar(-motion.dx * height * viewport.width / Math.max(1, viewport.height))
      .addScaledVector(up, motion.dy * height);
    controls.target.add(pan);
    const zoomScale = THREE.MathUtils.clamp(motion.scale, 0.8, 1.25) ** 3;
    offset.multiplyScalar(1 / zoomScale);
    offset.setLength(THREE.MathUtils.clamp(offset.length(), 10, 10000));
    camera.position.copy(controls.target).add(offset);
  }
  camera.lookAt(controls.target);
  camera.updateMatrixWorld();
  controls.update();
}

export function pickHandNode(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  point: Point2,
  viewport: HandViewport,
): HandGraphHit | null {
  if (viewport.width <= 0 || viewport.height <= 0) return null;
  const roots: THREE.Object3D[] = [];
  const imageMeshes: THREE.Mesh[] = [];
  scene.traverseVisible(object => {
    if (typeof object.userData.handNodeId !== 'string') return;
    const meshes: THREE.Mesh[] = [];
    object.traverseVisible(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      if (materials.some(material => material.visible)) meshes.push(child);
    });
    if (!meshes.length) return;
    roots.push(object);
    if (object.userData.handImage) imageMeshes.push(...meshes);
  });
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(
    point.x / viewport.width * 2 - 1,
    1 - point.y / viewport.height * 2,
  ), camera);
  for (const hit of raycaster.intersectObjects(imageMeshes, false)) {
    const depth = hit.point.clone().project(camera).z;
    if (depth < -1 || depth > 1) continue;
    let root: THREE.Object3D | null = hit.object;
    while (root && !root.userData.handNodeId) root = root.parent;
    if (root) return { id: root.userData.handNodeId, object: root };
  }
  let nearest: HandGraphHit | null = null;
  let distance = 18;
  const projected = new THREE.Vector3();
  for (const root of roots) {
    root.getWorldPosition(projected).project(camera);
    if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) continue;
    const x = (projected.x + 1) * viewport.width / 2;
    const y = (1 - projected.y) * viewport.height / 2;
    const candidateDistance = Math.hypot(x - point.x, y - point.y);
    if (candidateDistance < distance) {
      distance = candidateDistance;
      nearest = { id: root.userData.handNodeId, object: root };
    }
  }
  return nearest;
}
