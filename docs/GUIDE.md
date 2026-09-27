# Semantic Instruments · hands-on guide

## Follow a guided explanation

Open **Guided tour** in the top bar. Weapons data selects the collection-specific narration automatically; **Narration** can switch to the generic tour. Start the full path or select a chapter. Bubbles explain the meaning of each operation with the relevant control highlighted and live.

- **Next / Back** and the left/right arrows move through the tour. Arrow keys still adjust focused sliders and select controls.
- **Pause tour / Escape** saves your place without clearing your selected example. The tour does not reopen automatically after reload; **Resume tour** offers the saved step.
- The chapter name at the top of each bubble opens the chapter list.
- Deeper mathematics is open by default. Collapse individual details, or change the default in **Customize the narration**.
- Opening an audit popup, dataset menu or preparation window pauses the tour. Pending audit selections stay intact.
- Advancing the tour never submits labels, trains a model or applies a population-wide intervention. Use those controls explicitly whenever you want to run an experiment.

The generic path has 83 steps, and the weapons path adds four dataset-specific steps. Both automatically omit steps whose capabilities the loaded dataset lacks; for example, the weapons image collection has no previews, so its path skips the mini-audit. Progress is separate for every dataset, narration and narration version.

**Customize the narration** lets you download the resolved JSON, edit the explanations, or import a custom tour. The portable site's `tours/README.md` describes the format; `default.json` and `weapons.json` are ready-to-edit examples. A customized document can replace text while inheriting the default view navigation.

This is a small experimental laboratory. Every control changes a calculation or a view of real data. The weapons datasets provide a worked example; the tools also accept other vectors, measures, labels, and executable model graphs.

Open the dataset menu at the top right to switch datasets, import local files or images, fit a toy model, and export your work. Use **1–5** to change instruments and **F** to give the current instrument more room. **Show top bars** (or Escape) restores the toolbar. Introductory text is inside **Things to discover**, leaving the workspace available for the instruments. Controls keep their values as you move between tools. Loading another dataset starts a fresh workspace. The moon button switches to an optional dark theme; the choice is remembered in this browser, and the white theme is the default.

## Prepare a presentation

Open **Presentation cache → Prepare all built-in datasets** before presenting. This loads the arrays and previews and computes the supplied model replays, both neighbor metrics for the available previews in every representation, default sampling distributions, supported counts, and the common query interventions listed in the dialog. A progress bar shows the current step; **Stop after this calculation** retains completed work.

Rehearse the settings you intend to use. Every numerical-worker calculation is saved automatically, including its exact inputs, parameters, seed, and model dependencies. Revisiting those settings reuses the result. Changed inputs calculate normally with visible activity. Preparation does not enumerate every possible continuous slider value or future audit answer.

Numerical results and decoded built-in arrays persist in this browser using IndexedDB. Changing data or weights invalidates matching computations; URL-backed arrays are persistently reused only when the manifest supplies their content hashes. **Clear presentation cache** removes stored computation and media entries without deleting audit answers. Browser storage is local to this address and browser profile.

Linked thumbnails render directly from their HTTPS URLs. Preparation warms those images in the browser. No preview images are bundled: the 58 reviewed paired-video previews load from the public thumbnail host and need a network connection, while all numerical work continues offline. A thumbnail served today may differ from the one that was embedded. Images you import yourself are cached separately as local bytes. Neither image links nor thumbnails alter the recorded embedding vectors.

## 1. Follow geometry in Space Explorer

Select a thumbnail and pin it. Move along the representation rail: image embeddings → query similarities → pooled features → learned activations → score. The same identity stays selected. The cloud moves because its representation changes.

Turn on the linked comparison and choose another representation. A neighboring point in a 2D projection need not be a true neighbor in the original space: the strip below computes cosine or Euclidean neighbors using every vector coordinate. The **Previews** switch restricts that search to examples with images.

- **UMAP map** is a supplied overview, labeled with its parameters.
- **PCA view** uses the first principal components. Rotation uses three PCs.
- **Positive × negative** uses actual feature values as axes. The diagonal is the strict gate boundary.

Cosine similarity measures direction, `x·y / (||x|| ||y||)`. Euclidean distance also responds to magnitude. Try both with the oscillator simulation or the raw and normalized outputs of your own image encoder.

## 2. Open arithmetic in Transformation Workbench

**Vector algebra** is available for any vector dataset. Choose two records, inspect their dot product coordinate by coordinate, and change the interpolation coefficient. The two-vector plane preserves their norms and angle; it is not a projection fitted to the whole dataset. Displayed coordinate bars show a subset, while the calculations use all dimensions.

For the weapons example, open a query family. The positive maximum `a` and negative maximum `b` produce different summaries:

- Margin: `a − b` retains the strength of the contrast.
- Strict gate: `a × 1[a > b]` switches discontinuously at the boundary.
- Runner-up gap: the top score minus the second score measures dominance within a side.
- Log-sum-exp: `τ log Σ exp(sᵢ/τ)` approaches the maximum as temperature shrinks. It is unnormalized, so repeated support matters.

The temperature slider previews one pool. Saved model features keep their own saved temperatures unless you tick **Override all saved LSE temperatures with this τ**; only then do the local prediction and **Apply** use the slider value for every LSE feature.

Remove a query and watch the selected example change. **Phrase removal** chooses how smooth pools treat the smaller set:

- **Count-neutral LSE** (default) keeps the original phrase-count factor: with k of N phrases remaining, the pool is `LSE_τ(surviving) + τ log(N/k)`. This equals rescaling the surviving exponential sum by N/k; with nothing removed it adds 0.
- **Ordinary removal** drops the phrases, so the pool changes both through the surviving similarities and through the smaller count.

Maxima, gaps, margins and gates respond to removal identically in both modes. **Apply across the dataset** recomputes features and replays the frozen model for every row. The projection axes remain fixed. This is an intervention with fixed model weights, not retraining.

**Feature atlas** lays out one features matrix for the selected example. Query-derived features appear as family rows × operator columns from their saved definitions; a generic features representation without queries appears as a flat grid of coordinates. Three value modes:

- **Standardized** uses the saved mean and scale of a `normalize` node that reads this matrix, directly or as a segment of a concatenation: `z = (x − μ) / σ`. If no saved normalization reads it, raw values are shown; statistics are never estimated from the loaded rows. When several normalize nodes read the matrix, choose one.
- **Raw** shows the stored values.
- **Δ Intervention** shows intervened minus baseline raw values; it is zero until an applied intervention recomputes this bank.

Select a cell to see its formula from the saved metadata, with this example's similarities substituted, the contributing phrases, and a check that the recomputed value matches the stored one. Coordinates without operator metadata show their stored value only.

**Neural network → Model flow** draws the declared graph for the selected example, one column per stage. Dense edges carry the actual terms `w·x` for this input, not raw weights. Their widths scale with `|w·x|` within each layer. Each neuron shows its three largest terms, or eight for the selected neuron; layers wider than 32 are drawn as strips with edges only for the selected neuron. The readout sums the remainder and the bias exactly, so no term is dropped from the arithmetic. Add nodes label their inputs as an identity skip, a linear residual or a nonlinear head, according to the graph connections. A mean over several inputs is shown as an ensemble: switch between members and compare each member's output with their mean. Select a neuron to open its arithmetic.

To try both views away from the weapons model, load `examples/engineered-features.json` through the dataset menu. It is a synthetic, unlabeled toy graph without queries: three generic features, a tanh head and a linear residual joined by an add node.

**Neuron arithmetic** opens an actual dense layer. Choose an output neuron to inspect `zⱼ = bⱼ + Σᵢ wⱼᵢ xᵢ`, then its activation. The contribution view preserves signs. A local perturbation changes the selected layer input and its displayed neuron result; the rest of the graph remains the reference computation.

**Reference distributions** locates a scalar in an empirical distribution. A percentile answers “where does this value fall among these records?” It is not automatically a calibrated probability.

## 3. Build summaries in Evidence Composer

Choose a quantity and group observations by identity or category. Compare two collections using maximum, mean, top-k mean, sum, or fraction above a threshold. Add hypothetical observations to collection A and see which summaries change.

The top-k denominator is the number actually retained: a collection with fewer than k observations is not padded with zeros. A mean responds to additional weak evidence; a maximum may remain unchanged. **Score profiles** show the full ordered inventory; **Evidence tray** shows the consequences of a selection policy.

For declared probabilities, a sum is an expected positive count. **Supported count** uses the exact Poisson-binomial tail under independent Bernoulli outcomes. Its guarantee is conditional on that probability model. This is a different calculation from estimating prevalence through a human audit.

## 4. Compare orderings in Ranking Comparator

Choose two named scores. Follow an example across its left, combined, and right ranks. Change the review capacity and inspect what each ordering includes or excludes.

Weighted score fusion depends on source scales. Reciprocal rank fusion uses `α/(60+rₐ) + (1−α)/(60+rᵦ)`, so it depends on order. Geometric means require nonnegative inputs. Comparisons use records with both scores and resolve ties by stable item ID.

Where labels exist, precision–recall curves summarize the labeled cohort; tied scores are grouped when computing average precision. With partial labels, the displayed labeled precision describes the reviewed subset, not all selected records.

**Keep score & open sampling** saves the computed combination as a named score snapshot and opens Uncertainty Explorer. It can be included in the exported dataset.

## 5. Observe uncertainty in Uncertainty Explorer

### Mini-audit

Choose a rank band. Select matching images in the 3×3 grid, or type the number of positives. The final batch in a band may contain fewer than nine images. Space toggles a focused tile; Enter submits the selection grid or count form.

The calculation uses each band's population size `N`, reviewed count `n`, and positive count `s`:

1. Draw a band rate `q ~ Beta(1+s, 1+n−s)`.
2. Keep the observed positives fixed and draw unseen positives: `K = s + Binomial(N−n, q)`.
3. Accumulate positives across rank bands and divide by the accumulated population size.
4. Repeat 2,500 times to obtain a precision ribbon and distribution of possible qualifying cutoffs.

The intervals are pointwise at band boundaries. The largest boundary whose lower bound meets the target is an exploratory choice, not a simultaneous statistical certificate. Independent band priors and within-band exchangeability are the model assumptions.

A batch count does not identify which images are positive. Selection mode does identify them and can fill missing labels for toy-model fitting. Existing reference labels remain intact. Audit batches are saved in browser storage; **Undo last batch** reverses the latest answer, and **Export audit** preserves the full question, population, sample IDs, and counts.

When the dataset has fit rows and held-out previews, the audit population defaults to **Held-out previews**, so fit rows are excluded. **All ranked previews** includes fit rows and is not an independent check of generalization. For the paired weapons data, the population is its 58 reviewed previews, all held out. Its results do not estimate prevalence across all loaded weapons records. The weapons image collection has no previews, so its mini-audit is unavailable.

**Expand audit** opens a large image grid in a dialog. Selection, count entry, current band, and submission use the same session as the workspace. Close the dialog to return without losing the pending selection.

### Reference-label experiment

Hide known labels, sample uniformly, stratify across rank bands, or deliberately select the highest scores. Reveal the answer and repeat experiments. This makes the effect of sampling policy visible without needing additional manual review.

### Sampling a quantity

Estimate the mean of any scalar measure. Uniform sampling without replacement uses the estimated standard error `sqrt((1−n/N) s²/n)`. The displayed 95% interval is a normal approximation. The finite-population correction becomes zero at a census. Selecting the largest values demonstrates selection bias; the uniform-sampling interval is invalid under that policy.

## Start with images and train a toy model

1. Choose 12–100 local PNG, JPEG, or WebP images in the dataset menu.
2. Compute embeddings. The browser downloads a pinned SigLIP encoder on first use, then processes images locally. Choose 8-bit or 32-bit precision and automatic WebGPU/WASM or explicit WASM execution.
3. Inspect the vectors. Raw encoder norms are geometric measurements, not predictions.
4. Use the mini-audit to select positives and apply the individual labels to unlabeled records.
5. Open the dataset menu and fit the linear probe. At least eight fitting rows and both classes are required. Group identities stay together; normalization uses only fitting rows. The deterministic split, loss curve, coefficients, and probabilities are inspectable.
6. Add more individual labels and refit, or export the complete dataset to continue later.

The probe performs real logistic-regression optimization in WebAssembly. It is intentionally small and transparent. The included native weapons networks are replayed from saved parameters; their historical training trajectories are not invented.

## Keep the work portable

**Export this dataset package** includes identities, local images, vectors, labels, declared graph weights, and supplied or saved scores. HTTPS thumbnails remain links. Import the resulting `.silab` file into another copy of the lab. Temporary query interventions are experiments; the dataset export retains its stored baseline. Export the mini-audit separately to preserve its full review record.

The built-in arrays and calculations work without a backend or network connection. Linked thumbnails are loaded on demand. New SigLIP encoding needs a first-use download of public model files; image files are never uploaded.

## Image browsing

Image-based views prefer records with supplied previews. Ranking lanes can **Browse supplied previews**, and the evidence tray has its own preview filter. These controls change the displayed examples, not the population used in ranking metrics or collection summaries. Ranks still show each record's position in the full eligible cohort. Records without images say **No preview supplied**; failed image requests show a loading or retry state rather than a blank tile.
