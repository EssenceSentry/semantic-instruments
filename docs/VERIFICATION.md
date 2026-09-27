# Verification record

Current release checks were run on 27 September 2026. Earlier dated sections below preserve the verification history of local builds; descriptions of bundled image fallbacks apply only to those older builds. These are implementation checks and teaching experiments, not a production benchmark.

## Workspace and presentation-cache revision

The September 26 usability revision was checked against the production build:

- Removed the introductory banner from the workspace and moved its contents into the discovery dialog. Focus mode restores through a visible control or Escape.
- All five tools passed overflow and mathematical-rendering checks at 1440×1000, 1280×720, and 390×844. The desktop audit submit control remained visible. The expanded dialog preserved selections in both directions and displayed roughly 331×198-pixel image areas at 1440×1000.
- Fixed a quadratic score-column scan: measured workbench navigation fell from 13.36–13.54 seconds to 56–60 milliseconds in the same browser checks. These timings include automated navigation and state checks.
- Preparing all three built-in datasets completed in 15.49 seconds on this machine. A prepared whole-dataset query/model/projection intervention replayed in 54.9 and 60.6 milliseconds with six cache hits per run and no new computation.
- After a full page reload, the collection reopened in 183 milliseconds; model replay came from the persistent cache, and all three preparation records were retained.
- Adversarial worker checks confirmed that cached graph results restore matrices used by downstream projections, changing weights or array bytes invalidates the result, and queued mutable operations run in request order.
- The first ten linked video thumbnails all loaded directly from HTTPS URLs while the browser remained cross-origin isolated. Shared image loading distinguishes missing sources from failed requests. Blocking the thumbnail host triggered the local fallbacks; a link-only import showed a retry control and recovered after the failure was removed. Export and re-import preserved its HTTPS URL.

Cache keys include a version, operation, exact payload, and content-based dependency identities. Seeds and parameters are part of the payload. The in-memory numerical cache is bounded to 256 MiB; persistent entries are user-clearable. IndexedDB failures leave computation usable and prevent preparation from claiming persistent success.

## Source-backed computation

| Check                                        | Observed result                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Saved image ensemble, all 18,327 rows        | TensorFlow.js WASM maximum probability difference: **3.5762786865234375 × 10⁻⁷**                                                     |
| Saved fusion ensemble, all 2,875 paired rows | TensorFlow.js WASM maximum probability difference: **2.384185791015625 × 10⁻⁷**                                                      |
| Query feature operators                      | Independent reductions agree with saved native matrices on 73 deterministic rows per bank, within 2 × 10⁻⁵                           |
| Intermediate neural arithmetic               | Independent row evaluation agrees with supplied hidden activations and outputs within 4 × 10⁻⁵                                       |
| Query intervention                           | Removing a negative query changed a selected probability from 0.875 to 0.953; full-dataset replay and restoration completed          |
| Group arithmetic                             | A collection mean changed from 0.216 to 0.213 after 100 hypothetical observations at 0.05; supported counts recomputed independently |

Six TensorFlow.js WASM threads were active in the browser used for these checks. The runtime also supports a single-thread path when browser isolation is unavailable.

## Real image → label → toy-model loop

- Imported 25 files containing 24 unique, selected non-graphic thumbnails.
- Ran the pinned SigLIP ONNX encoder using **8-bit WebAssembly**. Obtained 24 finite 768-dimensional vectors. Maximum L2-normalization error: **1.3774 × 10⁻⁸**. One byte-identical duplicate was removed.
- The measured run took **11.54 seconds** on this machine. This is a local run measurement, not a cold-download or cross-machine speed claim.
- Entered known fixture labels through the actual image-selection UI: four batches, 24 distinct images, 12 positives. These were scripted validation judgments.
- Fitted the browser logistic model on 20 rows, with 4 rows held out. The recorded objective fell from **0.693147** to **0.002189**. The tiny holdout is not a generalization claim.
- Exported and re-imported images, vectors, labels, and model parameters. All 24 media records and labels survived; maximum model replay difference was **5.9605 × 10⁻⁸**.
- Separately exercised automatic device selection: **WebGPU** successfully encoded two images in 8-bit precision. The run returned finite vectors, reported WebGPU with no fallback, and took **8.99 seconds** including setup. The two-row projection correctly disabled three-PC rotation.
- Refit the exported toy model and checked that its representations remained unique.

## Audit and statistical checks

The 19 passing numerical and cache tests include partition coverage, no repeated audit identities, invalid-count rejection, exact census collapse, analytic posterior-mean agreement, finite-population standard errors, signed vector norms, general vector-valued graph validation, tied-score average precision, strict gates, pooling, and exact independent-count probabilities.

The actual interface also passed these checks:

- A count of 10 for nine images was rejected; a count of 7 saved nine IDs and seven positives with **no invented individual labels**.
- Audit batches survived a page reload and could be undone.
- Keyboard Enter submitted a selection grid and produced the expected count.
- A deliberately failed thumbnail request disabled submission. Retrying restored all nine images and enabled the batch.
- Taking a census of all 360 oscillator records made the estimated numeric mean and both interval endpoints equal the population mean.

## Reusability and interaction

All five tools were exercised on both the weapons example and a dataset without labels or a model. The independent oscillator example exercised vector arithmetic, signed measurements, grouping, rank fusion, and numeric sampling. Probability-only count operators stayed unavailable for arbitrary quantities; geometric means were disabled for signed inputs.

Embedded JSON, Parquet, and `.silab` imports passed. A separate 240-row vector dataset fitted a 192-row training / 48-row holdout probe, with objective 0.693146 → 0.092731 and zero stored-versus-replayed probability difference. Export/re-import retained that model. Standalone tool routes loaded the requested dataset without the five-tool navigation.

A saved combined ranking fed into Uncertainty Explorer as a new named scalar column. Linked selections, query interventions, neuron inspection, collection reductions, rankings, reference-label experiments, and data export were exercised through the UI.

## Display and packaging

The five tools passed root-page overflow and mathematical-rendering checks at **1440×1000, 1280×720, 559×863, and 390×844**. The audit grid's submit control fits the initial desktop workspace at both tested desktop sizes. Narrow layouts scroll inside the workspace. There were no uncaught JavaScript errors in these checks. The sole deliberately failed image request recovered as described above.

TypeScript and the production build passed. The installed dependency audit reported zero known vulnerabilities. SigLIP weights are downloaded on first use and are **not** bundled in the portable ZIP; the included weapons data and native model replay work locally without that download.

The previous presentation remains clean at commit `cb80bab407462cf17e11564146a8ea880e765745`, also referenced by the preserved `field-guide-v1` tag. The original repositories were not edited. The earlier build described in this section was local only. The current source release is published separately on GitHub.

## Guided narration (v1.2)

The optional JSON-driven tours were verified through the rendered interface:

- All **80** image-collection explanations, **82** paired-video explanations and **42** applicable generic oscillator explanations opened their intended scenes and rendered their prose and mathematics.
- Full walks passed at 1440×1000 (image collection), 1280×720 (paired videos) and 390×844 (oscillators and image collection), with no out-of-viewport bubbles, empty explanations, root horizontal overflow or uncaught JavaScript errors.
- The compact bubble treatment uses 19px headings and 12px body text on desktop. Deeper mathematical explanations start open; lengthy narration scrolls inside the bubble while navigation remains visible.
- Next/Back, chapter jumps, slider arrow keys, Escape, persistence through reload, custom narration persistence, and completion all worked. Tours stayed closed on reload until explicitly resumed.
- Expanding the mini-audit paused the tour, retained the pending image selection, and resumed at the same explanation. Walking the tour did not change submitted audit batches or apply model interventions.
- Custom JSON imported locally, substituted dataset facts, rendered equations, and exported to a standalone JSON file. Unknown executable scene names were rejected. HTML-like text remained literal text and created no image element.
- The existing 19 numerical/cache tests and six additional curriculum/schema/KaTeX tests passed: **25 total**. TypeScript and the production build passed.

The narration is grounded in the supplied manifests and actual instrument calculations. It separates saved neural inference from a hypothetical retraining path, query percentiles from class probabilities, the preview audit population from the full vector population, and posterior draws from repeated sampling. The Seamless explanation describes its execution role without claiming the browser is running a remote job.

## Scene and capture API (26 September 2026)

The API build was checked against the application served directly from `Repos/semantic-instruments/site` on port 8773.

- All **31** numerical, cache, tour and scene-contract tests passed. TypeScript and the production build passed. All **286** files in the new production build match their served copies; old hashed assets are retained for previously opened tabs.
- The API discovers **59** named controls and **36** capture components. All **26** available scenes opened on the weapons image collection and the paired multimodal dataset without UI clicks. The independent oscillator dataset exercised vector captures, repeated numeric sampling and cross-dataset snapshot restoration.
- Changing a query temperature changed the actual computed output. Snapshot restoration recovered the controls and the dataset fingerprint. Invalid controls preserved the current scene; overlapping commands completed in request order.
- Native-size PNG captures cover all five instruments. Seeking the WebGL camera to 2 seconds, then 0.25 seconds, then 2 seconds reproduced identical image bytes for the repeated time. A smooth query-temperature timeline also reproduced identical frames after an out-of-order seek.
- Scripted audit counts updated the actual finite-population posterior, survived snapshot/replay, and could be undone. Count-only input created no individual labels. Saved browser audit history was unchanged. A deliberately failed media state caused capture readiness to reject.
- Dataset-wide model interventions changed predictions and replayed from snapshots. An audit performed after an intervention replayed the same posterior after restoring the baseline and returning to the intervention. Invalid audit replay rolled back both model and audit state.
- Existing guided-tour navigation, pause behavior and expanded-audit controls still worked. The normal interface passed overflow and mathematical-rendering checks at 1280×720 and 390×844 after API use.

The model and audit assertions use scripted observations for verification. They are not new human labels or model-quality measurements. Exact image-byte equality was checked within the same Chrome/browser environment.

Reproduce the checks with `npm test`, `npm run verify:api`, `npm run verify:interventions` and `npm run verify:ui`. Set `LAB_URL=http://127.0.0.1:8773/` to target the main server. Browser evidence and PNG/JSON capture receipts live under `output/playwright/`; reusable source and example storyboards belong to the public source release. Generated browser evidence remains local and ignored by Git.

## Model instruments and URL-only publication (27 September 2026)

- **71 tests pass**, covering native-model agreement, pooling and count-neutral removal, feature-atlas arithmetic, arbitrary graph topology and layout, cache identities, scene contracts, chart loading states, and public media packaging.
- The atlas explains raw values, saved standardization and intervention deltas. A non-weapons, unlabeled feature dataset with a constructed nonlinear/residual graph exercises the same atlas and network components.
- Count-neutral removal adds exactly `tau * log(N/k)` to the surviving LSE pool. Saved temperatures remain unchanged unless the explicit override is enabled. Browser checks confirm dataset-wide intervention and snapshot replay agree with the inspector.
- The model-flow refactor first reproduced byte-identical SVG output for both recorded datasets, before the deliberate spacing and readability fixes. Contributions and ensemble values are independently checked against the actual forward pass.
- The full 18,327-row simulation-scene resolver measured **32.7 ms** in the latest local test run. Earlier measurements in this revision ranged around 27–55 ms under different test loads. This is scene-state resolution, not model-training time.
- The URL-only build passes **11 scene/capture API checks**, the three intervention/replay checks and the existing desktop/mobile UI suite. An additional **10 model-view checks** cover atlas selection, theme persistence, capture-theme restoration, branch selection, saved-temperature behavior, paired and generic data, audit replay and responsive viewport containment.
- **All 58 supplied thumbnail URLs loaded directly from YouTube** in the real browser, with no local fallback. The paired dataset is the default. The larger image-model reference retains its numerical data but has no public previews because source URLs were not recorded.
- Image assets were also removed from the portable toy-model example; its five remaining entries are numeric matrices and manifest metadata. Tests inspect packaged examples as well as public files, preventing hidden image payloads from being reintroduced.
- Opus 5.5 workers implemented bounded atlas, flow, pooling, theme, refactor and documentation tasks. A separate Opus review inspected about 60 rendered screenshots and reported concrete layout defects. Parent verification covers the mathematics, actual browser behavior and publication contents; worker completion alone is not treated as a passing check.

The public history starts with the image-free source tree. Earlier local history, original thumbnails, private worker logs and screenshot evidence stay local and are not pushed. URL availability is external; failed previews retain an explicit retry state and cannot be silently submitted as inspected audit images.

### Follow-up visual verification

The parent reproduced the review findings against the integrated production build. Network labels have no intersecting SVG text bounds on either recorded model, and focused SVG neurons show their focus stroke. Feature inspector values match the exact selected matrix row after dataset changes. At 1280, 900 and 390 px, the atlas and model keep real scroll containers; graphs retain their height and the complete feature inspector is reachable.

A focused tour test opened 33 combinations of target and viewport at 1440, 900 and 390 px, checking navigation, internal narration scrolling, root-page offsets and bubble bounds. The small highlighted controls were not covered. On the three previously obscured phone views, the feature grid, model diagram and precision-recall plot remain visible above the narration; the targeted checks bound their overlap and reject fully hidden controls. Desktop atlas narration fits beside the grid. Screenshots were also inspected manually to catch layout compression that page-overflow checks alone miss.

The responsive stylesheet was delivered by Opus 5.5 before its runner timed out; the parent reviewed and corrected its grid sizing before verification. The tour placement received further parent corrections for actual scroll range and focus on the plotted component. No Claude worker remains active.
