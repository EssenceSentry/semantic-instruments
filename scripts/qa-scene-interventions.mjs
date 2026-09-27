import assert from 'node:assert/strict';
import { createCaptureClient } from './capture-client.mjs';
const client = await createCaptureClient({ url: process.env.LAB_URL ?? 'http://127.0.0.1:8775/' });
const { call } = client;
try {
  const bank = (await call('describe')).dataset.queryBanks[0].id;
  const base = {
    schemaVersion: 1,
    dataset: 'weapons-paired',
    scene: 'queries.pooling',
    seed: 42,
  };
  await call('setScene', base);
  const original = (await call('items', { mediaOnly: true, limit: 20 })).items;
  const intervention = { bankId: bank, disabled: [], zeroFamilies: [], temperature: 0.4 };
  await call('update', { intervention });
  const changed = (await call('items', { mediaOnly: true, limit: 20 })).items;
  assert.ok(changed.some((v, i) => v.scores.model !== original[i].scores.model));
  const snapshot = await call('snapshot');
  await call('setScene', base);
  await call('setScene', snapshot);
  assert.deepEqual((await call('items', { mediaOnly: true, limit: 20 })).items, changed);
  console.log('PASS dataset-wide intervention and snapshot replay');
  await call('setScene', { ...base, scene: 'audit', intervention });
  await call('audit.submit', { positives: 3 });
  const audited = await call('snapshot'),
    posterior = (await call('audit.state')).posterior;
  await call('setScene', base);
  await call('setScene', audited);
  assert.deepEqual((await call('audit.state')).posterior, posterior);
  console.log('PASS audit after a model intervention and snapshot replay');
  const beforeInvalid = await call('snapshot');
  const invalid = structuredClone(beforeInvalid);
  invalid.intervention.temperature = 0.45;
  invalid.auditBatches[0].ids[0] = 'not-a-dataset-item';
  await assert.rejects(call('setScene', invalid));
  assert.deepEqual((await call('getState')).controls, beforeInvalid.controls);
  assert.equal((await call('getState')).intervention.temperature, 0.4);
  assert.deepEqual((await call('audit.state')).posterior, posterior);
  console.log('PASS invalid replay rolls back model and audit state');
} finally {
  await client.close();
}
