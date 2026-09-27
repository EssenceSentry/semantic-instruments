import { AutoProcessor, SiglipVisionModel, RawImage, env } from '@huggingface/transformers';
import { appUrl } from './app-url';

const MODEL = 'Xenova/siglip-base-patch16-224';
const REVISION = '4649052661e53c7000355844105f8a1792088239';
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm!.wasmPaths = appUrl('ort/');
env.backends.onnx.wasm!.numThreads = self.crossOriginIsolated
  ? Math.min(8, navigator.hardwareConcurrency || 4)
  : 1;

self.onmessage = async ({
  data,
}: {
  data: { files: File[]; device: 'auto' | 'wasm'; dtype: 'q8' | 'fp32' };
}) => {
  const started = performance.now();
  const progress = (message: string, done = 0, total = 0) =>
    self.postMessage({ type: 'progress', message, done, total });
  try {
    const unique: { file: File; id: string }[] = [],
      seen = new Set<string>();
    progress('Reading image identities…');
    for (const file of data.files) {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const id = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(
        '',
      );
      if (!seen.has(id)) {
        seen.add(id);
        unique.push({ file, id });
      }
    }
    if (!unique.length) throw new Error('Choose at least one image.');
    const downloadProgress = (p: any) => {
      if (p.status === 'progress')
        progress(
          'Downloading ' + p.file + ' · ' + Math.round(p.progress ?? 0) + '%',
          p.loaded ?? 0,
          p.total ?? 0,
        );
      else if (p.status === 'initiate') progress('Opening ' + p.file + '…');
    };
    const processor = await AutoProcessor.from_pretrained(MODEL, {
      revision: REVISION,
      progress_callback: downloadProgress,
    });
    let device: 'webgpu' | 'wasm' = 'wasm',
      fallback = '';
    if (data.device === 'auto' && 'gpu' in navigator) {
      try {
        if (await (navigator as any).gpu.requestAdapter()) device = 'webgpu';
      } catch {}
    }
    let model: SiglipVisionModel;
    try {
      model = await SiglipVisionModel.from_pretrained(MODEL, {
        revision: REVISION,
        device,
        dtype: data.dtype,
        progress_callback: downloadProgress,
      });
    } catch (e) {
      if (device === 'wasm') throw e;
      fallback = 'WebGPU could not initialize; used WebAssembly.';
      device = 'wasm';
      progress(fallback);
      model = await SiglipVisionModel.from_pretrained(MODEL, {
        revision: REVISION,
        device,
        dtype: data.dtype,
        progress_callback: downloadProgress,
      });
    }
    const raw = new Float32Array(unique.length * 768),
      unit = new Float32Array(raw.length),
      records: { id: string; name: string; thumbnail: Blob; norm: number }[] = [],
      backends = new Set<string>();
    for (let i = 0; i < unique.length; i++) {
      const { file, id } = unique[i];
      progress(
        'Embedding ' + (i + 1) + ' / ' + unique.length + ' · ' + file.name,
        i,
        unique.length,
      );
      const image = (await RawImage.fromBlob(file)).rgb();
      const inputs = await processor(image);
      let output: any;
      try {
        output = await model(inputs);
      } catch (e) {
        if (device === 'wasm') throw e;
        await model.dispose();
        device = 'wasm';
        fallback = 'WebGPU inference failed; used WebAssembly.';
        progress(fallback);
        model = await SiglipVisionModel.from_pretrained(MODEL, {
          revision: REVISION,
          device,
          dtype: data.dtype,
          progress_callback: downloadProgress,
        });
        output = await model(inputs);
      }
      backends.add(device);
      const vector = output.pooler_output?.data as Float32Array | undefined;
      if (!vector || vector.length !== 768 || Array.from(vector).some((v) => !Number.isFinite(v)))
        throw new Error('The encoder did not return a finite 768-dimensional vector.');
      const norm = Math.sqrt(Array.from(vector).reduce((s, v) => s + v * v, 0));
      if (norm < 1e-12) throw new Error('The encoder returned a zero vector.');
      raw.set(vector, i * 768);
      for (let j = 0; j < 768; j++) unit[i * 768 + j] = vector[j] / norm;
      const bitmap = await createImageBitmap(file),
        scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
      const canvas = new OffscreenCanvas(
        Math.max(1, Math.round(bitmap.width * scale)),
        Math.max(1, Math.round(bitmap.height * scale)),
      );
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const thumbnail = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.87 });
      records.push({ id, name: file.name, thumbnail, norm });
      for (const tensor of Object.values(inputs))
        if (tensor && typeof (tensor as any).dispose === 'function') (tensor as any).dispose();
      for (const tensor of Object.values(output))
        if (tensor && typeof (tensor as any).dispose === 'function') (tensor as any).dispose();
    }
    await model.dispose();
    self.postMessage(
      {
        type: 'result',
        records,
        raw,
        unit,
        model: MODEL,
        revision: REVISION,
        device: [...backends].join(' + '),
        dtype: data.dtype,
        fallback,
        duplicates: data.files.length - unique.length,
        elapsed: performance.now() - started,
      },
      { transfer: [raw.buffer, unit.buffer] },
    );
  } catch (e) {
    self.postMessage({ type: 'error', error: e instanceof Error ? e.message : String(e) });
  }
};
