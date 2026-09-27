# Guided tour format

The laboratory reads `default.json` and `weapons.json` at startup. The default is a reusable curriculum. The weapons document extends it, replacing explanations and inserting collection-specific lessons. It is selected automatically for `weapons-collection` and `weapons-paired`. The narration selector also makes the generic tour available for those datasets.

Use **Guided tour → Customize the narration** to download the current resolved tour or load your own JSON. Downloaded tours are self-contained: inheritance has already been resolved. A custom tour and its progress stay in the current browser. Loading a tour does not upload it anywhere.

## A small standalone tour

```json
{
  "schemaVersion": 1,
  "id": "my-vector-lesson",
  "version": 1,
  "title": "What does similarity measure?",
  "description": "An introduction to the vectors in this dataset.",
  "chapters": [
    { "id": "geometry", "title": "Vector geometry", "description": "Read distance and angle." }
  ],
  "steps": [
    {
      "id": "cosine",
      "chapter": "geometry",
      "scene": "vector",
      "target": "vectorGeometry",
      "title": "Direction carries information",
      "body": ["This pair comes from {{title}}.", "Compare the angle with the lengths of the two vectors."],
      "formula": "\\cos\\theta=\\frac{a^\\top b}{\\|a\\|\\,\\|b\\|}",
      "detail": {
        "title": "Why normalization matters",
        "body": ["Cosine divides out the vector lengths. A zero vector has no defined direction."]
      },
      "try": "Select a different second vector and compare its angle."
    }
  ]
}
```

Omit `target` for a centered conceptual explanation. Text is treated as plain text, not HTML. Formulas are rendered with KaTeX, with trusted commands disabled. No JavaScript, remote scripts, external navigation or arbitrary selectors can be executed from a tour.

## Specialize the default

```json
{
  "schemaVersion": 1,
  "id": "my-collection",
  "version": 1,
  "title": "The meaning of our collection",
  "description": "Our dataset, explained with the generic instruments.",
  "extends": "default",
  "datasetIds": ["my-dataset-id"],
  "overrides": {
    "loaded-data": {
      "title": "Begin with our measurement process",
      "body": ["There are {{records}} records in {{title}}.", "Explain how these observations were collected here."]
    }
  },
  "additions": [
    {
      "after": "loaded-data",
      "id": "my-context",
      "chapter": "orientation",
      "scene": "space",
      "target": "dataset",
      "title": "Define the unit of observation",
      "body": ["One row is one observation. Describe its sampling frame and units here."]
    }
  ]
}
```

Overrides change `title`, `body`, `formula`, `detail` or `try`, preserving the default navigation and capability requirements. Added steps use `after` to name an existing step. Chapters and step IDs must be unique. Increase `version` when an edited lesson should start with fresh progress. `datasetIds` is optional; omit it for a reusable tour.

A document can contain at most 300 resolved steps and must be smaller than 500 KB when imported. Only one custom tour is retained in browser storage at a time; download it before replacing it if you want to keep it.

## Chapters and capability requirements

Default chapter IDs: `orientation`, `geometry`, `features`, `model`, `collections`, `ranking`, `audit`, `sampling`.

Optional `requires` lists capabilities that must all exist: `queries`, `multiQuery`, `neural`, `probability`, `media`, `labels`, `holdout`, `overview`, `multipleRepresentations`.

For example, a neural explanation should include `"requires": ["neural"]`; an image mini-audit explanation should include `"requires": ["media"]`. Unavailable lessons and empty chapters are omitted. Standalone instrument embeds further restrict the tour to that instrument.

## Scenes

Scenes open a tool and the required view. They never run model training, submit audit answers, change labels, apply dataset-wide interventions or load a different dataset. A user can explicitly perform those actions while exploring. Scene navigation changes view controls; other experiment state is retained.

- Geometry: `space`, `space.pca`, `space.compare`, `space.boundary`
- Vector arithmetic: `vector`, `vector.dot`, `vector.distance`, `vector.blend`
- Query features: `queries`, `queries.top2`, `queries.pooling`
- Model and distribution: `network`, `reference`
- Collections: `compose`, `compose.mean`, `compose.sum`, `compose.supported`, `compose.profile`, `compose.dossier`
- Ranking: `rank`, `rank.rrf`, `rank.sets`, `rank.curve`
- Uncertainty: `audit`, `simulation`, `numeric`

When writing a tour, use a target available in that scene. Unsupported target names are rejected on import. If an expected control is missing at runtime, the tour pauses with an explanation and retains its last valid position.

## Targets

Each target is a stable semantic name for a control or visual region:

- Workspace: `workspace`, `dataset`, `cache`, `help`, `provenance`
- Space: `representations`, `projection`, `cloud`, `comparison`, `color`, `boundary`, `neighbors`, `distance`, `inspector`
- Vectors: `workbench`, `example`, `vectorSpace`, `vectorPair`, `vectorOperation`, `vectorGeometry`, `vectorTerms`, `blend`
- Queries: `queryFamily`, `queryModality`, `queries`, `competition`, `gate`, `gap`, `temperature`, `pooling`, `outputs`, `prediction`, `apply`
- Neural: `neuralLayer`, `network`, `contributions`, `neuron`, `perturb`, `graphOutput`
- Reference: `referenceQuantity`, `referencePopulation`, `ecdf`, `inputScore`
- Collections: `measurement`, `grouping`, `reducer`, `reducerEquation`, `topK`, `added`, `confidence`, `collection`, `inventory`, `profile`, `evidencePolicy`, `evidenceSlots`, `evidence`
- Ranking: `leftScore`, `rightScore`, `fusion`, `weight`, `capacity`, `holdout`, `lanes`, `rankSummary`, `sets`, `curves`, `saveRanking`
- Audit: `uncertainty`, `auditScore`, `auditBands`, `auditPrompt`, `auditMode`, `auditGrid`, `auditExpand`, `auditSubmit`, `auditQuestion`, `auditMath`, `auditCurve`, `auditCutoff`, `auditTarget`, `auditExport`
- Sampling: `populationSize`, `samplingPolicy`, `prior`, `sample`, `population`, `distribution`, `reveal`, `repeat`, `numericQuantity`, `sampleSize`, `numericPolicy`, `numericSummary`, `numericRepeat`, `numericDistribution`

## Dataset facts in narration

These tokens are substituted into prose from the loaded manifest:

`{{title}}`, `{{records}}`, `{{previews}}`, `{{holdout}}`, `{{fit}}`, `{{representations}}`, `{{firstDimensions}}`, `{{queryCount}}`, `{{queryFamilies}}`, `{{featureCount}}`, `{{primaryScore}}`, `{{modelDescription}}`, `{{groupScope}}`, `{{positiveLabel}}`.

Query counts refer to the first supplied bank. `previews` counts records with a supplied media reference; the actual audit population also requires a finite selected score. Tokens are not substituted into mathematical expressions. Keep collection-specific claims in a specialized document and verify them against its artifacts.

## Presentation controls

- Next / Back, or left/right arrows, move through the explanations. Arrows inside inputs and select controls continue to operate those controls.
- Escape or Pause tour removes the spotlight and saves the last valid step.
- The chapter name at the top of a bubble opens the chapter list.
- Native windows, such as dataset loading or expanded audit, pause the tour automatically.
- Mathematical details start open and can be collapsed. The customization section can switch to collapsed details by default.
- Nothing starts automatically on page load. Resume is offered without covering the workspace.
- Progress is separate for each dataset ID, tour ID and tour version. A completed tour can be restarted or revisited by chapter.
