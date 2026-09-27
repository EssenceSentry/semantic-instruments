import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonical, digest, operationKey } from '../src/core/cache';
import { neighbors, mean } from '../src/core/math';
import { numericExperiment, referenceExperiment } from '../src/core/experiments';
test('Computation identities include exact parameters, contents, shape, and versioned operation', async () => {
  const x = new Float32Array([1, 2, 3, 4]),
    y = new Float32Array([1, 2, 3, 4.001]);
  const d1 = '2:2:' + (await digest(x)),
    d2 = '2:2:' + (await digest(y));
  const a = await operationKey('project', { mean: [0, 0], components: [[1, 0]] }, [d1]);
  assert.equal(a, await operationKey('project', { components: [[1, 0]], mean: [0, 0] }, [d1]));
  assert.notEqual(a, await operationKey('project', { mean: [0, 0], components: [[0, 1]] }, [d1]));
  assert.notEqual(a, await operationKey('project', { mean: [0, 0], components: [[1, 0]] }, [d2]));
  assert.notEqual(
    a,
    await operationKey('project', { mean: [0, 0], components: [[1, 0]] }, [
      '1:4:' + (await digest(x)),
    ]),
  );
  assert.notEqual(
    await operationKey('audit', { seed: 1 }, []),
    await operationKey('audit', { seed: 2 }, []),
  );
  assert.equal(canonical({ b: undefined, a: 1 }), canonical({ a: 1 }));
});
test('Restricted neighbors equal filtering the full exact ordering', () => {
  const m = {
    rows: 6,
    cols: 2,
    data: new Float32Array([1, 0, 0.9, 0.1, 0.1, 0.9, -1, 0, 0, -1, 0.5, 0.5]),
  };
  for (const metric of ['cosine', 'euclidean'] as const) {
    const expected = neighbors(m, 0, 6, metric).filter((x) => [0, 2, 4, 5].includes(x.index));
    assert.deepEqual(neighbors(m, 0, 8, metric, [0, 2, 4, 5]), expected);
  }
});
test('Worker sampling preserves reproducibility, census collapse, and biased selection', () => {
  const values = [-4, -1, 2, 3, 9];
  assert.deepEqual(
    numericExperiment(values, 3, 17, 'uniform'),
    numericExperiment(values, 3, 17, 'uniform'),
  );
  assert.ok(
    numericExperiment(values, values.length, 1, 'uniform').every(
      (x) => Math.abs(x - mean(values)) < 1e-12,
    ),
  );
  assert.ok(numericExperiment(values, 2, 1, 'largest').every((x) => x === 6));
  const posterior = referenceExperiment(
    [
      [0, 1],
      [2, 3],
    ],
    { 0: 1, 1: 0, 2: 1, 3: 1 },
    [0, 1, 2, 3],
    1,
    1,
    1,
  );
  assert.ok(posterior.every((x) => x === 0.75));
});
