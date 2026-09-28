# Scene and capture API

The laboratory exposes `window.semanticInstruments` (API version **1.1.0**). It controls the existing React components and numerical engine directly. No UI clicks, screenshots of menus, or weapon-specific renderer are involved.

Use the running application at `http://127.0.0.1:8773/`. The same API exists in every instrument route. The API is local to its browser page: a browser automation host, a same-origin parent, or the browser console can call it. No public network-control endpoint is started.

## A first scene

```js
const lab = window.semanticInstruments;
await lab.ready();

// Discover supported scenes, controls, available options and rendered components.
const description = lab.describe();
// Items come from the loaded dataset; weapons-paired is the default.
const example = lab.items({ mediaOnly: true, limit: 1 }).items[0];

await lab.setScene({
  schemaVersion: 1,
  dataset: 'weapons-paired',
  scene: 'queries.pooling',
  selectedIds: [example.id],
  controls: { 'queries.temperature': 0.15 },
  seed: 42,
});

// Recompute the view through the same arithmetic used by the slider.
await lab.update({ controls: { 'queries.temperature': 0.45 } });
```

A scene replaces the visual configuration with deterministic defaults plus its explicit controls. Omitted controls do not inherit the last visitor's settings. `update` merges a patch into the current scene. API calls that change state run in request order and return promises. Await them before taking a frame.

Built-in dataset IDs are `weapons-paired` (the default), `weapons-collection`, and `damped-oscillators`. The collection has no previews, so `describe().scenes` reports its `audit` scene as unavailable. The paired previews are remote thumbnail links: capturing a scene that shows them needs network access, and `ready()` rejects failed images unless `allowMissingMedia` is set. A dataset may also be an HTTP manifest URL. For a dataset imported through the UI, use its ID while it remains loaded; a scene JSON references data and does not contain the dataset itself.

## Available methods

| Method                                    | Result                                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `describe()`                              | Dataset catalog, representations, query banks, neural nodes, scene availability, typed controls and component manifest |
| `items({offset, limit, mediaOnly})`       | A page of records, addressed by stable IDs; maximum 500 per call                                                       |
| `setScene(scene, options?)`               | Replace scene configuration and await the settled view; `{ allowMissingMedia: true }` settles despite failed previews  |
| `update(patch)`                           | Merge controls, selection, camera or other fields into the current scene                                               |
| `getState()`                              | Current JSON-compatible scene configuration                                                                            |
| `snapshot()`                              | Settled configuration plus a SHA-256 dataset fingerprint                                                               |
| `ready(options?)`                         | Wait for calculations, layout, fonts, decoded images and WebGL frames                                                  |
| `inspect(componentId)`                    | Component metadata and rendered text                                                                                   |
| `prepareCapture({component, background})` | Render one component at the browser viewport size; `background` is `white` (default), `theme` or `transparent`         |
| `releaseCapture()`                        | Restore the application layout and theme while keeping the fixed scene clock                                           |
| `release()`                               | Restore interactive animation, application layout and the user's saved audit session                                   |
| `loadTimeline(timeline)`                  | Load a parameter animation and seek to its start                                                                       |
| `seek(seconds)`                           | Render the state at an absolute time; arbitrary seek order is supported                                                |
| `receipt()`                               | Scene, fingerprint, component bounds, viewport, pixel ratio and runtime information                                    |
| `subscribe(listener)`                     | Listen to scene, ready and command events; returns an unsubscribe function                                             |
| `audit.state()`                           | Pending image IDs, reviewed batches and posterior values                                                               |
| `audit.submit(answer)`                    | Submit explicit individual selections or an explicit positive count                                                    |
| `audit.undo()`                            | Remove the last scripted audit batch                                                                                   |

`ready({timeoutMs, component, allowMissingMedia})` defaults to a 60-second timeout. Missing or failed media rejects capture by default. `allowMissingMedia: true` is an explicit diagnostic option; mathematical errors still reject readiness. Unknown component IDs and invalid scene values fail explicitly. Readiness does not mean that an arbitrarily dense view will fit every possible frame size: inspect the component's `scrollSize` and choose a suitable viewport or a smaller component.

## Scene JSON

```json
{
  "schemaVersion": 1,
  "dataset": "damped-oscillators",
  "scene": "vector.blend",
  "controls": {
    "vector.alpha": 0.65
  },
  "seed": 7,
  "time": 0,
  "camera": { "zoom": 1, "panX": 0, "panY": 0, "angle": 0 }
}
```

Optional fields include `representation`, `selectedIds`, `pinnedIds`, `fingerprint`, `intervention` and `auditBatches`. Scene and control names are discoverable through `describe()`; unavailable capabilities are reported rather than invented for a dataset. Item selections and the vector-pair control use item IDs, not row positions.

The camera controls the scatter views. `angle` is radians, pan coordinates use the renderer's normalized coordinates, and zoom ranges from 0.5 to 12. When `space.rotate` is true, the fixed camera angle advances by 0.15 radians per scene second. Representation changes settle at their actual coordinates; historical training trajectories are not generated.

`intervention` explicitly applies the existing frozen-model operation across the dataset:

```js
const bank = lab.describe().dataset.queryBanks[0];
await lab.update({
  intervention: {
    bankId: bank.id,
    disabled: [bank.queries[0].id],
    zeroFamilies: [],
    temperature: null, // keep every saved LSE temperature
    countNeutral: true, // LSE + τ·log(N/k) for k of N surviving phrases
  },
});
```

Discover the actual bank and query IDs first. `temperature: null` keeps each feature's saved temperature; a positive number up to 10 replaces every saved LSE temperature in that bank. `countNeutral: true` keeps each smooth pool at its original phrase count, `τ log Σ exp(sᵢ/τ) + τ log(N/k)`; it only matters when queries are disabled. An omitted `countNeutral` means ordinary removal. The UI's **Apply** sends its **Phrase removal** choice, whose default is count-neutral.

The view controls `queries.temperature`, `queries.temperatureOverride` and `queries.countNeutral` change the local calculation, as the UI does. With `queries.temperatureOverride: false` (the default), the temperature slider only moves the one-pool preview; the local feature preview and frozen-model prediction keep saved temperatures. The explicit `intervention` changes dataset-wide features and frozen-model outputs. An omitted intervention in a new scene restores the baseline.

Saved scenes are reproducible configurations, not copies of all browser storage. They include the exposed controls, selections, shared scatter camera, model intervention and scripted audit observations. Arbitrary dialog state, scroll positions and historical reference-experiment repetitions are not recorded.

## Model views

The Transformation Workbench has three scenes for a dataset's features and graph. All of them show the scene's first selected item.

| Scene          | Requires                            | Controls                                                                       |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| `features`     | A representation of kind `features` | `features.bank`, `features.mode`, `features.coordinate`, `features.normalizer` |
| `network.flow` | A model graph with a dense node     | `network.branch`, `network.node`, `network.coordinate`                         |
| `network`      | A model graph with a dense node     | `network.node`, `network.coordinate`, `network.inputOffset`                    |

- `features.bank` is a query bank's feature matrix or a supplied features representation without queries. Options come from `describe().controls`.
- `features.mode` is `standardized` (default), `raw` or `delta`. Standardized values use the saved mean and scale of a `normalize` node that reads the matrix, directly or through a concatenation. Without one, the atlas displays raw values. `delta` is intervened minus baseline and is zero unless the scene's `intervention` recomputes that bank.
- `features.coordinate` is a zero-based column and must be smaller than the bank's width. The scene default is column 0.
- `features.normalizer` selects a saved normalize node; empty selects the first compatible one. A node that does not read the bank is rejected.
- `network.view` (`flow` or `arithmetic`) follows the scene name: `network.flow` shows the whole graph, `network` shows one dense neuron's arithmetic.
- `network.branch` names an ensemble member, or the output when the graph has no ensemble. Empty selects the first member. When a scene sets a branch but omits `network.node`, the first dense node upstream of that branch is inspected.
- `network.coordinate` must be smaller than the chosen node's output width.

```js
await lab.setScene({
  schemaVersion: 1,
  dataset: 'weapons-collection',
  scene: 'features',
  controls: { 'features.mode': 'raw', 'features.coordinate': 4 },
  seed: 42,
});
await lab.prepareCapture({ component: 'features.inspector' });

const branches = lab.describe().controls['network.branch'].options.filter(Boolean);
await lab.setScene({
  schemaVersion: 1,
  dataset: 'weapons-collection',
  scene: 'network.flow',
  controls: { 'network.branch': branches[1] ?? branches[0] },
  seed: 42,
});
await lab.prepareCapture({ component: 'network.flow' });
```

The flow's columns, branches, residual and nonlinear roles, and ensemble are derived only from each node's declared `inputs`. Edges show `w·x` for the selected item, not raw weights. Each neuron draws its largest terms, and the readout accounts exactly for the remaining terms and bias. When the graph averages several members, `network.members` shows each member's output and their mean.

Neither view needs weapons data. Import `examples/engineered-features.json` with **Load your dataset**, then address it by its ID, `engineered-signal-demo`, while it remains loaded. It is a synthetic, unlabeled toy graph with three generic features, no query bank, a tanh head and a linear residual joined by an add node:

```js
await lab.setScene({ schemaVersion: 1, dataset: 'engineered-signal-demo', scene: 'network.flow' });
```

## Capturing individual components

Each capturable region has a stable `data-capture` identity, independent of its CSS class. `describe().components` reports its title, renderer type, mounted/visible status, bounds and scroll dimensions. Examples:

| Area        | Component IDs                                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Space       | `space.scatter`, `space.primary`, `space.comparison`, `space.neighbors`, `space.inspector`                                              |
| Vectors     | `vector.geometry`, `vector.metrics`, `vector.detail`                                                                                    |
| Queries     | `queries.input`, `queries.list`, `queries.operation`, `queries.output`, `queries.competition`, `queries.features`, `queries.prediction` |
| Example     | `transform.example` (shared example strip in the feature and network scenes)                                                            |
| Features    | `features.atlas`, `features.inspector`                                                                                                  |
| Network     | `network.flow`, `network.members`, `network.diagram`, `network.calculation`, `network.contributions`, `network.neuron`                  |
| Reference   | `reference.ecdf`                                                                                                                        |
| Collections | `compose.equation`, `compose.collections`, `compose.collectionA`, `compose.collectionB`                                                 |
| Ranking     | `rank.lanes`, `rank.sets`, `rank.curves`                                                                                                |
| Audit       | `audit.task`, `audit.grid`, `audit.math`, `audit.curve`                                                                                 |
| Sampling    | `simulation.population`, `simulation.distribution`, `numeric.summary`, `numeric.distribution`                                           |

`workspace` captures the full instrument. A component must be mounted in the chosen scene. `prepareCapture` isolates the original DOM component and reflows it at the requested browser viewport; it does not clone HTML or flatten WebGL through a DOM-to-canvas library. `network.flow` and `network.members` belong to the `network.flow` scene; the other network components belong to `network`.

`background` chooses the frame:

- `'white'` (default) renders on the white theme. If the viewer chose dark mode, the page switches to light for the capture, and `releaseCapture()` or `release()` restores their theme. The stored preference is never changed.
- `'theme'` keeps the page's current theme. In the fresh browser context used by the capture client, that is the white default.
- `'transparent'` keeps the current theme and removes the frame background; intentional backgrounds within the component remain part of its design.

The Node adapter in `scripts/capture-client.mjs` controls a fresh Chrome context and produces PNG files with JSON receipts. The receipts record the image hash, scene, source-data fingerprint, dimensions, mathematical seed and runtime. Existing browser review sessions are not reused.

```js
import { createCaptureClient } from './scripts/capture-client.mjs';

const studio = await createCaptureClient({ width: 1920, height: 1080, scale: 2 });
try {
  await studio.render(
    {
      schemaVersion: 1,
      dataset: 'weapons-collection',
      scene: 'network',
      seed: 42,
    },
    'output/captures/neural.png',
    { component: 'network.diagram' },
  );
  await studio.render(
    { schemaVersion: 1, dataset: 'weapons-collection', scene: 'network.flow', seed: 42 },
    'output/captures/model-flow.png',
    { component: 'network.flow', background: 'transparent' },
  );
} finally {
  await studio.close();
}
```

This uses installed Google Chrome by default. For another Playwright-supported browser channel, supply `channel` when creating the client. Pixel equality is tested within the same browser and rendering environment; different GPUs, browser versions and fonts can rasterize differently. Numerical scenes and receipts remain inspectable.

## Seekable parameter animation

```js
await lab.loadTimeline({
  scene: {
    schemaVersion: 1,
    dataset: 'weapons-collection',
    scene: 'queries.pooling',
    seed: 42,
  },
  duration: 2,
  tracks: [
    {
      control: 'queries.temperature',
      from: 0.05,
      to: 0.6,
      easing: 'smoothstep',
    },
  ],
});
await lab.seek(1.5);
await lab.prepareCapture({ component: 'queries.operation' });
```

Tracks interpolate continuous numeric controls with `linear` or `smoothstep` easing and optional `start`/`end` times. Discrete choices such as item IDs, layer IDs and integer sample counts belong in separate scenes. Each seek computes the absolute parameter values; it does not advance a wall-clock animation or accumulate prior frames. The application uses its existing computation cache for repeated states.

A compositor such as HyperFrames can request a scene or time, await completion, then use the captured frame and receipt. Narration and composition remain separate from the scene API. No HyperFrames dependency or video-encoding process is required for this layer.

## Replaying a mini-audit

Opening an audit through the API creates an isolated scripted session. It does not overwrite local review history or create training labels.

```js
await lab.setScene({ schemaVersion: 1, dataset: 'weapons-paired', scene: 'audit', seed: 42 });
const batch = lab.audit.state();
// Supply observations from your reviewer or an explicitly identified teaching fixture.
await lab.audit.submit({ positives: 4 });
// Or: await lab.audit.submit({ positiveIds: reviewedPositiveIds });
const sceneWithObservations = await lab.snapshot();
await lab.audit.undo();
await lab.setScene(sceneWithObservations);
```

Counts must be valid for the pending batch. Individual positive IDs must belong to it. Count-only observations never imply individual labels. Images must finish loading before submission. The posterior comes from the existing finite-population Monte Carlo computation, using the scene seed. Exported scripted observation times refer to the scene clock, not to claimed real-world review dates. `release()` returns the UI to the user's stored audit history.

## Run the included storyboards

With the app served locally:

```sh
npm run capture -- examples/storyboards/weapons.json
npm run capture -- examples/storyboards/oscillators.json --out output/captures/oscillators
npm run verify:api
npm run verify:interventions
npm run verify:ui
```

The weapons storyboard renders scenes from each instrument plus a parameter animation. The oscillator example demonstrates reuse with a non-classification dataset. `--url` selects another running lab. `--out` chooses the output folder. Browser verification defaults to port 8775; set `LAB_URL=http://127.0.0.1:8773/` to verify the main server.

For the production build and bundled compressed arrays, use the supplied Python server:

```sh
npm run build
python3 scripts/serve.py --directory dist --port 8775
```

The server treats `.f32.gz` as binary data, preserving the bytes expected by the dataset's checksums.

To keep a long-running server on port 8773, serve `site/` with `python3 serve.py --directory site --port 8773`. After editing source, `npm run build:site` rebuilds and refreshes that folder, switching the entry document last. Previously opened tabs retain access to their older hashed assets until refreshed.
