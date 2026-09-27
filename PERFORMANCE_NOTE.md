# Reference-experiment scene performance

Resolved on 27 September 2026.

Opening the reference-label experiment through the scene API used to freeze the full 18,327-row image collection. The original profiling note measured 52.6 and 55.6 seconds. `resolveScene` called `primaryScore(m)` inside the item loop; that helper scans all items, creating quadratic work.

The scene now resolves the score key once before constructing and ranking the population. The full-manifest regression in `tests/workbench-defaults.test.ts` measured about 27–55 ms across local runs of this revision (32.7 ms in the latest recorded run). It fails if scene resolution exceeds two seconds.

This measures scene-state resolution, not model training, thumbnail loading or complete presentation rendering. Existing numerical outputs and population selection are unchanged by the optimization.
