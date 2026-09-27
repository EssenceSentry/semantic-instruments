import { useEffect, useRef, useState } from 'react';
import { ImagePlus, ArrowRight, LoaderCircle, X } from 'lucide-react';
import type { Dataset, Manifest, Matrix } from '../core/types';
import { Label } from './Shared';

export function ImageImport({
  onDataset,
  onBusy,
}: {
  onDataset: (d: Dataset) => Promise<void>;
  onBusy: (b: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    worker = useRef<Worker | null>(null);
  const [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [dtype, setDtype] = useState<'q8' | 'fp32'>('q8'),
    [device, setDevice] = useState<'auto' | 'wasm'>('auto');
  useEffect(
    () => () => {
      worker.current?.terminate();
      onBusy(false);
    },
    [],
  );
  const choose = (list: FileList | null) => {
    setFiles(Array.from(list ?? []).filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name)));
    setError('');
  };
  const stop = () => {
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    onBusy(false);
    setStatus('Stopped. The current dataset is unchanged.');
  };
  async function run() {
    if (!files.length || busy) return;
    setBusy(true);
    onBusy(true);
    setError('');
    setStatus('Preparing the image encoder…');
    const w = new Worker(new URL('../core/vision.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    const fail = (message: string) => {
      setError(message);
      setBusy(false);
      onBusy(false);
      w.terminate();
      worker.current = null;
    };
    w.onerror = (e) => fail(e.message);
    w.onmessage = async ({ data: r }) => {
      if (r.type === 'progress') {
        setStatus(r.message);
        return;
      }
      if (r.type === 'error') {
        fail(r.error);
        return;
      }
      if (r.type !== 'result') return;
      try {
        const rows = r.records.length;
        const fingerprint = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(r.records.map((x: any) => x.id).join('\n')),
        );
        const id =
          'local-images-' +
          Array.from(new Uint8Array(fingerprint), (b) => b.toString(16).padStart(2, '0'))
            .join('')
            .slice(0, 24);
        const manifest: Manifest = {
          schemaVersion: 1,
          id,
          title: 'My images · SigLIP',
          description:
            'Images embedded locally in this browser. L2-normalized vectors support cosine geometry; raw encoder outputs retain their magnitudes.',
          items: r.records.map((x: any) => ({
            id: x.id,
            name: x.name,
            label: null,
            media: URL.createObjectURL(x.thumbnail),
            scores: { encoder_norm: x.norm },
          })),
          representations: [
            {
              id: 'siglip.unit',
              name: 'SigLIP · normalized',
              kind: 'embedding',
              dimensions: 768,
              matrix: { rows, cols: 768 },
            },
            {
              id: 'siglip.raw',
              name: 'SigLIP · raw output',
              kind: 'activation',
              dimensions: 768,
              matrix: { rows, cols: 768 },
            },
          ],
          primaryScore: 'encoder_norm',
          scoreDefinitions: {
            encoder_norm: { label: 'Raw encoder vector norm', kind: 'quantity' },
          },
          provenance: {
            source: 'Local user-selected images; not uploaded',
            encoder: r.model,
            revision: r.revision,
            backend: r.device,
            dtype: r.dtype,
            preprocessing:
              'Pinned AutoProcessor config; RGB; SigLIP pooler output; L2 normalization',
            identity: 'SHA-256 of original file bytes',
            duplicatesRemoved: r.duplicates,
            elapsedSeconds: r.elapsed / 1000,
            fallback: r.fallback || 'None',
            positiveLabel: 'your target concept',
            negativeLabel: 'other',
            scoreMeaning:
              'Encoder norm is a geometric quantity, not a prediction. Add individual labels through the mini-audit, then fit a toy linear model.',
            compatibility:
              'Browser embeddings use the pinned ONNX conversion and declared precision. They are a separate dataset; numerical identity with another encoder implementation is not assumed.',
          },
        };
        const matrices = new Map<string, Matrix>([
          ['siglip.unit', { rows, cols: 768, data: r.unit }],
          ['siglip.raw', { rows, cols: 768, data: r.raw }],
        ]);
        setStatus('Projecting the new vectors…');
        await onDataset({
          manifest,
          matrices,
          positions: new Map(),
          baseUrl: location.origin,
          imported: true,
        });
        w.terminate();
        worker.current = null;
        setBusy(false);
        onBusy(false);
      } catch (e) {
        fail(String(e));
      }
    };
    w.postMessage({ files, device, dtype });
  }
  return (
    <div
      className="image-import"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (!busy) choose(e.dataTransfer.files);
      }}
    >
      <Label>FROM PIXELS TO A MATHEMATICAL SPACE</Label>
      <div className="image-import-title">
        <ImagePlus size={23} />
        <h3>Start with your images.</h3>
      </div>
      <p>
        Choose a small collection. The browser computes real 768-dimensional SigLIP embeddings,
        ready for all five instruments.
      </p>
      <input
        ref={input}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        aria-label="Local images"
        onChange={(e) => choose(e.target.files)}
      />
      <button className="secondary full" disabled={busy} onClick={() => input.current?.click()}>
        {files.length
          ? files.length + ' images selected · change selection'
          : 'Choose PNG, JPEG, or WebP images'}
      </button>
      <div className="image-import-options">
        <label>
          Precision
          <select
            disabled={busy}
            value={dtype}
            aria-label="Encoder precision"
            onChange={(e) => setDtype(e.target.value as typeof dtype)}
          >
            <option value="q8">8-bit · ~100 MB</option>
            <option value="fp32">32-bit · ~372 MB</option>
          </select>
        </label>
        <label>
          Compute
          <select
            disabled={busy}
            value={device}
            aria-label="Encoder device"
            onChange={(e) => setDevice(e.target.value as typeof device)}
          >
            <option value="auto">WebGPU → WASM fallback</option>
            <option value="wasm">WebAssembly</option>
          </select>
        </label>
      </div>
      <div className="image-import-actions">
        <button className="primary" disabled={busy || !files.length} onClick={run}>
          {busy ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}Compute
          embeddings
        </button>
        {busy && (
          <button className="text-button" onClick={stop}>
            <X size={14} />
            Cancel
          </button>
        )}
      </div>
      {status && (
        <p className="import-progress" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <p className="micro-note">
        The first run downloads public model weights from Hugging Face and caches them when browser
        storage is available. Images stay on this machine. Start with 12–100 images for a quick
        experiment.
      </p>
    </div>
  );
}
