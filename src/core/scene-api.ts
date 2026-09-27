import { useLayoutEffect, useRef } from 'react';
import type { Dataset, ToolId, Intervention } from './types';
import { loadDataset } from './dataset';
import { canonical, digest, CACHE_VERSION } from './cache';
import { currentActivities } from './activity';
import { ViewState } from './view-state';
import { frameState, setFrame, renderers, sceneActions } from './scene-runtime';
import {
  COMPONENTS,
  componentManifest,
  componentElement,
  layoutCapture,
  clearCapture,
  captureState,
  type CaptureOptions,
} from './capture-components';
import {
  API_VERSION,
  controlSchema,
  resolveScene,
  supportsScene,
  validateSceneShape,
  validateTimeline,
  timelineScene,
  type SceneSpec,
  type ResolvedScene,
  type Timeline,
} from './scene-schema';
import { TOUR_SCENES } from './tour';
import { auditSessionKey, partitionRanks, summarizeAudit, auditPopulation } from './audit';
import { ranking, row, forwardRow } from './math';
import { mostActive } from './capabilities';
import { atlasBanks, findNormalizers, standardizeRow, strongestFeature } from './feature-atlas';
import { engineStats } from './engine';

interface Bridge {
  dataset: Dataset | null;
  activeDataset: Dataset | null;
  catalog: { id: string; title: string; url: string; rows: number }[];
  tool: ToolId;
  selected: number[];
  pinned: number[];
  representation: string;
  intervention: Intervention;
  busy: boolean;
  error: string;
  status: string;
  viewState: ViewState;
  finishLoad: (d: Dataset) => Promise<void>;
  applyIntervention: (i: Intervention) => Promise<void>;
  apply: (state: ResolvedScene) => void;
}
export interface ReadyOptions {
  timeoutMs?: number;
  component?: string;
  allowMissingMedia?: boolean;
}
const fingerprints = new WeakMap<Dataset, Promise<string>>();
function fingerprint(d: Dataset) {
  let task = fingerprints.get(d);
  if (!task) {
    task = (async () => {
      const manifest = structuredClone(d.manifest);
      // Local serving ports and derived browser PCA metadata are not source-data identities.
      const origin = d.baseUrl ? new URL(d.baseUrl, location.href).origin : null;
      for (const item of manifest.items)
        for (const key of ['media', 'mediaFallback'] as const) {
          if (item[key] && origin) {
            const url = new URL(item[key]!, d.baseUrl);
            if (url.origin === origin) item[key] = url.pathname + url.search;
          }
        }
      for (const rep of manifest.representations)
        if (rep.projection?.method === 'PCA · browser') delete rep.projection;
      return digest(
        canonical({
          manifest,
          matrices: await Promise.all(
            [...d.matrices]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(async ([id, m]) => ({
                id,
                rows: m.rows,
                cols: m.cols,
                sha256: await digest(m.data),
              })),
          ),
        }),
      );
    })();
    fingerprints.set(d, task);
  }
  return task;
}
const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
function visible(el: Element) {
  const r = el.getBoundingClientRect(),
    s = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
}
function makeAPI(get: () => Bridge) {
  let queue: Promise<unknown> = Promise.resolve(),
    sequence = 0,
    timeline: Timeline | null = null;
  const notify = (type: string, detail: unknown) =>
    window.dispatchEvent(new CustomEvent('semantic:' + type, { detail }));
  const serial = <T>(action: () => Promise<T>): Promise<T> => {
    const command = ++sequence;
    const result = queue.then(async () => {
      notify('command', { command, status: 'running' });
      try {
        const value = await action();
        notify('command', { command, status: 'complete' });
        return value;
      } catch (error) {
        notify('command', { command, status: 'error', message: String(error) });
        throw error;
      }
    });
    queue = result.catch(() => {});
    return result;
  };
  async function ready(options: ReadyOptions = {}) {
    if (options.component && !Object.hasOwn(COMPONENTS, options.component))
      throw new Error('Unknown component: ' + options.component);
    const timeout = options.timeoutMs ?? 60000;
    if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 300000)
      throw new Error('timeoutMs must be between 1 and 300000.');
    const deadline = performance.now() + timeout;
    let quiet = 0,
      last = '',
      waiting: string[] = [];
    while (performance.now() < deadline) {
      await nextPaint();
      const b = get();
      if (b.error) throw new Error(b.error);
      const scope = options.component
        ? document.querySelector(
            `[data-capture="${Object.hasOwn(COMPONENTS, options.component) ? options.component : '__missing__'}"]`,
          )
        : document.querySelector('.instrument-body');
      waiting = [];
      if (!b.dataset) waiting.push('dataset');
      if (b.busy) waiting.push(b.status);
      for (const job of currentActivities()) waiting.push(job.label);
      if (!scope) waiting.push('component');
      if (document.fonts.status !== 'loaded') waiting.push('fonts');
      if (scope) {
        const errors = [...scope.querySelectorAll('[role="alert"]')].filter(visible);
        if (errors.length)
          throw new Error(
            'Scene calculation failed: ' + errors.map((e) => e.textContent?.trim()).join('; '),
          );
        const failure = [...scope.querySelectorAll('.media-state.failed')].filter(visible);
        if (failure.length && !options.allowMissingMedia)
          throw new Error(
            'Scene cannot be captured: ' + failure.map((e) => e.textContent?.trim()).join('; '),
          );
        if (
          [...scope.querySelectorAll('.media-state:not(.failed),.inline-loading,.computing')].some(
            visible,
          )
        )
          waiting.push('preview or view calculation');
        for (const img of [...scope.querySelectorAll('img')].filter(visible)) {
          if (!img.complete) waiting.push('image: ' + img.alt);
          else if (!img.naturalWidth) {
            if (!options.allowMissingMedia) throw new Error('Image failed: ' + img.currentSrc);
          } else if (Number(getComputedStyle(img).opacity) === 0) waiting.push('image paint');
        }
      }
      if ([...renderers].some((isReady) => !isReady())) waiting.push('WebGL frame');
      const signature = JSON.stringify({
        tool: b.tool,
        selected: b.selected,
        representation: b.representation,
        controls: [...b.viewState],
        components: componentManifest()
          .filter((c) => c.visible)
          .map((c) => [c.id, c.bounds]),
      });
      quiet = !waiting.length && signature === last ? quiet + 1 : 0;
      last = signature;
      if (quiet >= 3) {
        const images = scope
          ? [...scope.querySelectorAll('img')].filter(
              (e) => visible(e) && e.complete && e.naturalWidth,
            )
          : [];
        await Promise.all(images.map((i) => i.decode().catch(() => {})));
        const result = {
          ready: true as const,
          sequence,
          time: frameState().time,
          missingMedia: options.allowMissingMedia
            ? (scope?.querySelectorAll('.media-state.failed').length ?? 0)
            : 0,
        };
        notify('ready', result);
        return result;
      }
    }
    throw new Error('Capture readiness timed out: ' + (waiting.join(', ') || 'layout is changing'));
  }
  function getState(): SceneSpec {
    const b = get(),
      d = b.dataset;
    if (!d) throw new Error('Dataset is not ready.');
    const v = b.viewState,
      schema = controlSchema(d.manifest),
      controls: NonNullable<SceneSpec['controls']> = {};
    for (const [name, c] of Object.entries(schema))
      controls[name] = (v.has(c.key) ? v.get(c.key) : c.default) as any;
    controls['vector.otherItemId'] =
      d.manifest.items[
        Number(v.get('algebra.other') ?? Math.min(1, d.manifest.items.length - 1))
      ].id;
    controls['simulation.observedIds'] = ((v.get('uncertainty.observed') ?? []) as number[]).map(
      (i) => d.manifest.items[i].id,
    );
    const scene =
      b.tool === 'space'
        ? v.get('space.mode') === 'boundary'
          ? 'space.boundary'
          : v.get('space.compare')
            ? 'space.compare'
            : v.get('space.mode') === 'pca'
              ? 'space.pca'
              : 'space'
        : b.tool === 'transform'
          ? v.get('transform.0') === 'algebra'
            ? 'vector'
            : v.get('transform.0') === 'features'
              ? 'features'
              : v.get('transform.0') === 'network'
                ? v.get('network.view') === 'flow'
                  ? 'network.flow'
                  : 'network'
                : v.get('transform.0') === 'calibration'
                  ? 'reference'
                  : 'queries'
          : b.tool === 'compose'
            ? 'compose'
            : b.tool === 'rank'
              ? 'rank'
              : v.get('uncertainty.mode') === 'mini'
                ? 'audit'
                : v.get('uncertainty.mode') === 'reference'
                  ? 'simulation'
                  : 'numeric';
    return structuredClone({
      schemaVersion: 1,
      dataset: d.sourceUrl ?? d.manifest.id,
      scene,
      representation: b.representation,
      selectedIds: b.selected.map((i) => d.manifest.items[i].id),
      pinnedIds: b.pinned.map((i) => d.manifest.items[i].id),
      controls,
      seed: Number(v.get('numeric.seed') ?? frameState().seed),
      time: frameState().time,
      camera: frameState().camera,
      intervention: b.intervention,
      auditBatches:
        sceneActions.get('audit')?.state?.().batches ??
        (v.get('audit.scripted') ? v.get('audit.scriptedBatches') : []) ??
        [],
    });
  }
  function validateExperiments(
    spec: SceneSpec,
    d: Dataset,
    resolved: ResolvedScene,
    checkMembership = true,
  ) {
    const m = d.manifest,
      next = spec.intervention;
    if (next) {
      if (
        !Array.isArray(next.disabled) ||
        !Array.isArray(next.zeroFamilies) ||
        (next.countNeutral !== undefined && typeof next.countNeutral !== 'boolean') ||
        (next.temperature !== null &&
          (!Number.isFinite(next.temperature) || next.temperature <= 0 || next.temperature > 10))
      )
        throw new Error('Invalid intervention.');
      const bank = m.queries?.find((b) => b.id === next.bankId) ?? m.queries?.[0];
      if ((next.disabled.length || next.zeroFamilies.length || next.temperature !== null) && !bank)
        throw new Error('Intervention requires a query bank.');
      if (next.bankId && !m.queries?.some((b) => b.id === next.bankId))
        throw new Error('Unknown intervention bank.');
      if (
        next.disabled.some((id) => !bank?.items.some((q) => q.id === id)) ||
        next.zeroFamilies.some((f) => !bank?.items.some((q) => q.family === f))
      )
        throw new Error('Intervention references unknown queries or families.');
    }
    const batches = spec.auditBatches ?? [];
    if (!Array.isArray(batches)) throw new Error('auditBatches must be an array.');
    const items = m.items,
      score = String(resolved.view['audit.score']);
    const ordered = auditPopulation(
      items,
      ranking(Float64Array.from(items.map((i) => i.scores?.[score] ?? NaN)), items).filter(
        (i) => items[i].media,
      ),
      String(resolved.view['audit.scope']),
    );
    const cells = partitionRanks(
      ordered.map((i) => items[i].id),
      Math.min(5, Math.max(1, Math.floor(ordered.length / 9))),
    );
    if (
      batches.some(
        (b) =>
          !b ||
          !Array.isArray(b.ids) ||
          typeof b.time !== 'string' ||
          (b.selectedIds &&
            (!Array.isArray(b.selectedIds) ||
              new Set(b.selectedIds).size !== b.selectedIds.length ||
              b.selectedIds.length !== b.positives ||
              b.selectedIds.some((id) => !b.ids.includes(id)))),
      )
    )
      throw new Error('Invalid audit observation.');
    if (checkMembership) summarizeAudit(cells, batches);
    resolved.view['audit.scriptedKey'] = auditSessionKey(
      m.id,
      String(resolved.view['audit.question']),
      score,
      items,
      ordered,
    );
    if (spec.scene === 'audit' && Number(resolved.view['audit.band']) >= cells.length)
      throw new Error('Audit band does not exist.');
  }
  async function setSceneInternal(input: SceneSpec, validateExtra?: (d: Dataset) => void) {
    validateSceneShape(input);
    const spec = structuredClone(input);
    await ready({ allowMissingMedia: true });
    let b = get(),
      d = b.dataset!;
    const source = spec.dataset;
    const entry = b.catalog.find((c) => c.id === source);
    if (source && source !== d.manifest.id && source !== d.sourceUrl) {
      d = await loadDataset(entry?.url ?? source, () => {});
    }
    const resolved = resolveScene(spec, d.manifest);
    const example = resolved.selected[0] ?? 0;
    if (
      spec.scene.startsWith('network') &&
      spec.controls?.['network.coordinate'] === undefined &&
      d.manifest.model
    ) {
      const model = d.manifest.model;
      const trace = forwardRow(
        model.nodes,
        Object.fromEntries(model.inputs.map((id) => [id, row(d.matrices.get(id)!, example)])),
      );
      resolved.view['transform.coordinate'] = mostActive(
        trace[String(resolved.view['transform.8'])] ?? [],
      );
    }
    if (spec.scene === 'features' && spec.controls?.['features.coordinate'] === undefined) {
      const bank = atlasBanks(d.manifest).find((b) => b.id === resolved.view['featureAtlas.bank']);
      const matrix = bank && d.matrices.get(bank.features);
      if (bank && matrix) {
        const normalizers = findNormalizers(
          d.manifest.model,
          bank.features,
          (id) => d.matrices.get(id)?.cols,
        );
        const norm =
          normalizers.find((n) => n.id === resolved.view['featureAtlas.normalizer']) ??
          normalizers[0];
        const raw = row(matrix, example);
        resolved.view['featureAtlas.feature'] = strongestFeature(standardizeRow(raw, norm) ?? raw);
      }
    }
    validateExperiments(spec, d, resolved, false);
    validateExtra?.(d);
    if (spec.fingerprint && spec.fingerprint !== (await fingerprint(d)))
      throw new Error('Dataset fingerprint differs from the saved scene.');
    // Validate first, then commit. Failed validation leaves the current scene intact.
    const original = b;
    const originalFrame = frameState();
    const originalView = Object.fromEntries(b.viewState);
    const originalSpec = getState();
    const previousCapture = captureState();
    clearCapture();
    setFrame({ fixed: true, time: spec.time ?? 0, seed: spec.seed ?? 1, camera: resolved.camera });
    document.documentElement.classList.add('scene-fixed');
    try {
      if (d !== b.dataset) {
        await b.finishLoad(d);
        await nextPaint();
        b = get();
      }
      const intervention = spec.intervention ?? {
        disabled: [],
        temperature: null,
        zeroFamilies: [],
      };
      if (canonical(intervention) !== canonical(b.intervention)) {
        await b.applyIntervention(intervention);
        await nextPaint();
        if (get().error) throw new Error(get().error);
      }
      // Audit membership depends on the scores after the requested intervention.
      validateExperiments(spec, get().activeDataset!, resolved);
    } catch (error) {
      if (get().dataset !== original.dataset) {
        await original.finishLoad(original.dataset!);
        await nextPaint();
      }
      if (canonical(get().intervention) !== canonical(original.intervention)) {
        await get().applyIntervention(original.intervention);
        await nextPaint();
      }
      setFrame(originalFrame);
      document.documentElement.classList.toggle('scene-fixed', originalFrame.fixed);
      get().apply({
        tool: original.tool,
        selected: original.selected,
        pinned: original.pinned,
        representation: original.representation,
        view: originalView,
        spec: originalSpec,
        camera: originalFrame.camera,
      });
      await nextPaint();
      await nextPaint();
      if (previousCapture) layoutCapture(previousCapture);
      throw error;
    }
    resolved.view['audit.scripted'] = true;
    resolved.view['audit.scriptedBatches'] = spec.auditBatches ?? [];
    b.apply(resolved);
    await ready({ allowMissingMedia: !!previousCapture });
    if (previousCapture && document.querySelector(`[data-capture="${previousCapture.component}"]`))
      layoutCapture(previousCapture);
    notify('scene', getState());
    return getState();
  }
  const api = {
    version: API_VERSION,
    ready: (options?: ReadyOptions) => serial(() => ready(options)),
    describe: () => {
      const b = get(),
        d = b.dataset;
      return structuredClone({
        apiVersion: API_VERSION,
        schemaVersion: 1,
        datasets: b.catalog,
        dataset: d
          ? {
              id: d.manifest.id,
              title: d.manifest.title,
              rows: d.manifest.items.length,
              representations: d.manifest.representations.map(({ id, name, kind, dimensions }) => ({
                id,
                name,
                kind,
                dimensions,
              })),
              queryBanks: d.manifest.queries?.map((bank) => ({
                id: bank.id,
                families: [...new Set(bank.items.map((q) => q.family))],
                queries: bank.items,
              })),
              nodes: d.manifest.model?.nodes.map(({ id, op, weight }) => ({
                id,
                op,
                outputs: weight?.length,
              })),
            }
          : null,
        scenes: TOUR_SCENES.map((id) => ({ id, available: !!d && supportsScene(id, d.manifest) })),
        controls: d ? controlSchema(d.manifest) : {},
        components: componentManifest(),
      });
    },
    items: ({
      offset = 0,
      limit = 50,
      mediaOnly = false,
    }: { offset?: number; limit?: number; mediaOnly?: boolean } = {}) => {
      if (
        !Number.isInteger(offset) ||
        offset < 0 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 500
      )
        throw new Error('Use a nonnegative offset and a limit from 1 to 500.');
      const items = (get().activeDataset?.manifest.items ?? []).filter(
        (i) => !mediaOnly || i.media,
      );
      return { total: items.length, items: structuredClone(items.slice(offset, offset + limit)) };
    },
    getState,
    snapshot: () =>
      serial(async () => {
        await ready();
        return { ...getState(), fingerprint: await fingerprint(get().dataset!) };
      }),
    setScene: (scene: SceneSpec) =>
      serial(async () => {
        timeline = null;
        return setSceneInternal(scene);
      }),
    update: (patch: Partial<Omit<SceneSpec, 'schemaVersion'>>) =>
      serial(async () => {
        const current = getState();
        timeline = null;
        const controls = { ...current.controls, ...patch.controls };
        if (
          patch.controls?.['network.branch'] !== undefined &&
          patch.controls['network.node'] === undefined
        ) {
          delete controls['network.node'];
          if (patch.controls['network.coordinate'] === undefined)
            delete controls['network.coordinate'];
        }
        if (
          patch.controls?.['features.bank'] !== undefined &&
          patch.controls['features.bank'] !== current.controls?.['features.bank']
        ) {
          if (patch.controls['features.normalizer'] === undefined)
            controls['features.normalizer'] = '';
          if (patch.controls['features.coordinate'] === undefined)
            delete controls['features.coordinate'];
        }
        return setSceneInternal({
          ...current,
          ...patch,
          controls,
          camera: { ...current.camera, ...patch.camera },
        });
      }),
    loadTimeline: (value: Timeline) =>
      serial(async () => {
        await ready();
        const t = structuredClone(value);
        // Load/validate the dataset before validating dataset-dependent track limits.
        await setSceneInternal(t.scene, (d) => validateTimeline(t, d.manifest));
        timeline = t;
        return setSceneInternal(timelineScene(t, 0));
      }),
    seek: (time: number) =>
      serial(async () => {
        if (timeline) return setSceneInternal(timelineScene(timeline, time));
        if (!Number.isFinite(time) || time < 0)
          throw new Error('Time must be nonnegative seconds.');
        setFrame({ fixed: true, time });
        document.documentElement.classList.add('scene-fixed');
        await ready();
        return getState();
      }),
    prepareCapture: (options: CaptureOptions = {}) =>
      serial(async () => {
        setFrame({ fixed: true });
        document.documentElement.classList.add('scene-fixed');
        layoutCapture(options);
        await ready({ component: options.component ?? 'workspace' });
        return componentManifest().find((c) => c.id === (options.component ?? 'workspace'));
      }),
    releaseCapture: () =>
      serial(async () => {
        clearCapture();
        await ready({ allowMissingMedia: true });
      }),
    release: () =>
      serial(async () => {
        clearCapture();
        setFrame({ fixed: false });
        document.documentElement.classList.remove('scene-fixed');
        get().viewState.set('audit.scripted', false);
        timeline = null;
        await ready({ allowMissingMedia: true });
      }),
    inspect: (id: string) => {
      const el = componentElement(id);
      return {
        component: componentManifest().find((c) => c.id === id),
        text: el.textContent?.trim(),
      };
    },
    receipt: () =>
      serial(async () => {
        await ready({ component: captureState()?.component });
        const d = get().dataset!;
        return {
          apiVersion: API_VERSION,
          cacheVersion: CACHE_VERSION,
          datasetFingerprint: await fingerprint(d),
          scene: getState(),
          capture: captureState(),
          viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
          components: componentManifest().filter((c) => c.visible),
          runtime: { userAgent: navigator.userAgent, cache: { ...engineStats } },
        };
      }),
    audit: {
      state: () => structuredClone(sceneActions.get('audit')?.state?.() ?? null),
      submit: (answer: { positiveIds?: string[]; positives?: number }) =>
        serial(async () => {
          const actions = sceneActions.get('audit');
          if (!actions || !get().viewState.get('audit.scripted'))
            throw new Error('Open an audit scene with setScene first.');
          actions.submit(answer);
          await ready();
          return api.audit.state();
        }),
      undo: () =>
        serial(async () => {
          const actions = sceneActions.get('audit');
          if (!actions || !get().viewState.get('audit.scripted'))
            throw new Error('Open an audit scene with setScene first.');
          actions.undo();
          await ready();
          return api.audit.state();
        }),
    },
    subscribe: (listener: (event: { type: string; detail: unknown }) => void) => {
      const handler = (event: Event) =>
        listener({ type: event.type, detail: (event as CustomEvent).detail });
      const names = ['semantic:scene', 'semantic:ready', 'semantic:command'];
      names.forEach((n) => window.addEventListener(n, handler));
      return () => names.forEach((n) => window.removeEventListener(n, handler));
    },
  };
  return api;
}
export type SceneAPI = ReturnType<typeof makeAPI>;
declare global {
  interface Window {
    semanticInstruments: SceneAPI;
  }
}
export function useSceneAPI(bridge: Bridge) {
  const current = useRef(bridge),
    api = useRef<SceneAPI | null>(null);
  useLayoutEffect(() => {
    current.current = bridge;
  });
  useLayoutEffect(() => {
    api.current ??= makeAPI(() => current.current);
    window.semanticInstruments = api.current;
    window.dispatchEvent(new Event('semantic:api-ready'));
    return () => {
      if (window.semanticInstruments === api.current) delete (window as any).semanticInstruments;
    };
  }, []);
}
