import { defaultFocusIndex } from './core/capabilities';
import { ThemeToggle } from './components/ThemeToggle';
import { useSceneAPI } from './core/scene-api';
import { ViewState } from './core/view-state';
import { fitLinearProbe } from './core/probe';
import { useCallback, useEffect, useRef, useState, useMemo, memo } from 'react';
import {
  Orbit,
  Workflow,
  Layers,
  ArrowDownUp,
  Dices,
  Upload,
  Download,
  Info,
  X,
  ArrowRight,
  BookOpen,
  FileJson,
  CheckCircle2,
  LoaderCircle,
  Command,
  Maximize2,
  Minimize2,
  Database,
  Play,
} from 'lucide-react';
import type { Dataset, ToolId, Matrix, Intervention, Manifest } from './core/types';
import { Context, type LabContext } from './core/context';
import { loadDataset, importDataset, download, exportDataset, template } from './core/dataset';
import { appUrl } from './core/app-url';
import { compute, engineStats } from './core/engine';
import { paint, readCache, writeCache } from './core/cache';
import { preparePresentation, replayIntervention } from './core/presentation';
import { ActivityIndicator } from './components/ActivityIndicator';
import { SpaceExplorer } from './tools/SpaceExplorer';
import { TransformationWorkbench } from './tools/TransformationWorkbench';
import { EvidenceComposer } from './tools/EvidenceComposer';
import { RankingComparator } from './tools/RankingComparator';
import { UncertaintyExplorer } from './tools/UncertaintyExplorer';
import { Modal, Label, Equation, fmt, count, Metric } from './components/Shared';
import { ImageImport } from './components/ImageImport';
import { GuidedTour } from './components/GuidedTour';
import { sceneConfig, type TourScene } from './core/tour';
const TOOLS = [
  {
    id: 'space',
    name: 'Space Explorer',
    icon: Orbit,
    title: (
      <>
        Follow the <em>representation.</em>
      </>
    ),
    description:
      'One example. Many mathematical spaces. Keep its identity as the geometry changes.',
  },
  {
    id: 'transform',
    name: 'Transformation Workbench',
    icon: Workflow,
    title: (
      <>
        Open the <em>calculation.</em>
      </>
    ),
    description: 'Inspect the arithmetic, change an ingredient, and follow the consequences.',
  },
  {
    id: 'compose',
    name: 'Evidence Composer',
    icon: Layers,
    title: (
      <>
        Build a claim from <em>evidence.</em>
      </>
    ),
    description:
      'Keep the observations visible as you summarize a collection or select a review set.',
  },
  {
    id: 'rank',
    name: 'Ranking Comparator',
    icon: ArrowDownUp,
    title: (
      <>
        Compare what gets <em>chosen.</em>
      </>
    ),
    description: 'Connect every ordering and every metric to the examples responsible for it.',
  },
  {
    id: 'uncertainty',
    name: 'Uncertainty Explorer',
    icon: Dices,
    title: (
      <>
        Make uncertainty <em>visible.</em>
      </>
    ),
    description: 'Hide outcomes, draw a sample, repeat the experiment, and reveal the reference.',
  },
] as const;
const Instrument = memo(function Instrument({ tool }: { tool: ToolId }) {
  return tool === 'space' ? (
    <SpaceExplorer />
  ) : tool === 'transform' ? (
    <TransformationWorkbench />
  ) : tool === 'compose' ? (
    <EvidenceComposer />
  ) : tool === 'rank' ? (
    <RankingComparator />
  ) : (
    <UncertaintyExplorer />
  );
});
function readRoute(): ToolId {
  const key = location.hash.slice(1).split('?')[0];
  return TOOLS.some((t) => t.id === key) ? (key as ToolId) : 'space';
}
export interface AppProps {
  initialDatasetUrl?: string;
  instrument?: ToolId;
}
export default function App({ initialDatasetUrl, instrument }: AppProps = {}) {
  const [dataset, setDataset] = useState<Dataset | null>(null),
    [tool, setToolState] = useState<ToolId>(instrument ?? readRoute()),
    [selected, setSelected] = useState<number[]>([]),
    [pinned, setPinned] = useState<number[]>([]),
    [representation, setRepresentation] = useState(''),
    [positions, setPositions] = useState(new Map<string, Matrix>()),
    [intervened, setIntervened] = useState(new Map<string, Matrix>()),
    [intervention, setIntervention] = useState<Intervention>({
      disabled: [],
      temperature: null,
      zeroFamilies: [],
    }),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState('Opening the dataset…'),
    [error, setError] = useState(''),
    [runtime, setRuntime] = useState({
      backend: 'initializing',
      threads: 0,
      elapsed: 0,
      error: NaN,
    }),
    [dialog, setDialog] = useState<'data' | 'methods' | 'lesson' | 'presentation' | null>(null),
    [catalog, setCatalog] = useState<{ id: string; title: string; url: string; rows: number }[]>(
      [],
    ),
    [focus, setFocus] = useState(false);
  const [navigating, setNavigating] = useState('');
  const [viewRevision, setViewRevision] = useState(0);
  const [preparing, setPreparing] = useState(false),
    [preparationProgress, setPreparationProgress] = useState<number | undefined>();
  const [prepared, setPrepared] = useState<
    Record<string, { title: string; calculations: number; previews: number; time: string }>
  >({});
  const cancelPreparation = useRef(false);
  useEffect(() => {
    readCache<typeof prepared>('prepared-index').then((x) => {
      if (x) setPrepared(x);
    });
  }, []);
  const fileInput = useRef<HTMLInputElement>(null),
    generation = useRef(0),
    datasetRef = useRef<Dataset | null>(null),
    viewState = useRef(new ViewState());
  const openTourScene = useCallback(async (scene: TourScene) => {
    const d = datasetRef.current;
    if (!d) return;
    const next = sceneConfig(scene, d.manifest);
    let changed = false;
    for (const [key, value] of Object.entries(next.view)) {
      if (viewState.current.get(key) !== value) changed = true;
      viewState.current.set(key, value);
    }
    setNavigating('Opening the tour view…');
    setDialog(null);
    setFocus(false);
    setToolState(next.tool);
    if (next.representation) setRepresentation(next.representation);
    setSelected((current) =>
      current.length
        ? current
        : [
            defaultFocusIndex(d.manifest),
          ],
    );
    if (changed) setViewRevision((v) => v + 1);
    history.replaceState(null, '', '#' + next.tool);
    await paint();
    setNavigating('');
    await paint();
  }, []);
  const setTool = async (t: ToolId) => {
    setNavigating('Opening ' + TOOLS.find((x) => x.id === t)!.name + '…');
    await paint();
    setToolState(t);
    history.replaceState(null, '', '#' + t);
    setTimeout(() => setNavigating(''), 0);
  };
  const finishLoad = async (d: Dataset) => {
    datasetRef.current = d;
    viewState.current.clear();
    setSelected([]);
    setPinned([]);
    setIntervened(new Map());
    setIntervention({ disabled: [], temperature: null, zeroFamilies: [] });
    setRepresentation(d.manifest.representations[0].id);
    setPositions(new Map(d.positions));
    setStatus('Initializing WebAssembly…');
    const result = await compute('load', { matrices: Object.fromEntries(d.matrices) });
    setRuntime({ backend: result.backend, threads: result.threads, elapsed: 0, error: NaN });
    const projected = new Map(d.positions);
    for (const rep of d.manifest.representations) {
      if (rep.dimensions > 1 && !projected.has(rep.id)) {
        setStatus('Computing ' + rep.name + ' projection…');
        const p = rep.projection?.components
          ? await compute('project', {
              key: rep.id,
              mean: rep.projection.mean,
              components: rep.projection.components,
            })
          : await compute('pca', { key: rep.id });
        const pos = p.positions ?? p.matrix;
        projected.set(rep.id, pos);
        if (!rep.projection)
          rep.projection = { method: 'PCA · browser', mean: p.mean, components: p.components };
        setPositions(new Map(projected));
      }
    }
    d.positions = projected;
    if (d.manifest.model) {
      const model = d.manifest.model,
        capture = d.manifest.representations
          .filter((r) => model.nodes.some((n) => n.id === r.id))
          .map((r) => r.id);
      setStatus('Verifying the supplied model graph…');
      const result = await compute('graph', { nodes: model.nodes, inputs: model.inputs, capture });
      let maxError = 0;
      const baseline = d.matrices.get(model.output);
      if (baseline) {
        const actual = result.matrices[model.output] as Matrix;
        for (let i = 0; i < actual.data.length; i++)
          maxError = Math.max(maxError, Math.abs(actual.data[i] - baseline.data[i]));
      }
      setRuntime({
        backend: result.backend,
        threads: result.threads,
        elapsed: result.elapsed,
        error: maxError,
      });
    }
    setDataset(d);
    setStatus('Ready · all calculations stay in this browser');
  };
  const load = useCallback(async (url: string) => {
    const ticket = ++generation.current;
    setBusy(true);
    setError('');
    try {
      await paint();
      const d = await loadDataset(url, setStatus);
      if (ticket !== generation.current) return;
      await finishLoad(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (initialDatasetUrl) load(initialDatasetUrl);
    fetch(appUrl('data/catalog.json'))
      .then((r) => r.json())
      .then((raw: { id: string; title: string; url: string; rows: number }[]) => {
        const entries = raw.map((entry) => ({ ...entry, url: appUrl(entry.url) }));
        setCatalog(entries);
        if (!initialDatasetUrl) {
          const initial = entries[0]?.url;
          if (initial) load(initial);
          else setError('Choose a dataset to begin.');
        }
      })
      .catch(() => {
        if (!initialDatasetUrl) setError('Open the dataset menu to load a local file.');
      });
  }, [load, initialDatasetUrl]);
  useEffect(() => {
    const onHash = () => setToolState(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (
        document.querySelector('dialog[open]') ||
        document.body.classList.contains('semantic-tour-running')
      )
        return;
      if (e.key === 'Escape') {
        setFocus(false);
        setDialog(null);
        setSelected([]);
      }
      if (e.key === 'f') setFocus((f) => !f);
      if (/^[1-5]$/.test(e.key)) setTool(TOOLS[+e.key - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const applyIntervention = async (next: Intervention) => {
    const d = datasetRef.current;
    if (!d) return;
    setBusy(true);
    setError('');
    try {
      setStatus('Recomputing feature operators…');
      await compute('load', { matrices: Object.fromEntries(d.matrices) });
      if (!next.disabled.length && next.temperature == null && !next.zeroFamilies.length) {
        setIntervened(new Map());
        setPositions(new Map(d.positions));
        setIntervention(next);
        setStatus('Baseline restored');
        return;
      }
      const { updates, positions: p } = await replayIntervention(d, next);
      for (const key of viewState.current.keys())
        if (key.startsWith('uncertainty.')) viewState.current.delete(key);
      setIntervened(updates);
      setPositions(p);
      setIntervention(next);
      setStatus('Intervention applied · frozen weights, original projection');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const trainProbe = async () => {
    if (!dataset || busy) return;
    setBusy(true);
    setError('');
    setStatus('Fitting a logistic probe in WebAssembly…');
    try {
      await paint();
      await finishLoad(await fitLinearProbe(dataset));
      setDialog(null);
      setTool('transform');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const annotateItems = (labels: { id: string; label: number }[], question?: string) => {
    window.dispatchEvent(new Event('semantic:pause-tour'));
    const d = datasetRef.current;
    if (!d) return;
    const byId = new Map(labels.map((x) => [x.id, x.label]));
    const next = {
      ...d,
      manifest: {
        ...d.manifest,
        provenance: {
          ...d.manifest.provenance,
          ...(question ? { auditQuestion: question, labelQuestion: question } : {}),
        },
        items: d.manifest.items.map((item) =>
          item.label == null && byId.has(item.id)
            ? {
                ...item,
                label: byId.get(item.id)!,
                annotations: {
                  ...item.annotations,
                  labelSource: 'mini-audit individual selection',
                },
              }
            : item,
        ),
      },
    };
    datasetRef.current = next;
    setDataset(next);
    setStatus('Individual labels added · open the dataset menu to fit a toy model');
  };
  const keepScore = (values: ArrayLike<number>, description: string) => {
    window.dispatchEvent(new Event('semantic:pause-tour'));
    const d = datasetRef.current;
    if (!d) return;
    const key = 'combined_' + Date.now().toString(36);
    const next = {
      ...d,
      manifest: {
        ...d.manifest,
        primaryScore: key,
        scoreDefinitions: {
          ...d.manifest.scoreDefinitions,
          [key]: { label: 'Combined ranking · saved', kind: 'score' as const },
        },
        items: d.manifest.items.map((item, i) => ({
          ...item,
          scores: { ...item.scores, [key]: Number.isFinite(values[i]) ? values[i] : null },
        })),
        provenance: { ...d.manifest.provenance, lastSavedRanking: description },
      },
    };
    datasetRef.current = next;
    setDataset(next);
    for (const key of ['audit.score', 'numeric.score', 'uncertainty.mode'])
      viewState.current.delete(key);
    setStatus('Combined score saved · ready for sampling and export');
    setTool('uncertainty');
  };
  const importFile = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const d = await importDataset(file, setStatus);
      await finishLoad(d);
      setDialog(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const verifyCosine = async () => {
    if (!dataset) return;
    setBusy(true);
    try {
      await compute('load', { matrices: Object.fromEntries(dataset.matrices) });
      let max = 0;
      for (const bank of dataset.manifest.queries ?? []) {
        setStatus('Recomputing ' + bank.id + ' cosine matrix…');
        const r = await compute('cosine', {
          input: bank.representation,
          queries: 'query.' + bank.id,
          output: bank.similarities,
        });
        const expected = dataset.matrices.get(bank.similarities)!;
        for (let i = 0; i < expected.data.length; i++)
          max = Math.max(max, Math.abs(r.matrix.data[i] - expected.data[i]));
      }
      setStatus('Cosine replay checked · maximum difference ' + max.toExponential(2));
    } catch (e) {
      setError(String(e));
    } finally {
      try {
        // Verification temporarily replaces worker matrices; restore the displayed experiment.
        if (
          intervention.disabled.length ||
          intervention.temperature != null ||
          intervention.zeroFamilies.length
        )
          await replayIntervention(dataset, intervention);
        else await compute('load', { matrices: Object.fromEntries(dataset.matrices) });
      } catch (e) {
        setError(String(e));
      }
      setBusy(false);
    }
  };
  const activeDataset = useMemo(() => {
    if (
      !dataset ||
      !dataset.manifest.model ||
      dataset.manifest.model.kind === 'vector' ||
      !intervened.has(dataset.manifest.model.output) ||
      intervened.get(dataset.manifest.model.output)!.cols !== 1
    )
      return dataset;
    const scores = intervened.get(dataset.manifest.model.output)!.data;
    return {
      ...dataset,
      manifest: {
        ...dataset.manifest,
        items: dataset.manifest.items.map((item, i) => ({
          ...item,
          scores: { ...item.scores, baseline: item.scores?.model ?? null, model: scores[i] },
        })),
      },
    };
  }, [dataset, intervened]);
  const prepare = async (all: boolean) => {
    if (busy || !dataset) return;
    setBusy(true);
    setPreparing(true);
    setError('');
    cancelPreparation.current = false;
    engineStats.storageFailed = false;
    let preparationSucceeded = false;
    const original = dataset,
      originalIntervention = intervention;
    let next = { ...prepared };
    try {
      await paint();
      const sources = all
        ? catalog.map((c) => ({ title: c.title, url: c.url }))
        : [{ title: dataset.manifest.title, url: '' }];
      for (const source of sources) {
        if (cancelPreparation.current) break;
        const d = source.url ? await loadDataset(source.url, setStatus) : original;
        const info = await preparePresentation(
          d,
          (text, done, total) => {
            setStatus(d.manifest.title + ' · ' + text);
            setPreparationProgress(done / total);
          },
          () => cancelPreparation.current,
        );
        if (engineStats.storageFailed)
          throw new Error(
            'Some calculations could not be saved to browser storage. They remain available in this session; free storage and prepare again for reuse after reload.',
          );
        next = {
          ...next,
          [d.manifest.id]: { title: d.manifest.title, ...info, time: new Date().toISOString() },
        };
        if (!(await writeCache('prepared-index', next)))
          throw new Error('Could not persist preparation status.');
        setPrepared(next);
      }
      preparationSucceeded = !cancelPreparation.current;
      setStatus('Presentation prepared · revisited calculations reuse cached results');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatus('Restoring your workspace…');
      try {
        if (
          originalIntervention.disabled.length ||
          originalIntervention.temperature != null ||
          originalIntervention.zeroFamilies.length
        )
          await replayIntervention(original, originalIntervention);
        else {
          await compute('load', { matrices: Object.fromEntries(original.matrices) });
          if (original.manifest.model) {
            const model = original.manifest.model;
            await compute('graph', {
              nodes: model.nodes,
              inputs: model.inputs,
              capture: original.manifest.representations
                .filter((r) => model.nodes.some((n) => n.id === r.id))
                .map((r) => r.id),
            });
          }
        }
      } catch (e) {
        setError(String(e));
      }
      setStatus(
        cancelPreparation.current
          ? 'Preparation stopped · completed results kept'
          : preparationSucceeded
            ? 'Ready · calculations saved as you rehearse'
            : 'Preparation incomplete · completed calculations kept',
      );
      setBusy(false);
      setPreparing(false);
      setPreparationProgress(undefined);
    }
  };
  useSceneAPI({
    dataset,
    activeDataset,
    catalog,
    tool,
    selected,
    pinned,
    representation,
    intervention,
    busy: busy || !!navigating,
    error,
    status,
    viewState: viewState.current,
    finishLoad: async (d) => {
      setBusy(true);
      try {
        await finishLoad(d);
      } finally {
        setBusy(false);
      }
    },
    applyIntervention,
    apply: (state) => {
      window.dispatchEvent(new Event('semantic:pause-tour'));
      setDialog(null);
      setFocus(false);
      setError('');
      setToolState(state.tool);
      setSelected(state.selected);
      setPinned(state.pinned);
      setRepresentation(state.representation);
      viewState.current.replace(state.view);
      history.replaceState(null, '', '#' + state.tool);
    },
  });
  const current = TOOLS.find((t) => t.id === tool)!;
  useEffect(() => {
    (window as any).__lab = {
      dataset,
      tool,
      selected,
      intervention,
      runtime,
      status,
      busy,
      engineStats,
      prepared,
      load,
      applyIntervention,
      setTool,
      setSelected,
      setRepresentation,
    };
  }, [dataset, tool, selected, intervention, runtime, status, busy, prepared]);
  const labValue = useMemo<LabContext>(
    () => ({
      dataset: activeDataset!,
      viewState: viewState.current,
      selected,
      setSelected,
      pinned,
      pin: (i) =>
        setPinned((p) => (p.includes(i) ? p.filter((j) => j !== i) : [...p, i].slice(-12))),
      tool,
      setTool,
      representation,
      setRepresentation,
      positions,
      intervened,
      intervention,
      applyIntervention,
      busy,
      status,
      load,
      annotateItems,
      keepScore,
    }),
    [
      activeDataset,
      selected,
      pinned,
      tool,
      representation,
      positions,
      intervened,
      intervention,
      busy,
      preparing ? null : status,
    ],
  );
  return (
    <div className={'app ' + (focus ? 'focus' : '')}>
      <header className="masthead">
        <a className="brand" href="#space" onClick={() => setTool('space')}>
          <span className="brand-mark">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            Semantic <b>Instruments</b>
          </span>
        </a>

        <div className="masthead-actions">
          <ThemeToggle />
          <GuidedTour
            dataset={dataset}
            busy={busy}
            instrument={instrument}
            onScene={openTourScene}
          />
          <button
            className="toolbar-button"
            aria-label="Things to discover"
            onClick={() => setDialog('lesson')}
          >
            <BookOpen size={15} />
            <span>Things to discover</span>
          </button>
          <button
            className="toolbar-button"
            aria-label="Presentation cache"
            onClick={() => setDialog('presentation')}
          >
            <Database size={15} />
            <span>Presentation cache</span>
          </button>
          <button className="dataset-button" onClick={() => setDialog('data')}>
            <span className="status-dot" />
            {dataset?.manifest.title ?? 'Data laboratory'}
            <span className="dataset-count">
              {dataset ? count(dataset.manifest.items.length) : '…'}
            </span>
          </button>
          <button
            className="icon-button"
            onClick={() => setDialog('methods')}
            aria-label="Methods and provenance"
          >
            <Info size={18} />
          </button>
          <button
            className="icon-button"
            onClick={() => setFocus(!focus)}
            aria-label="Hide top bars"
          >
            <Maximize2 size={17} />
          </button>
        </div>
      </header>
      {!instrument && (
        <nav className="instrument-nav" aria-label="Visual instruments">
          {TOOLS.map((t, i) => (
            <button
              key={t.id}
              disabled={busy}
              onClick={() => setTool(t.id)}
              className={tool === t.id ? 'active' : ''}
              aria-current={tool === t.id ? 'page' : undefined}
            >
              <t.icon size={17} />
              <span>{t.name}</span>
              <small>0{i + 1}</small>
            </button>
          ))}
        </nav>
      )}
      {focus && (
        <div className="focus-toolbar">
          <strong>{current.name}</strong>
          <div>
            <button
              aria-label="Guided tour"
              onClick={() => window.dispatchEvent(new Event('semantic:open-tour'))}
            >
              <Play size={14} /> Guided tour
            </button>
            <button onClick={() => setDialog('lesson')}>
              <BookOpen size={14} /> Things to discover
            </button>
            <button onClick={() => setDialog('presentation')}>
              <Database size={14} /> Cache
            </button>
            <button onClick={() => setFocus(false)}>
              <Minimize2 size={14} /> Show top bars
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => setError('')} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}
      <main
        data-capture="workspace"
        className="instrument-body"
        key={dataset?.manifest.id}
        inert={busy || !!navigating}
        aria-busy={busy || !!navigating}
      >
        {dataset ? (
          <Context.Provider value={labValue}>
            <Instrument key={viewRevision} tool={tool} />
          </Context.Provider>
        ) : (
          <div className="loading-screen">
            <div className="loading-orbit">
              <span />
              <span />
              <span />
            </div>
            <Label>PREPARING THE OBSERVATORY</Label>
            <h2>
              Every point has a story.
              <br />
              <em>Every transformation has a reason.</em>
            </h2>
            <p>{status}</p>
          </div>
        )}
      </main>
      <ActivityIndicator
        busy={busy || !!navigating}
        status={navigating || status}
        progress={preparationProgress}
      />
      <footer className="status-bar">
        <div>
          {busy ? <LoaderCircle size={12} className="spin" /> : <span className="status-dot" />}
          <span>{status}</span>
        </div>
        <div>
          <span>
            {runtime.backend === 'wasm'
              ? 'WASM · ' + runtime.threads + ' threads'
              : 'Numerical engine loading'}
          </span>
          <button className="footer-shortcuts" onClick={() => setFocus((f) => !f)}>
            {focus ? 'Show top bars' : 'Hide top bars'} · F
          </button>
          <button onClick={() => setDialog('data')}>
            Load your dataset <Upload size={12} />
          </button>
        </div>
      </footer>
      <input
        ref={fileInput}
        type="file"
        accept=".json,.zip,.silab,.parquet"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) importFile(e.target.files[0]);
          e.target.value = '';
        }}
      />
      {dialog === 'presentation' && (
        <Modal title="Ready before the room is." onClose={() => setDialog(null)} wide>
          <div className="presentation-dialog">
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
            <p>
              Prepare the data, previews, model replays, preview neighborhoods, sampling defaults,
              and common interventions. Then rehearse your route: every new calculation is saved
              automatically, with its exact inputs.
            </p>
            <div className="presentation-actions">
              <button
                className="primary"
                disabled={busy || !dataset}
                onClick={() => prepare(false)}
              >
                <Database size={16} /> Prepare this dataset
              </button>
              <button
                className="secondary"
                disabled={busy || !catalog.length}
                onClick={() => prepare(true)}
              >
                Prepare all built-in datasets
              </button>
            </div>
            {preparing && (
              <div className="preparation-status" role="status">
                <strong>
                  <LoaderCircle className="spin" size={16} /> {status}
                </strong>
                <progress max={1} value={preparationProgress} />
                <button
                  className="text-button"
                  onClick={() => {
                    cancelPreparation.current = true;
                  }}
                >
                  Stop after this calculation
                </button>
              </div>
            )}
            {Object.entries(prepared).map(([id, p]) => (
              <div className="prepared-dataset" key={id}>
                <CheckCircle2 size={20} />
                <div>
                  <strong>{p.title}</strong>
                  <span>
                    {p.calculations} preparation steps · {p.previews} previews ·{' '}
                    {new Date(p.time).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
            <div className="presentation-notes">
              <h3>Rehearse once. Revisit instantly.</h3>
              <p>
                Cached results are stored in this browser. Exact settings, arrays, and model weights
                determine a match. New settings still calculate, with visible progress. Import an
                exported .silab file again to reuse its matching calculations.
              </p>
              <p>
                Preparation includes pooling temperatures 0.05, 0.1, 0.25, 0.5, and 1, plus
                individual family ablations where available. Live audit answers are computed from
                your actual judgments.
              </p>
              <p>
                <b>{engineStats.hits}</b> calculation cache hits in this session ·{' '}
                <b>{engineStats.saved}</b> results saved.
              </p>
            </div>
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setStatus('Clearing presentation cache…');
                try {
                  await compute('clear', {});
                  setPrepared({});
                  engineStats.storageFailed = false;
                  setStatus('Presentation cache cleared · audit answers preserved');
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Clear presentation cache
            </button>
          </div>
        </Modal>
      )}
      {dialog === 'data' && (
        <Modal
          busy={busy}
          status={status}
          title="A laboratory for your data."
          onClose={() => setDialog(null)}
          wide
        >
          <div className="data-dialog">
            <div>
              <Label>AVAILABLE DATASETS</Label>
              {catalog.map((d) => (
                <button
                  className="dataset-option"
                  disabled={busy}
                  key={d.id}
                  onClick={() => {
                    load(d.url);
                    setDialog(null);
                  }}
                >
                  <div>
                    <strong>{d.title}</strong>
                    <span>{count(d.rows)} identity-bound records</span>
                  </div>
                  {dataset?.manifest.id === d.id ? (
                    <CheckCircle2 size={20} />
                  ) : (
                    <ArrowRight size={20} />
                  )}
                </button>
              ))}
              <div
                className="import-zone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file && !busy) importFile(file);
                }}
              >
                <Upload size={28} />
                <h3>Bring another dataset</h3>
                <p>Drop a .silab / ZIP package, embedded JSON, or Parquet with vector columns.</p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                >
                  Choose a local file
                </button>
                <small>Processed locally. Your dataset is never uploaded.</small>
              </div>
            </div>
            <div>
              <Label>PORTABLE BY DESIGN</Label>
              <h3>
                Identities.
                <br />
                Representations.
                <br />
                <em>Operations.</em>
              </h3>
              <p>
                Start with item IDs and vectors. Labels are optional. The instruments work with
                embeddings, simulation states, sensor measurements, or other numeric data. Queries,
                groups, images, and model graphs add more experiments.
              </p>
              <div className="data-actions">
                {dataset?.imported &&
                  (!dataset.manifest.model ||
                    dataset.manifest.model.id === 'browser-logistic-probe') &&
                  dataset.manifest.items.some((i) => i.label != null) && (
                    <>
                      <button className="primary" disabled={busy} onClick={trainProbe}>
                        {dataset.manifest.model
                          ? 'Refit the browser linear probe'
                          : 'Fit an explainable linear probe'}
                      </button>
                      <p className="micro-note">
                        Uses binary labels, keeps group identities together, and holds out one hash
                        bucket in five. Normalization and weights are fitted on training rows only.
                        This adds a browser model for inspection across the instruments.
                      </p>
                    </>
                  )}
                <button
                  className="secondary"
                  onClick={() =>
                    download(
                      'dataset-template.json',
                      JSON.stringify(template(), null, 2),
                      'application/json',
                    )
                  }
                >
                  <FileJson size={16} />
                  Download a working template
                </button>
                {dataset && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setStatus('Packaging dataset…');
                      try {
                        await paint();
                        await exportDataset(dataset);
                        setStatus('Portable dataset exported');
                      } catch (e) {
                        setError(String(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Download size={16} />
                    Export this dataset package
                  </button>
                )}
              </div>
              <p className="micro-note">
                Parquet convention: id, label, group, category, score, and one or more numeric
                vector columns. A package manifest preserves richer metadata and model structure.
              </p>
              <ImageImport
                onBusy={setBusy}
                onDataset={async (d) => {
                  await finishLoad(d);
                  setTool('space');
                  setDialog(null);
                }}
              />
            </div>
          </div>
        </Modal>
      )}
      {dialog === 'methods' && (
        <Modal
          busy={busy}
          status={status}
          title="The computation behind the instruments."
          onClose={() => setDialog(null)}
          wide
        >
          <div className="methods-grid">
            <div>
              <Label>MEASURED, REPLAYED, EXPLAINED</Label>
              <h3>Inspect the contract.</h3>
              <p>{dataset?.manifest.description}</p>
              <dl>
                {Object.entries(dataset?.manifest.provenance ?? {}).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <Label>BROWSER EXECUTION</Label>
              <div className="metric-row">
                <Metric label="Backend" value={runtime.backend} />
                <Metric label="Threads" value={runtime.threads} />
              </div>
              <Metric
                label="Stored / replayed graph max difference"
                value={
                  Number.isFinite(runtime.error)
                    ? runtime.error.toExponential(2)
                    : 'No model supplied'
                }
              />
              <p>
                Cosine products, PCA projections, and dense-network replay run through TensorFlow.js
                WebAssembly in a dedicated worker. Point-cloud rendering uses Three.js. Operator
                reductions and statistical experiments use deterministic numeric routines.
              </p>
              <button
                className="secondary"
                disabled={busy || !dataset?.manifest.queries?.length}
                onClick={verifyCosine}
              >
                Recompute similarities from embeddings
              </button>
              <p>
                Query changes are frozen-model interventions. Projected distances are separate from
                original-space neighbors. Statistical intervals state their probability model.
              </p>
              <p className="micro-note">
                Local libraries and fonts are bundled. Opening this lab launches no annotation
                service, cloud training, or remote scoring job.
              </p>
            </div>
          </div>
        </Modal>
      )}
      {dialog === 'lesson' && (
        <Modal title="Things to discover" onClose={() => setDialog(null)}>
          <div className="lesson-introduction">
            <h3>{current.title}</h3>
            <p>{current.description}</p>
          </div>
          <div className="lesson-list">
            {(tool === 'space'
              ? [
                  [
                    'Follow an ambiguous example',
                    'Select a thumbnail, pin it, then move from image embeddings to similarities, features, and learned codes. Inspect its changing neighbors.',
                  ],
                  [
                    'Compare two representations',
                    'Open the split view. Brush a region on either side; the same identities highlight on both.',
                  ],
                  [
                    'Separate geometry from performance',
                    'Compare the camera view with original-space neighbors and holdout AP. A clean projection alone does not establish a better classifier.',
                  ],
                ]
              : tool === 'transform'
                ? [
                    [
                      'Remove the strongest counterexample',
                      'Choose a query family, disable its strongest negative phrase, and inspect the margin, gate, and prediction.',
                    ],
                    [
                      'Sweep a pooling temperature',
                      'Choose smooth pooling. Watch the transfer curve approach the maximum as temperature falls.',
                    ],
                    [
                      'Open one neuron',
                      'Select a dense layer and output coordinate. Reconcile its bias, weighted inputs, preactivation, and activation.',
                    ],
                  ]
                : tool === 'compose'
                  ? [
                      [
                        'Dilute an inventory',
                        'Add 100 weak hypothetical observations. Compare maximum, full mean, top-k mean, and expected count.',
                      ],
                      [
                        'Change the evidence you present',
                        'Open the evidence tray. Compare strongest, typical, and counterevidence selected from the same inventory.',
                      ],
                      [
                        'Inspect the probability assumptions',
                        'Supported count uses independent Bernoulli outcomes. Read the tail condition and change confidence.',
                      ],
                    ]
                  : tool === 'rank'
                    ? [
                        [
                          'Hold capacity constant',
                          'Compare two rankings with exactly the same review budget. Inspect their shared and exclusive selections.',
                        ],
                        [
                          'Favor the strongest source',
                          'Change weighted scores to maximum or geometric mean. Pin an example supported by only one input.',
                        ],
                        [
                          'Connect a metric to its records',
                          'Move the cutoff and inspect selected precision, set overlap, and the linked PR curve.',
                        ],
                      ]
                    : [
                        [
                          'Watch evidence accumulate',
                          'Draw ten labels, inspect the five cell posteriors, and then draw fifty more.',
                        ],
                        [
                          'Repeat the experiment',
                          'Keep the population and sampling budget fixed. Repeat 300 draws and reveal the reference answer.',
                        ],
                        [
                          'Introduce selection bias',
                          'Choose the highest-scoring-first policy. Compare its repeated estimates with uniform sampling.',
                        ],
                      ]
            ).map(([title, body], i) => (
              <article key={title}>
                <span>0{i + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </article>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
