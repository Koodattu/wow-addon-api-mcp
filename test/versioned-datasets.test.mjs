import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';

import { DatasetCatalog, loadCatalog, WowApiStore } from '../src/data-store.mjs';
import { compareVersions, updateManifest } from '../scripts/lib/dataset-manifest.mjs';
import { apiHistory, compareApi, diffVersions } from '../src/version-tools.mjs';

const fixture = JSON.parse(await readFile(new URL('fixtures/migration.json', import.meta.url), 'utf8'));

test('refreshes build aliases and extends the catalog when a new patch arrives', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wow-manifest-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifestPath = path.join(directory, 'manifest.json');
  await updateManifest(manifestPath, { version: '12.1.0', clientVersion: '12.1.0.69283', build: '69283' });
  await updateManifest(manifestPath, { version: '12.1.0', clientVersion: '12.1.0.69587', build: '69587' });
  let catalog = await loadCatalog(manifestPath);
  assert.equal(catalog.listVersions().length, 1);
  assert.equal(catalog.resolve('69587'), '12.1.0');
  assert.equal(catalog.resolve('12.1.0.69587'), '12.1.0');
  assert.throws(() => catalog.resolve('69283'), /Unsupported retail version/);
  assert.throws(() => catalog.resolve('12.1.0.69283'), /Unsupported retail version/);

  await updateManifest(manifestPath, { version: '13.0.0', clientVersion: '13.0.0.90000', build: '90000' });
  catalog = await loadCatalog(manifestPath);
  assert.deepEqual(catalog.listVersions().map((entry) => entry.version), ['12.1.0', '13.0.0']);
  assert.equal(catalog.resolve('latest'), '13.0.0');
  assert.equal(catalog.resolve('13.0'), '13.0.0');
  assert.equal(catalog.resolve('90000'), '13.0.0');
  assert.equal(catalog.resolve('69587'), '12.1.0');
});

test('bundles a complete, internally consistent retail version catalog', async () => {
  const catalog = await loadCatalog();
  const versions = catalog.listVersions();
  for (const version of fixture.retainedPatches) {
    assert.ok(versions.some((entry) => entry.version === version), `Missing retained patch ${version}`);
  }
  assert.deepEqual(versions.map((entry) => entry.version), versions.map((entry) => entry.version).sort(compareVersions));
  assert.equal(versions[0].version, '10.0.0');
  assert.equal(versions.at(-1).version, catalog.manifest.default);
  assert.equal(versions.at(-1).default, true);

  await Promise.all(versions.map(async (entry) => {
    const archive = await readFile(catalog.datasetPath(entry));
    assert.equal(archive[9], 0x0a, `${entry.file} has a platform-specific gzip header`);
    const dataset = JSON.parse(gunzipSync(archive));
    assert.equal(dataset.source.patch, entry.version);
    assert.equal(dataset.source.version, entry.clientVersion);
    assert.equal(dataset.source.build, entry.build);
    assert.equal(dataset.source.commit, entry.commit);
    assert.deepEqual(dataset.stats, entry.stats);
    assert.equal(dataset.resources, undefined);
  }));
});

test('resolves patch and build aliases and lazily bounds loaded datasets', async () => {
  const catalog = await loadCatalog(undefined, { cacheSize: 2 });
  const current = catalog.entry();
  assert.equal(catalog.resolve('latest'), current.version);
  assert.equal(catalog.resolve('12.1'), '12.1.0');
  assert.equal(catalog.resolve(current.clientVersion), current.version);
  assert.equal(catalog.resolve(current.build), current.version);
  assert.throws(() => catalog.resolve('9.2.7'), /Unsupported retail version/);

  await catalog.store('10.0.0');
  await catalog.store('11.0.0');
  await catalog.store('latest');
  assert.deepEqual([...catalog.cache.keys()], ['11.0.0', current.version]);
});

test('compares pinned API fixtures and histories without blending version snapshots', async () => {
  const versions = fixture.datasets.map(({ source }) => ({
    version: source.patch, clientVersion: source.version, build: source.build, commit: source.commit,
  }));
  const catalog = new DatasetCatalog({ schemaVersion: 1, channel: 'retail', default: '12.1.0', versions });
  for (const dataset of fixture.datasets) catalog.cache.set(dataset.source.patch, new WowApiStore(dataset));
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
    ['12.0.7', 'absent'],
    ['12.1.0', 'introduced'],
  ]);
});
