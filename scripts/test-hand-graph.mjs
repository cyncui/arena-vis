import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const THREE = require('three');
const source = readFileSync(new URL('../src/lib/hand-controls/graph-adapter.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace(/from ['"]three['"]/, `from '${pathToFileURL(require.resolve('three')).href}'`);
const { applyHandMotion, pickHandNode } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const viewport = { width: 1000, height: 800 };
const cases = [];
const close = (a, b) => assert(Math.abs(a - b) < 1e-8, `${a} differs from ${b}`);
const vectorClose = (a, b) => { close(a.x, b.x); close(a.y, b.y); close(a.z, b.z); };
const cameraFor = (target = new THREE.Vector3()) => {
  const camera = new THREE.PerspectiveCamera(60, viewport.width / viewport.height, 0.1, 1000);
  camera.position.copy(target).add(new THREE.Vector3(0, 0, 100));
  camera.lookAt(target);
  camera.updateMatrixWorld();
  return camera;
};
function check(name, run) {
  try {
    run();
    cases.push({ name, passed: true });
  } catch (error) {
    cases.push({ name, passed: false, error: error.message });
  }
}
const controlsFor = target => ({ target, enabled: false, enableDamping: false, update() {} });
check('orbit preserves target and camera distance', () => {
  const target = new THREE.Vector3(4, 5, 6);
  const camera = cameraFor(target);
  const originalTarget = target.clone();
  const originalPosition = camera.position.clone();
  applyHandMotion(camera, controlsFor(target), { kind: 'orbit', dx: 0.05, dy: 0.02 }, viewport);
  vectorClose(target, originalTarget);
  close(camera.position.distanceTo(target), 100);
  assert(camera.position.distanceTo(originalPosition) > 1);
  vectorClose(camera.getWorldDirection(new THREE.Vector3()), target.clone().sub(camera.position).normalize());
});
check('pan translates camera and target by the same world displacement', () => {
  const target = new THREE.Vector3(4, 5, 6);
  const camera = cameraFor(target);
  const originalTarget = target.clone();
  const originalPosition = camera.position.clone();
  applyHandMotion(camera, controlsFor(target), { kind: 'transform', dx: 0.04, dy: 0.03, scale: 1 }, viewport);
  vectorClose(camera.position.clone().sub(originalPosition), target.clone().sub(originalTarget));
  close(camera.position.distanceTo(target), 100);
  assert(target.x < originalTarget.x);
  assert(target.y > originalTarget.y);
});
check('spreading hands brings the camera closer and closing moves it away', () => {
  const target = new THREE.Vector3();
  const camera = cameraFor(target);
  const controls = controlsFor(target);
  applyHandMotion(camera, controls, { kind: 'transform', dx: 0, dy: 0, scale: 1.1 }, viewport);
  close(camera.position.distanceTo(target), 100 / (1.1 ** 3));
  vectorClose(target, new THREE.Vector3());
  applyHandMotion(camera, controls, { kind: 'transform', dx: 0, dy: 0, scale: 0.9 }, viewport);
  close(camera.position.distanceTo(target), 100 / (1.1 ** 3) / (0.9 ** 3));
});
check('a modest hand spread gives useful zoom and reverses without drift', () => {
  const target = new THREE.Vector3();
  const camera = cameraFor(target);
  const controls = controlsFor(target);
  applyHandMotion(camera, controls, { kind: 'transform', dx: 0, dy: 0, scale: 1.2 }, viewport);
  close(camera.position.distanceTo(target), 57.87037037037038);
  applyHandMotion(camera, controls, { kind: 'transform', dx: 0, dy: 0, scale: 1 / 1.2 }, viewport);
  close(camera.position.distanceTo(target), 100);
  vectorClose(target, new THREE.Vector3());
});
check('orbit clamps poles and zoom respects a minimum distance', () => {
  const target = new THREE.Vector3();
  const camera = cameraFor(target);
  const controls = controlsFor(target);
  applyHandMotion(camera, controls, { kind: 'orbit', dx: 0, dy: 10 }, viewport);
  assert(camera.position.toArray().every(Number.isFinite));
  camera.position.copy(target).add(new THREE.Vector3(0, 0, 10));
  applyHandMotion(camera, controls, { kind: 'transform', dx: 0, dy: 0, scale: 1.25 }, viewport);
  close(camera.position.distanceTo(target), 10);
});
const particleAt = (scene, camera, id, x, y, z = 0) => {
  const particle = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial());
  const distance = camera.position.z - z;
  const height = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  particle.position.set((x / viewport.width - 0.5) * height * camera.aspect, (0.5 - y / viewport.height) * height, z);
  particle.userData.handNodeId = id;
  scene.add(particle);
  return particle;
};
const pickFixture = () => ({ scene: new THREE.Scene(), camera: cameraFor() });
check('direct thumbnail hits take priority over a closer particle center', () => {
  const { scene, camera } = pickFixture();
  particleAt(scene, camera, 'particle', 500, 400);
  const image = new THREE.Group();
  image.userData.handNodeId = 'image';
  image.userData.handImage = true;
  image.add(new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
  scene.add(image);
  scene.updateMatrixWorld(true);
  assert.equal(pickHandNode(scene, camera, { x: 500, y: 400 }, viewport)?.id, 'image');
});
for (const [plane, depth] of [['near', 0.05], ['far', 1100]]) {
  check(`${plane}-clipped thumbnails cannot claim priority over visible particles`, () => {
    const { scene, camera } = pickFixture();
    particleAt(scene, camera, 'visible-particle', 500, 400);
    const image = new THREE.Group();
    image.userData.handNodeId = 'clipped-image';
    image.userData.handImage = true;
    image.position.z = camera.position.z - depth;
    image.add(new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
    scene.add(image);
    scene.updateMatrixWorld(true);
    assert.equal(pickHandNode(scene, camera, { x: 500, y: 400 }, viewport)?.id, 'visible-particle');
  });
}
check('nearest visible particle within 18 css pixels wins', () => {
  const { scene, camera } = pickFixture();
  particleAt(scene, camera, 'farther', 515, 400);
  particleAt(scene, camera, 'nearest', 505, 400);
  scene.updateMatrixWorld(true);
  assert.equal(pickHandNode(scene, camera, { x: 500, y: 400 }, viewport)?.id, 'nearest');
});
check('particles beyond 18 css pixels are not selected', () => {
  const { scene, camera } = pickFixture();
  particleAt(scene, camera, 'too-far', 519, 400);
  scene.updateMatrixWorld(true);
  assert.equal(pickHandNode(scene, camera, { x: 500, y: 400 }, viewport)?.id ?? null, null);
});
check('particles behind the camera are never selected', () => {
  const { scene, camera } = pickFixture();
  particleAt(scene, camera, 'behind', 500, 400, 110);
  scene.updateMatrixWorld(true);
  assert.equal(pickHandNode(scene, camera, { x: 500, y: 400 }, viewport)?.id ?? null, null);
});
check('hidden particles are never selected', () => {
  const { scene, camera } = pickFixture();
  particleAt(scene, camera, 'hidden', 500, 400).visible = false;
  scene.updateMatrixWorld(true);
  assert.equal(pickHandNode(scene, camera, { x: 500, y: 400 }, viewport)?.id ?? null, null);
});
check('particles under a hidden ancestor are never selected', () => {
  const { scene, camera } = pickFixture();
  const particle = particleAt(scene, camera, 'hidden-child', 500, 400);
  const group = new THREE.Group();
  group.visible = false;
  group.add(particle);
  scene.add(group);
  scene.updateMatrixWorld(true);
  assert.equal(pickHandNode(scene, camera, { x: 500, y: 400 }, viewport)?.id ?? null, null);
});
check('a particle outside the viewport is not visible within edge tolerance', () => {
  const { scene, camera } = pickFixture();
  particleAt(scene, camera, 'outside', -5, 400);
  scene.updateMatrixWorld(true);
  assert.equal(pickHandNode(scene, camera, { x: 1, y: 400 }, viewport)?.id ?? null, null);
});
check('hidden image meshes cannot claim direct thumbnail priority', () => {
  const { scene, camera } = pickFixture();
  const image = new THREE.Group();
  image.userData.handNodeId = 'hidden-image';
  image.userData.handImage = true;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.visible = false;
  image.add(mesh);
  scene.add(image);
  scene.updateMatrixWorld(true);
  assert.equal(pickHandNode(scene, camera, { x: 500, y: 400 }, viewport)?.id ?? null, null);
});
check('empty scenes and invalid viewport dimensions return no node', () => {
  const { scene, camera } = pickFixture();
  assert.equal(pickHandNode(scene, camera, { x: 500, y: 400 }, viewport)?.id ?? null, null);
  particleAt(scene, camera, 'particle', 500, 400);
  assert.equal(pickHandNode(scene, camera, { x: 500, y: 400 }, { width: 0, height: 0 })?.id ?? null, null);
});
const passed = cases.every(test => test.passed);
console.log(JSON.stringify({ passed, cases }, null, 2));
if (!passed) process.exitCode = 1;
