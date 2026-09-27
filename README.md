# Semantic Instruments

[Open the hosted lab](https://essencesentry.github.io/semantic-instruments/).

Five small, executable visual instruments for vectors, models, rankings, aggregation, and uncertainty. Weapons classification is the included case study; the same tools also work with simulation states and other numeric datasets. This is a learning laboratory for quick, inspectable experiments and toy models. Five independent instruments share item identities, selections, pinned examples, and real computed interventions. The interface uses a modern white design and fills the viewport; deeper controls scroll inside their own workspace. An optional dark theme is available from the moon button in the top bar; the choice is saved in this browser, and white remains the default.

## Run

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:8773/**. For a production build, either serve `dist/` directly:

```sh
npm run build
python3 scripts/serve.py            # serves dist/ on port 8773
```

or build and refresh the `site/` folder, then serve that:

```sh
npm run build:site
python3 serve.py --directory site --port 8773
```

A built site needs only Python to view it. Serve it over HTTP rather than opening its HTML as a file. All libraries, saved weapons-model parameters, vectors, projections and fonts are included, so every numerical computation also works offline. No image files are bundled. The reviewed video previews are direct links to public thumbnail URLs and need a network connection. Optional SigLIP image import downloads public encoder weights on first use; those weights are not included. No backend or cloud account is needed to use the lab.

## GitHub Pages

The [Pages workflow](.github/workflows/pages.yml) tests, builds, and publishes the lab after every push to `main`; it can also be run manually from GitHub Actions. Only the built `dist/` directory is deployed. The build takes its base path from the Pages configuration, so datasets, tours, fonts, and WebAssembly assets load under the project's address.

GitHub Pages runs the existing single-thread WebAssembly fallback because it does not supply the local server's cross-origin isolation headers. Local serving with those headers can use multiple WebAssembly threads. Thumbnail previews continue to use their public YouTube URLs; no image files are uploaded with the site.

To build the same project path locally:

```sh
npm run build -- --base=/semantic-instruments/
```

## The instruments

| Instrument               | What it computes and exposes                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Space Explorer           | Identified records moving through embeddings, query similarities, features, hidden activations, and probabilities; linked views, brush selection, exact vector neighbors, direct polarity axes, PCA camera rotation.                                                                                                                                    |
| Transformation Workbench | Vector dot products, angles, interpolation, query maxima, runner-up gaps, margins, strict polarity gates, temperature sweeps, ordinary or count-neutral query removal, a feature atlas (raw, saved-standardized and intervention Δ), the model graph's weighted flow, neuron contributions, local perturbations, and empirical reference distributions. |
| Evidence Composer        | Inspectable collections, mean/max/top-k summaries, expected and supported counts, threshold fractions, hypothetical additions, score profiles, and evidence-selection policies.                                                                                                                                                                         |
| Ranking Comparator       | Deterministic rankings, weighted/max/geometric/RRF combinations, selected-item connections, capacity cutoffs, shared/exclusive sets, and linked precision–recall curves.                                                                                                                                                                                |
| Uncertainty Explorer     | A captcha-style mini-audit, count-only input, finite-population Monte Carlo, numeric-mean sampling, hidden reference outcomes, uniform/stratified/greedy sampling, alternative cell-rate priors, posterior predictive intervals, repeated experiments, and revealed truth.                                                                              |

Use **1–5** to switch instruments, **F** for focus, and **Escape** to close a dialog or clear selection. Instrument controls survive navigation. Loading a dataset starts a fresh workspace. The **Things to discover** button supplies short experiments; the tools can be used in any order.

## Guided tours

**Guided tour** opens a linear, optional path through the mathematics. The generic narration has 83 steps. The weapons narration extends it with four dataset-specific steps and loads automatically for the two weapons datasets. Both omit steps whose capabilities the loaded dataset lacks: for example, the image collection has no previews, so its tour skips the mini-audit chapter.

Use chapter jumps, Next/Back or arrow keys, and Escape to pause. Mathematical details are expanded by default and can be collapsed. Resume restores the last step after a reload. Opening a window, including the expanded mini-audit, pauses the tour without submitting observations. Moving through a tour changes views only; computations and audit submissions remain explicit user actions.

Narration lives in `public/tours/default.json` and `public/tours/weapons.json`. **Customize the narration** downloads a self-contained JSON tour or imports a local one. The [tour format guide](public/tours/README.md) documents scenes, targets, capability requirements, dataset tokens and specialization. No application-code changes are needed to rewrite or specialize a tour.

## Included data

- **Weapons · paired videos** (the default dataset): 2,875 channel-grouped development-holdout records; image and text vectors; 178 image and 302 text queries; 121 image and 229 text features; saved multimodal fusion and frozen image-transfer models. Channel inventories here contain the loaded labeled holdout, not complete channel histories. It supports all five instruments, including a mini-audit of 58 reviewed, held-out previews. Each preview links to `https://i.ytimg.com/vi/<videoId>/hqdefault.jpg` for its recorded video ID; nothing is copied or bundled. A thumbnail served today may differ from the one that was embedded, and links can become unavailable.
- **Weapons · image collection:** 18,327 image records with 768-dimensional SigLIP vectors; 178 image queries; 121 features; saved image-model parameters and activations. Metrics use the 5,494 byte-grouped holdout rows. The saved records carry content hashes but no verified source URLs, so this dataset has no previews. Its numerical and model lessons work; its image mini-audit is unavailable.

- **Damped oscillators:** 360 analytic simulation states across six oscillators, with position, velocity, acceleration, energy, and multiple scalar measures. No labels or classifier are involved.

The weapons-model parameters come from saved native artifacts. The browser replays their graph; transitions between displayed spaces are animations. **Model flow** draws that declared graph — its members, residual and nonlinear branches, and ensemble mean — from the graph connections rather than from a weapons-specific layout. No historical training checkpoints are invented. The text auxiliary score is explicitly named: it is the first member's branch readout, not a text-only ensemble.

## Bring another dataset

Use **Load your dataset** to import embedded JSON, a `.silab`/ZIP package, or Parquet. A working synthetic template is available in that dialog. `examples/engineered-features.json` is a second synthetic, non-weapons example: 32 unlabeled records with three generic features and no query bank, plus a constructed toy graph: a declared normalization (μ = 0, σ = 1), then a tanh layer and nonlinear head added to a linear residual. Its parameters were built for teaching and not fitted. It exercises the feature atlas and model flow. See [the dataset contract](docs/DATA_CONTRACT.md) for fields, matrix layout, query operators, and the executable graph format.

Vectors alone enable all five instruments: the loader derives a vector-norm quantity when no scalar measures are supplied. Dot products, aggregation, ordering, and sampling do not require class labels. Binary labels also enable an optional **explainable linear probe** fitted in WebAssembly. That probe adds score-based exploration, a directly inspectable model, and a recorded loss curve. Scores, groups, queries, and model graphs unlock their corresponding instruments without fitting anything. Probability-specific operations require probability metadata; arbitrary quantities are not silently treated as probabilities.

Import and model fitting stay in the browser. Export creates a portable package of the loaded dataset, including a fitted browser probe when present. Frozen-query interventions are temporary workspace experiments; exporting the loaded dataset preserves its baseline.

## A real small-scale image workflow

1. Open **Load your dataset → Start with your images**. Choose a modest image collection and compute SigLIP embeddings. The default 8-bit encoder download is approximately 100 MB; 32-bit weights are approximately 372 MB. WebGPU is attempted automatically, with a WebAssembly fallback and an explicit WASM option.
2. Inspect geometry and vector arithmetic. Raw and L2-normalized 768D embeddings are both retained. Identical file bytes are deduplicated by SHA-256.
3. Open **Uncertainty Explorer → Mini-audit** and define the positive concept. Select matching images in the 3×3 grid, or switch to **Type a count** and enter 0–9. Batches sample without replacement inside rank bands.
4. Individual selections can become labels for unlabeled records. Open the dataset menu and fit an explainable linear probe; refit it after collecting more labels. Count-only answers never fabricate per-image labels.
5. Inspect the fitted coefficients and loss curve, compare rankings, and export a portable package containing images, vectors, labels, and the fitted model.

The mini-audit saves batches in browser storage. Its posterior uses independent Beta(1,1) band-rate priors and exact beta-binomial predictive draws for the unobserved part. The precision ribbon is a pointwise 95% interval at band boundaries; it is not a simultaneous cutoff guarantee. When a dataset has fit rows and held-out previews, the audit population defaults to the held-out previews; **All ranked previews** is an explicit alternative that includes fit rows. For the paired weapons data, the population is its 58 reviewed, held-out previews, and results describe only that audited preview population. They are not extrapolated to the full dataset.

See [the hands-on guide](docs/GUIDE.md) for short experiments and the mathematics behind each instrument.

## Programmable scenes and capture

The browser exposes `window.semanticInstruments` for direct scene configuration, stable item selections, component discovery, mathematical parameters, deterministic seeking and isolated mini-audit replay. Scenes include the feature atlas (`features`), the model flow (`network.flow`) and dense-neuron arithmetic (`network`). Captures render on white by default; `background: 'theme'` keeps the viewer's theme and `'transparent'` removes the frame. The [scene API guide](docs/SCENE_API.md) contains the contract, reusable examples and capture instructions.

```sh
npm run capture -- examples/storyboards/weapons.json
npm run capture -- examples/storyboards/oscillators.json --out output/captures/oscillators
```

Capture runs against the local server, using a fresh browser context. PNG images have adjacent JSON receipts with scene parameters, dataset fingerprints and image hashes. Scenes that show previews need network access to the thumbnail host. Generated captures go to the ignored `output/` folder.

## Implementation

React and TypeScript organize the five tools. Three.js renders identified points with WebGL. D3 handles quantitative scales and paths. TensorFlow.js WebAssembly performs cosine products, PCA, network replay, and optional logistic fitting in a worker. Exact count reductions and mini-audit Monte Carlo also run in the worker. A separate lazy worker runs Transformers.js and ONNX Runtime for SigLIP image encoding. Hyparquet reads local Parquet files, fflate handles packages, and KaTeX renders equations. The local server supplies the isolation headers needed for threaded WebAssembly.

The data contract and numeric routines are separate from the instrument components. The weapons exporter is separate from the browser runtime. Supporting another dataset does not require editing a visualization component. Each tool can also open on its own with `?instrument=space`, `transform`, `compose`, `rank`, or `uncertainty`; an optional `dataset` query parameter selects a manifest URL.

## Validation and data preparation

```sh
npm test
npm run build
```

The numerical tests compare exported native features, activations, and probabilities with independent implementations and exercise ties, gates, pooling, counts, missing inputs, and identity alignment. Browser checks cover interventions, imports, fitting, export/reimport, and viewport behavior. See [the verification record](docs/VERIFICATION.md).

All runtime data is already prepared and included. Regeneration is optional and needs the original native model artifacts, which are not part of this repository: `scripts/export_weapons.py --source <artifact directory>` reads them read-only, then `scripts/prepare_overview.py` and `scripts/finalize-data.py` run on the exported files. The public media inventory, `scripts/media-selection.json`, lists the 58 reviewed paired-video preview URLs and no collection previews. Finalization only attaches those links; it copies and downloads no images.

The source is published at https://github.com/EssenceSentry/semantic-instruments.
