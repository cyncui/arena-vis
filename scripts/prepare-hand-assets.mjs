import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageRoot = path.join(root, 'node_modules/@mediapipe/tasks-vision');
const destination = path.join(root, 'public/hand-tracking');
const version = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')).version;
if (version !== '1.0.1') throw new Error(`expected mediapipe 1.0.1, received ${version}`);
await mkdir(path.join(destination, 'wasm'), { recursive: true });
const files = ['vision_bundle.js', 'wasm/vision_wasm_internal.js', 'wasm/vision_wasm_internal.wasm', 'wasm/vision_wasm_nosimd_internal.js', 'wasm/vision_wasm_nosimd_internal.wasm'];
for (const file of files) await copyFile(path.join(packageRoot, file), path.join(destination, file));
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const modelFile = path.join(destination, 'hand_landmarker.task');
const expectedModelHash = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';
try { await readFile(modelFile); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const response = await fetch(modelUrl);
  if (!response.ok) throw new Error(`model download failed (${response.status})`);
  await writeFile(modelFile, Buffer.from(await response.arrayBuffer()));
}
const assets = {};
for (const file of [...files, 'hand_landmarker.task']) {
  const data = await readFile(path.join(destination, file));
  const sha256 = createHash('sha256').update(data).digest('hex');
  if (file === 'hand_landmarker.task' && sha256 !== expectedModelHash) throw new Error('hand model checksum does not match the verified model');
  assets[file] = { bytes: data.byteLength, sha256 };
}
await writeFile(path.join(destination, 'assets.json'), `${JSON.stringify({ package: '@mediapipe/tasks-vision', version, modelUrl, assets }, null, 2)}\n`);
console.log('verified and copied mediapipe 1.0.1 hand assets');
