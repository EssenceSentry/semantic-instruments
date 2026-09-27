import { digest, readCache, writeCache, paint } from './cache';
import { ensureMeasures } from './capabilities';
import { gunzipSync, unzipSync, zipSync, strToU8 } from 'fflate';
import type { Dataset, Manifest, Matrix, MatrixRef } from './types';
const MAX_ELEMENTS = 160_000_000;
export function validateManifest(raw: unknown): Manifest {
  if (!raw || typeof raw !== 'object') throw new Error('Expected a dataset object.');
  const d = raw as Manifest;
  if (d.schemaVersion !== 1) throw new Error('Use schemaVersion: 1.');
  if (!d.id || !d.title || !Array.isArray(d.items) || !d.items.length)
    throw new Error('A dataset needs an id, title, and nonempty items.');
  const ids = new Set<string>();
  d.items.forEach((r, i) => {
    if (typeof r.id !== 'string' || !r.id || ids.has(r.id))
      throw new Error('Each item needs a unique string id (row ' + i + ').');
    ids.add(r.id);
    if (r.label === undefined) r.label = null;
    if (r.label !== null && r.label !== 0 && r.label !== 1)
      throw new Error('Labels must be 0, 1, or null.');
    for (const source of [r.media, r.mediaFallback])
      if (source) {
        if (/^(data:image\/(png|jpeg|webp);base64,|\/media\/|media\/|blob:)/.test(source)) continue;
        let url: URL;
        try {
          url = new URL(source);
        } catch {
          throw new Error('Media must be an HTTPS thumbnail URL or local raster image.');
        }
        if (url.protocol !== 'https:' || url.username || url.password)
          throw new Error('Media links must use HTTPS without embedded credentials.');
      }
    for (const value of Object.values(r.scores ?? {}))
      if (value !== null && !Number.isFinite(value))
        throw new Error('Scores must be finite or null.');
  });
  if (!Array.isArray(d.representations) || !d.representations.length)
    throw new Error('Supply at least one vector representation.');
  const reps = new Set<string>();
  for (const r of d.representations) {
    if (typeof r.id !== 'string' || !r.id || reps.has(r.id))
      throw new Error('Representation IDs must be unique.');
    reps.add(r.id);
    if (r.matrix.rows !== d.items.length || r.dimensions !== r.matrix.cols)
      throw new Error(r.id + ': matrix rows must follow item order and dimensions must match.');
    validateRef(r.matrix);
    if (r.projection?.positions) {
      validateRef(r.projection.positions);
      if (r.projection.positions.rows !== d.items.length)
        throw new Error('Projection rows must match item identities.');
    }
    if (
      r.projection?.components &&
      (r.projection.mean?.length !== r.dimensions ||
        r.projection.mean.some((x) => !Number.isFinite(x)) ||
        r.projection.components.some(
          (c) => c.length !== r.dimensions || c.some((x) => !Number.isFinite(x)),
        ))
    )
      throw new Error('Invalid projection axes.');
    if (r.overview) {
      validateRef(r.overview.positions);
      if (r.overview.positions.rows !== d.items.length)
        throw new Error('Overview rows must match item identities.');
    }
  }
  for (const q of d.queries ?? []) {
    validateRef(q.vectors);
    if (
      !reps.has(q.representation) ||
      q.vectors.rows !== q.items.length ||
      q.vectors.cols !== d.representations.find((r) => r.id === q.representation)?.dimensions ||
      d.representations.find((r) => r.id === q.similarities)?.dimensions !== q.items.length
    )
      throw new Error('Query bank dimensions or input representation do not match.');
    const seen = new Set<string>();
    for (const x of q.items) {
      if (seen.has(x.id) || !['positive', 'negative'].includes(x.polarity))
        throw new Error('Queries need unique IDs and positive/negative polarity.');
      seen.add(x.id);
    }
    const featureRep = d.representations.find((r) => r.id === q.features);
    const defs = d.featureDefinitions?.[q.id];
    if (defs && (!featureRep || defs.length !== featureRep.dimensions))
      throw new Error('Feature definitions must match the ordered feature columns.');
    for (const def of defs ?? []) {
      if (!['max', 'second', 'gap', 'margin', 'gate', 'lse', 'groupMargin'].includes(def.kind))
        throw new Error('Unsupported feature operator.');
      if (def.kind !== 'groupMargin' && !q.items.some((x) => x.family === def.family))
        throw new Error('Feature family is absent from its query bank.');
      if (def.temperature != null && (!Number.isFinite(def.temperature) || def.temperature < 0))
        throw new Error('Feature temperature must be nonnegative.');
      if (def.polarity != null && !['positive', 'negative'].includes(def.polarity))
        throw new Error('Invalid feature polarity.');
    }
  }
  if (d.model) {
    const known = new Map(
      d.representations
        .filter((r) => d.model!.inputs.includes(r.id))
        .map((r) => [r.id, r.dimensions]),
    );
    if (known.size !== d.model.inputs.length)
      throw new Error('Model inputs must name supplied representations.');
    for (const n of d.model.nodes) {
      if (['normalize', 'dense', 'sigmoid'].includes(n.op) && n.inputs.length !== 1)
        throw new Error('Unary graph operators require one input.');
      if (n.activation && !['linear', 'relu', 'tanh'].includes(n.activation))
        throw new Error('Unsupported dense activation.');
      if (known.has(n.id) || !n.inputs.length || n.inputs.some((k) => !known.has(k)))
        throw new Error('Model nodes must be topologically ordered: ' + n.id);
      let width = known.get(n.inputs[0])!;
      if (n.op === 'dense') {
        if (
          !n.weight?.length ||
          n.weight.some((w) => w.length !== width || w.some((v) => !Number.isFinite(v))) ||
          n.bias?.length !== n.weight.length ||
          n.bias.some((v) => !Number.isFinite(v))
        )
          throw new Error('Invalid dense weights: ' + n.id);
        width = n.weight.length;
      } else if (n.op === 'normalize') {
        if (
          n.mean?.length !== width ||
          n.mean.some((v) => !Number.isFinite(v)) ||
          n.scale?.length !== width ||
          n.scale.some((v) => !Number.isFinite(v) || v <= 0)
        )
          throw new Error('Invalid normalization: ' + n.id);
      } else if (n.op === 'concat') width = n.inputs.reduce((a, k) => a + known.get(k)!, 0);
      else if (!['add', 'mean', 'sigmoid'].includes(n.op))
        throw new Error('Unsupported model operator.');
      else if (n.inputs.some((k) => known.get(k) !== width))
        throw new Error('Model inputs have incompatible widths.');
      known.set(n.id, width);
    }
    if (!known.has(d.model.output) || !reps.has(d.model.output))
      throw new Error('Missing model output.');
    if (
      known.get(d.model.output) !==
      d.representations.find((r) => r.id === d.model!.output)!.dimensions
    )
      throw new Error('Graph output width must match its representation.');
  }
  return d;
}
function validateRef(r: MatrixRef) {
  if (!r) throw new Error('Missing matrix reference.');
  if (
    !Number.isInteger(r.rows) ||
    !Number.isInteger(r.cols) ||
    r.rows < 1 ||
    r.cols < 1 ||
    r.rows * r.cols > MAX_ELEMENTS
  )
    throw new Error('Invalid matrix dimensions or matrix exceeds the 640 MB limit.');
  if (r.url && /(^[a-z]+:|^\/|\.\.)/i.test(r.url))
    throw new Error('Matrix files must use relative paths within the dataset package.');
}
async function decode(ref: MatrixRef, read: (url: string) => Promise<Uint8Array>): Promise<Matrix> {
  validateRef(ref);
  let data: Float32Array;
  if (ref.values) {
    if (
      Array.isArray(ref.values[0]) &&
      (ref.values.length !== ref.rows ||
        (ref.values as number[][]).some((row) => row.length !== ref.cols))
    )
      throw new Error('Every inline vector must have the declared width and preserve item order.');
    data = Float32Array.from((ref.values as number[][]).flat());
  } else {
    if (!ref.url) throw new Error('Matrix needs values or a file URL.');
    let bytes = await read(ref.url);
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
    if (bytes.byteLength !== ref.rows * ref.cols * 4)
      throw new Error(ref.url + ': binary byte length does not match matrix shape.');
    data = new Float32Array(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
  }
  if (data.length !== ref.rows * ref.cols || data.some((x) => !Number.isFinite(x)))
    throw new Error('Matrix contains nonfinite values or has the wrong length.');
  return { rows: ref.rows, cols: ref.cols, data };
}
export async function hydrate(
  manifest: Manifest,
  read: (url: string) => Promise<Uint8Array>,
  baseUrl: string,
  imported = false,
  onProgress?: (s: string) => void,
): Promise<Dataset> {
  const matrices = new Map<string, Matrix>(),
    positions = new Map<string, Matrix>();
  let completed = 0;
  for (const rep of manifest.representations) {
    onProgress?.(
      'Loading ' + rep.name + ' · ' + ++completed + ' / ' + manifest.representations.length,
    );
    await paint();
    matrices.set(rep.id, await decode(rep.matrix, read));
    if (rep.projection?.positions)
      positions.set(rep.id, await decode(rep.projection.positions, read));
    if (rep.overview)
      positions.set(rep.id + '.overview', await decode(rep.overview.positions, read));
  }
  for (const q of manifest.queries ?? [])
    matrices.set('query.' + q.id, await decode(q.vectors, read));
  const dataset = { manifest, matrices, positions, baseUrl, imported };
  ensureMeasures(dataset);
  return dataset;
}
const hydrated = new Map<string, Dataset>();
export async function loadDataset(url: string, onProgress?: (s: string) => void) {
  onProgress?.('Reading the dataset manifest…');
  const response = await fetch(url);
  if (!response.ok) throw new Error('Dataset could not be loaded.');
  const raw = await response.text();
  const manifest = validateManifest(JSON.parse(raw)),
    base = new URL('.', new URL(url, location.href)).href;
  const refs = manifest.representations
    .flatMap((r) => [r.matrix, r.projection?.positions, r.overview?.positions])
    .concat((manifest.queries ?? []).map((q) => q.vectors))
    .filter(Boolean);
  // URL-based arrays may only be reused across loads when the manifest declares their content hashes.
  const reusable = refs.every((r) => !r?.url || !!manifest.files?.[r.url]);
  const key = 'dataset:' + (await digest(base + '|' + raw));
  if (reusable) {
    const saved = hydrated.get(key) ?? (await readCache<Dataset>(key));
    if (saved) {
      saved.sourceUrl = new URL(url, location.href).href;
      hydrated.set(key, saved);
      onProgress?.('Restoring prepared dataset…');
      return saved;
    }
  }
  for (const item of manifest.items)
    for (const field of ['media', 'mediaFallback'] as const)
      if (item[field] && !/^(blob:|data:)/.test(item[field]!))
        item[field] = new URL(item[field]!, base).href;
  const dataset = await hydrate(
    manifest,
    async (path) => {
      const r = await fetch(new URL(path, base));
      if (!r.ok) throw new Error('Missing data file: ' + path);
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (manifest.files?.[path] && (await digest(bytes)) !== manifest.files[path])
        throw new Error('Data checksum mismatch: ' + path);
      return bytes;
    },
    base,
    false,
    onProgress,
  );
  dataset.sourceUrl = new URL(url, location.href).href;
  if (reusable) {
    hydrated.set(key, dataset);
    await writeCache(key, dataset);
  }
  return dataset;
}
export async function importDataset(file: File, onProgress?: (s: string) => void) {
  onProgress?.('Opening ' + file.name + '…');
  await paint();
  if (file.size > 700_000_000) throw new Error('This package exceeds 700 MB.');
  if (file.name.endsWith('.zip') || file.name.endsWith('.silab')) {
    const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const entry =
      Object.keys(archive).find((k) => k === 'manifest.json') ??
      Object.keys(archive).find((k) => k.endsWith('/manifest.json'));
    if (!entry) throw new Error('ZIP must contain manifest.json.');
    const prefix = entry.slice(0, -'manifest.json'.length);
    const manifest = validateManifest(JSON.parse(new TextDecoder().decode(archive[entry])));
    for (const item of manifest.items)
      if (item.media && !/^(data:|https:)/.test(item.media)) {
        const key = prefix + item.media.replace(/^\//, '');
        const bytes = archive[key];
        if (bytes)
          item.media = URL.createObjectURL(
            new Blob([bytes.buffer as ArrayBuffer], { type: 'image/jpeg' }),
          );
        else delete item.media;
      }
    for (const item of manifest.items)
      if (item.mediaFallback && !/^(https:|data:)/.test(item.mediaFallback)) {
        const bytes = archive[prefix + item.mediaFallback.replace(/^\//, '')];
        if (bytes)
          item.mediaFallback = URL.createObjectURL(
            new Blob([bytes.buffer as ArrayBuffer], { type: 'image/jpeg' }),
          );
        else delete item.mediaFallback;
      }
    return hydrate(
      manifest,
      async (path) => {
        const bytes = archive[prefix + path];
        if (!bytes) throw new Error('Package is missing ' + path);
        return bytes;
      },
      '',
      true,
      onProgress,
    );
  }
  if (file.name.endsWith('.parquet')) {
    const { parquetReadObjects } = await import('hyparquet');
    const { compressors } = await import('hyparquet-compressors');
    const bytes = await file.arrayBuffer();
    const rows = await parquetReadObjects({ file: bytes, compressors });
    return fromRows(rows as Record<string, unknown>[], file.name, onProgress);
  }
  const raw = JSON.parse(await file.text());
  if (Array.isArray(raw)) return fromRows(raw, file.name, onProgress);
  const manifest = validateManifest(raw);
  return hydrate(
    manifest,
    async () => {
      throw new Error('Standalone JSON must embed matrix values. Use a ZIP for binary arrays.');
    },
    '',
    true,
    onProgress,
  );
}
async function fromRows(
  rows: Record<string, unknown>[],
  name: string,
  onProgress?: (s: string) => void,
) {
  if (!rows.length) throw new Error('No rows found.');
  const vectors = Object.keys(rows[0]).filter(
    (k) => Array.isArray(rows[0][k]) || ArrayBuffer.isView(rows[0][k]),
  );
  if (!vectors.length) throw new Error('Include a vector column such as embedding.');
  const m: Manifest = {
    schemaVersion: 1,
    id: 'import-' + Date.now(),
    title: name.replace(/\.[^.]+$/, ''),
    items: rows.map((r, i) => ({
      id: String(r.id ?? r.asset_id ?? r.video_id ?? i),
      name: String(r.name ?? r.title ?? r.id ?? 'Item ' + i),
      label:
        r.label === true
          ? 1
          : r.label === false
            ? 0
            : r.label === 0 || r.label === 1
              ? r.label
              : null,
      media:
        typeof (r.media ?? r.thumbnail_url ?? r.image_url) === 'string'
          ? String(r.media ?? r.thumbnail_url ?? r.image_url)
          : undefined,
      group: r.group == null ? undefined : String(r.group),
      category: r.category == null ? undefined : String(r.category),
      scores: typeof r.score === 'number' ? { model: r.score } : undefined,
    })),
    representations: vectors.map((k) => ({
      id: k,
      name: k,
      kind: 'custom',
      dimensions: (rows[0][k] as number[]).length,
      matrix: {
        rows: rows.length,
        cols: (rows[0][k] as number[]).length,
        values: rows.map((r) => Array.from(r[k] as ArrayLike<number>)),
      },
    })),
    provenance: { kind: 'imported', source: 'Local ' + name },
  };
  return hydrate(validateManifest(m), async () => new Uint8Array(), '', true, onProgress);
}
export function download(name: string, data: BlobPart, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportDataset(dataset: Dataset) {
  const m = structuredClone(dataset.manifest),
    files: Record<string, Uint8Array> = {};
  for (const rep of m.representations) {
    const mat = dataset.matrices.get(rep.id)!;
    const name = rep.id + '.f32';
    files[name] = new Uint8Array(mat.data.buffer);
    rep.matrix = { url: name, rows: mat.rows, cols: mat.cols, encoding: 'f32' };
    delete rep.projection?.positions;
    if (rep.overview) {
      const pos = dataset.positions.get(rep.id + '.overview');
      if (pos) {
        const name = rep.id + '.overview.f32';
        files[name] = new Uint8Array(pos.data.buffer);
        rep.overview.positions = { url: name, rows: pos.rows, cols: pos.cols, encoding: 'f32' };
      } else delete rep.overview;
    }
  }
  for (const q of m.queries ?? []) {
    const mat = dataset.matrices.get('query.' + q.id)!;
    const name = 'query.' + q.id + '.f32';
    files[name] = new Uint8Array(mat.data.buffer);
    q.vectors = { url: name, rows: mat.rows, cols: mat.cols, encoding: 'f32' };
  }
  for (const item of m.items) {
    if (item.media && !item.media.startsWith('https:')) {
      try {
        const bytes = new Uint8Array(await (await fetch(item.media)).arrayBuffer());
        const name = 'media/' + encodeURIComponent(item.id) + '.jpg';
        files[name] = bytes;
        item.media = name;
      } catch {
        delete item.media;
      }
    }
  }
  for (const item of m.items)
    if (item.mediaFallback) {
      try {
        const response = await fetch(item.mediaFallback);
        if (!response.ok) throw new Error('Missing fallback');
        const name = 'media/' + encodeURIComponent(item.id) + '-fallback.jpg';
        files[name] = new Uint8Array(await response.arrayBuffer());
        item.mediaFallback = name;
      } catch {
        delete item.mediaFallback;
      }
    }
  delete m.files;
  files['manifest.json'] = strToU8(JSON.stringify(m));
  download(m.id + '.silab', zipSync(files, { level: 3 }).buffer as ArrayBuffer);
}
export function template(): Manifest {
  const items = Array.from({ length: 240 }, (_, i) => ({
    id: 'example-' + i,
    name: 'Example ' + (i + 1),
    label: i % 3 === 0 ? 1 : 0,
    group: 'group-' + Math.floor(i / 12),
    category: i % 3 === 0 ? 'Signal' : 'Background',
    scores: {
      model: Math.max(0.01, Math.min(0.99, 0.5 + 0.34 * Math.sin(i * 1.7))),
      alternative: Math.max(0.01, Math.min(0.99, 0.5 + 0.34 * Math.cos(i * 0.9))),
    },
  }));
  const values = items.map((item, i) =>
    Array.from(
      { length: 12 },
      (_, j) => Math.sin(i * 0.4 + j * 0.8) + item.label * 0.8 * Math.cos(j),
    ),
  );
  return {
    schemaVersion: 1,
    id: 'portable-example',
    title: 'Portable dataset example',
    description: 'Generated demonstration data for exercising the import contract.',
    items,
    representations: [
      {
        id: 'embedding',
        name: 'Example vectors',
        kind: 'embedding',
        dimensions: 12,
        matrix: { rows: 240, cols: 12, values },
      },
    ],
    provenance: { kind: 'synthetic', source: 'Deterministic template' },
  };
}
