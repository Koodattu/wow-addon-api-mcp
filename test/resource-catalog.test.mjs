import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { loadCatalog } from '../src/data-store.mjs';

test('every historical resource archive matches its API snapshot and reports exact coverage', async () => {
  const catalog = await loadCatalog();
  for (const entry of catalog.listVersions()) {
    assert.ok(entry.resourceFile, entry.version);
    const archive = await readFile(catalog.datasetPath({ file: entry.resourceFile }));
    assert.equal(archive[9], 0x0a);
    const { source, resources } = JSON.parse(gunzipSync(archive));
    assert.equal(source.commit, entry.commit);
    assert.equal(source.version, entry.clientVersion);
    assert.deepEqual(resources.counts, entry.resourceCounts);
    assert.equal(resources.coverage.status, entry.resourceCoverage);
    assert.equal(resources.coverage.issues.length === 0, entry.resourceCoverage === 'complete');
    assert.ok(resources.coverage.parsedFiles <= resources.coverage.files);
    for (const [kind, count] of Object.entries(resources.counts)) {
      assert.equal(new Set(resources.entries.filter((e) => e.kind === kind).map((e) => e.name)).size, count);
    }
  }
});

test('resource lookups stay separate from API loading and bound historical resource memory', async () => {
  const catalog = await loadCatalog();
  assert.equal(catalog.cache.size, 0);
  const oldest = await catalog.lookupResources('BackdropTemplate', { version: '10.0.0', kind: 'template', exact: true });
  assert.equal(oldest.available, true);
  assert.ok(oldest.entries.length > 0);
  assert.equal(oldest.coverage.status, 'partial');
  await catalog.lookupResources('CooldownFrameTemplate', { version: '11.0.0' });
  await catalog.lookupResources('BackdropTemplate', { version: '12.1.0' });
  assert.equal(catalog.resourceCache.size, 2);
  assert.equal(catalog.cache.size, 0);
  assert.equal(catalog.resourceCache.has('10.0.0'), false);
});
