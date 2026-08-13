import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';

import { loadCatalog } from '../src/data-store.mjs';
import { apiHistory, compareApi, diffVersions } from '../src/version-tools.mjs';

test('bundles a complete, internally consistent retail version catalog', async () => {
  const catalog = await loadCatalog();
  const versions = catalog.listVersions();
  assert.equal(versions.length, 26);
  assert.equal(versions[0].version, '10.0.0');
  assert.equal(versions.at(-1).version, '12.1.0');
  assert.equal(versions.at(-1).default, true);

  await Promise.all(versions.map(async (entry) => {
    const dataset = JSON.parse(gunzipSync(await readFile(catalog.datasetPath(entry))));
    assert.equal(dataset.source.patch, entry.version);
    assert.equal(dataset.source.version, entry.clientVersion);
    assert.equal(dataset.source.build, entry.build);
    assert.equal(dataset.source.commit, entry.commit);
    assert.deepEqual(dataset.stats, entry.stats);
  }));
});

test('resolves patch and build aliases and lazily bounds loaded datasets', async () => {
  const catalog = await loadCatalog(undefined, { cacheSize: 2 });
  assert.equal(catalog.resolve('latest'), '12.1.0');
  assert.equal(catalog.resolve('12.1'), '12.1.0');
  assert.equal(catalog.resolve('12.1.0.69283'), '12.1.0');
  assert.equal(catalog.resolve('69283'), '12.1.0');
  assert.throws(() => catalog.resolve('9.2.7'), /Unsupported retail version/);

  await catalog.store('10.0.0');
  await catalog.store('11.0.0');
  await catalog.store('latest');
  assert.deepEqual([...catalog.cache.keys()], ['11.0.0', '12.1.0']);
});

test('compares APIs and histories without blending version snapshots', async () => {
  const catalog = await loadCatalog();
  const comparison = await compareApi(catalog, 'AuraContainer', '12.0.7', '12.1.0', 'widget');
  assert.equal(comparison.comparisons.length, 1);
  assert.equal(comparison.comparisons[0].status, 'added');
  assert.equal(comparison.comparisons[0].before, undefined);
  assert.equal(comparison.comparisons[0].after.name, 'AuraContainer');

  const diff = await diffVersions(catalog, '12.0.7', '12.1.0', { namespace: 'C_UnitAuras', limit: 100 });
  assert.deepEqual(diff.counts, { added: 9, removed: 3, changed: 18 });
  assert.ok(diff.changes.some((entry) => entry.identity === 'C_UnitAuras.AddAuraSound' && entry.status === 'added'));
  assert.ok(diff.changes.some((entry) => entry.identity === 'C_UnitAuras.AddPrivateAuraAppliedSound' && entry.status === 'removed'));

  const history = await apiHistory(catalog, 'AuraContainer', { kind: 'widget' });
  assert.deepEqual(history.transitions.map((entry) => [entry.version.version, entry.status]), [
    ['10.0.0', 'absent'],
    ['12.1.0', 'introduced'],
  ]);
});
