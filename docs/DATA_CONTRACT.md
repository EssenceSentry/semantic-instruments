# Portable dataset contract · version 1

One manifest identifies the rows shared by every representation. Vectors remain in their original space; projections are additional views. The runtime never joins arrays by guessed order.

## Minimal JSON

```json
{
  "schemaVersion": 1,
  "id": "my-dataset-v1",
  "title": "My annotated vectors",
  "items": [
    { "id": "a", "label": 1, "group": "group-a", "scores": { "model": 0.8 } },
    { "id": "b", "label": 0, "group": "group-b", "scores": { "model": 0.2 } }
  ],
  "representations": [
    {
      "id": "embedding",
      "name": "Semantic vectors",
      "kind": "embedding",
      "dimensions": 3,
      "matrix": {
        "rows": 2,
        "cols": 3,
        "values": [
          [1, 0, 0.2],
          [0, 1, -0.1]
        ]
      }
    }
  ]
}
```

IDs are unique nonempty strings. Labels are optional; a supplied binary target is `0`, `1`, or `null`. Missing labels become null. Matrix row _i_ always belongs to item _i_. Numeric matrices must be finite and rectangular. Optional item fields: `name`, `group`, `category`, `split`, `media`, `mediaFallback`, `scores`, and scalar-valued `annotations`. Scores are named finite numbers or null; `primaryScore` selects the initial scalar measure. All named measures are available for aggregation, ranking, reference distributions, and sampling. When no measures exist, the loader derives `vector_norm` from the first representation.

`split: "holdout"` identifies the evaluation cohort. A supplied model uses its declared threshold or 0.5. Unknown labels are excluded from label-based metrics. Label-based metrics and toy logistic fitting use one binary target; other operations work without any target. Create a binary label view when studying one class in a multiclass or multilabel dataset.

Set `provenance.positiveLabel` and `provenance.negativeLabel` for class names. Set `provenance.scoreLabels` to an object mapping score IDs to display names. Provenance is displayed in the Methods dialog.

## Meaning and defaults

`scoreDefinitions` maps each score ID to `{ "label": "Display name", "kind": "quantity" | "score" | "probability", "unit": "optional unit" }`. Probability declarations enable expected/supported-count interpretations. Declaring a quantity in [0,1] does not turn it into a probability.

`presets` may provide `groupBy: "group" | "category"`, a `queryFamily`, `ranking: {"left": "score_a", "right": "score_b"}`, and `relatedDataset: {"label": "Dataset name", "url": "/data/example/manifest.json"}`. These are adapter defaults; the instrument components contain no weapons-specific families or dataset IDs.

`provenance.auditQuestion` supplies an initial human-review question. Audit batches preserve the question, ranked population, partition, sampled IDs, and positive counts. Selection-mode batches additionally record `selectedIds`; count-only batches omit them. Applying selection labels fills only missing item labels and retains existing reference labels.

## Binary packages

A `.silab` file is a ZIP containing `manifest.json`, referenced arrays, and optional `media/` files. A matrix reference can replace inline values:

```json
{ "rows": 12000, "cols": 768, "url": "embedding.f32.gz", "encoding": "f32-gzip" }
```

Arrays are **little-endian, row-major float32**, optionally gzip-compressed. Matrix URLs must be relative package paths. The loader checks the shape, byte count, finiteness, and row identity count. Each matrix is capped at 160 million elements; local packages are capped at 700 MB. These are input bounds, not a promise that every machine has enough memory for the maximum.

Media can use a package-local `media/example.jpg` path, an embedded PNG/JPEG/WebP data URL, or an HTTPS thumbnail URL. URLs render directly as image links; no JavaScript byte download or CORS-readable response is required for display. `mediaFallback` optionally supplies another supported image source when the primary image fails. Credential-bearing URLs and non-HTTPS external schemes are rejected. Package-local images become browser blob URLs. URL references survive export/import; local fallbacks are bundled. Matrices and local images are not uploaded.

The supplied server uses COOP `same-origin` and COEP `credentialless`, which permits ordinary cross-origin images while retaining cross-origin isolation for threaded WebAssembly in supporting browsers. The image host can still refuse embedding. See the [COEP documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy).

The built-in weapon manifests include SHA-256 file inventories for reproducibility. The HTTP dataset loader verifies declared file hashes before caching decoded arrays. Local package import validates shape and values; hashes are not a package signature. Export removes stale hash inventories.

## Projection metadata

Each representation may carry:

```json
{
  "projection": {
    "method": "PCA",
    "mean": [0.2, 0.3, 0.1],
    "components": [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ],
    "explained": [0.6, 0.3, 0.1],
    "positions": {
      "rows": 2,
      "cols": 3,
      "values": [
        [0.8, -0.3, 0.1],
        [-0.2, 0.7, -0.2]
      ]
    }
  }
}
```

Without positions, the browser applies the supplied PCA axes or computes up to three axes by deterministic deflated power iteration. This is approximate PCA, not a full eigendecomposition. It applies the covariance operator implicitly, avoiding a dimension-squared matrix. An `overview` may contain a supplied two-dimensional layout and its parameters; it is kept distinct from PCA. UMAP is precomputed for the two bundled cohorts.

Interventions project through the original axes, so a refitted camera does not hide the change. Cosine and Euclidean neighborhoods always use full original vectors. PCA camera rotation uses the first three PCs; it is not a high-dimensional Grand Tour.

## Query and feature operations

Supply a `queries` bank with `id`, input `representation`, ordered `items`, `vectors`, `similarities`, and `features`. Query items carry `id`, `text`, `family`, and `polarity` (`positive` or `negative`). Query vectors must have the same width as their input representation. The named similarity representation has one column per query.

`featureDefinitions[bankId]` declares the ordered output columns. Supported kinds: `max`, `second`, `gap`, `margin`, `gate`, `lse`, and `groupMargin`. Family-based definitions name `family`; side-based definitions include `polarity`; LSE includes `temperature`. Positive gates use the strict condition `positive_max > negative_max`. LSE is unnormalized. A bank without usable definitions cannot supply operator interventions.

## Executable model graph

`model.inputs` names supplied matrices. Nodes are topologically ordered and use `normalize`, `dense`, `concat`, `add`, `mean`, or `sigmoid`. Dense weights are **[output][input]**, with one bias per output; activation is `linear`, `relu`, or `tanh`. Normalization is `(x − mean) / scale` with positive scales. `concat` joins feature columns; `add` and `mean` operate elementwise. `output` names a supplied representation. Set `kind: "probability"` for a scalar classifier or `kind: "vector"` for a general vector-valued graph. The first output coordinate is shown in the neural inspector; hidden representations preserve all coordinates.

Hidden activations become selectable spaces by including representations whose IDs match graph-node IDs. Graph replay captures those matrices. A three-member classifier can be represented by three separate branches followed by an elementwise mean of sigmoid probabilities.

An export describes an inference graph. It does not execute Python, arbitrary JavaScript, or source-repository code.

## Parquet and row JSON

Vector columns must contain numeric lists with consistent widths. Recognized scalar columns are `id` (or `asset_id`/`video_id`), `name`/`title`, `label`, `group`, `category`, `score`, and `media` (or `thumbnail_url`/`image_url`). Boolean labels become 0/1; absent labels become null. `score` becomes the primary `model` score. A richer manifest supports multiple named scores and model structure.

## Optional browser probe

For an imported dataset without a supplied model, **Fit an explainable linear probe** trains logistic regression on the first embedding representation (or first available vector representation). It requires at least eight fitting rows and both labels.

The default partition holds out bucket 0 of a deterministic five-bucket FNV-1a hash of group ID, falling back to item ID. A supplied `fit`/`holdout` partition is respected. Means and scales use only fitting rows. The worker performs 250 full-batch gradient steps with learning rate 0.08 on mean binary cross-entropy plus `0.001 × ||w||² / 2`. The loss history, partition, coefficients, normalized vectors, and probabilities are inspectable and exportable. This is a transparent teaching model, independent of the supplied weapons networks.

## Local image encoding

The image importer uses `Xenova/siglip-base-patch16-224` at revision `4649052661e53c7000355844105f8a1792088239` through Transformers.js 3.8.1. It decodes RGB images, applies the pinned processor, reads the 768D pooled output, and stores both raw and L2-normalized matrices. Provenance records precision, actual execution backend, duplicate count, and elapsed time. Item IDs hash original file bytes; dataset IDs hash the complete ordered identity list. Thumbnail JPEGs are derived locally for display and export. They are not the inputs used for embedding.

Imported image vectors form a new dataset. They are not silently joined to the bundled native vector corpus, whose encoder implementation and precision differ. Images never leave the browser. Model weights are fetched from Hugging Face and cached when the browser supports it.

Standalone routes: `/?instrument=space&dataset=/data/dynamics/manifest.json` opens one tool against a manifest. The React app also accepts `instrument` and `initialDatasetUrl` props. A portable dataset can be imported into any of these routes.
