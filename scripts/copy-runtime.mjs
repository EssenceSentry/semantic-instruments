import { mkdir, copyFile, readdir } from 'node:fs/promises';
await mkdir('public/wasm', { recursive: true });
for (const file of await readdir('node_modules/@tensorflow/tfjs-backend-wasm/dist'))
  if (file.endsWith('.wasm'))
    await copyFile(
      'node_modules/@tensorflow/tfjs-backend-wasm/dist/' + file,
      'public/wasm/' + file,
    );
await mkdir('public/ort', { recursive: true });
for (const file of await readdir('node_modules/onnxruntime-web/dist'))
  if (file.startsWith('ort-wasm') && (file.endsWith('.wasm') || file.endsWith('.mjs')))
    await copyFile('node_modules/onnxruntime-web/dist/' + file, 'public/ort/' + file);
