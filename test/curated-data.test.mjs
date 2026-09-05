import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCuratedData, curatedLookup } from '../src/curated-data.mjs';
import { loadCatalog } from '../src/data-store.mjs';
import { compareApi } from '../src/version-tools.mjs';

const data = await loadCuratedData();
const reviewed = { clientVersion: '12.1.0.69587' };

test('curated frame and secure-hook contracts retain independent source and license evidence', () => {
  const frame = curatedLookup(data, 'CreateFrame', reviewed);
  assert.equal(frame.available, true);
  assert.equal(frame.sourceKind, 'community-curated');
  assert.equal(frame.license, 'CC-BY-SA-4.0');
  assert.deepEqual(frame.entry.overloads[0].arguments.map((a) => a.Name), ['frameType', 'name', 'parent', 'template', 'id']);
  assert.equal(frame.entry.overloads[0].arguments[2].Type, 'Frame');
  const hook = curatedLookup(data, 'hooksecurefunc', reviewed).entry;
  assert.deepEqual(hook.overloads.map((o) => o.arguments.length), [2, 3]);
  assert.deepEqual(hook.returns, []);
  assert.ok(hook.notes.some((note) => note.includes("original function's return values are preserved")));
  assert.ok(hook.restrictions.unhookableNames.includes('issecurevariable'));
  for (const entry of [...data.entries, ...data.migrations]) {
    const wiki = entry.sources.find((source) => source.revision);
    assert.ok(wiki.url.includes('oldid=' + wiki.revision));
    assert.ok(wiki.historyUrl.includes('action=history'));
  }
});

test('curated contracts do not extrapolate to unreviewed builds or enter canonical migrations', async () => {
  assert.equal(curatedLookup(data, 'CreateFrame', { clientVersion: '10.0.0.46549' }).available, false);
  assert.equal(curatedLookup(data, 'CreateFrame', { clientVersion: '12.1.0.99999' }).available, false);
  assert.equal(curatedLookup(data, 'UnknownFunction', reviewed).available, false);
  const catalog = await loadCatalog();
  assert.deepEqual((await compareApi(catalog, 'CreateFrame', '10.0.0', '12.1.0', 'function')).comparisons, []);
});

test('legacy aura guidance explains a documented replacement without manufacturing canonical history', () => {
  const result = curatedLookup(data, 'UnitAura', reviewed, { migration: true });
  assert.equal(result.available, true);
  assert.equal(result.entry.deprecatedIn, '10.2.5');
  assert.equal(result.entry.removedIn, '11.0.2');
  assert.equal(result.entry.replacement, 'C_UnitAuras.GetAuraDataByIndex');
  assert.ok(result.entry.notes.some((note) => note.includes('positional tuple')));
  assert.ok(result.entry.notes.some((note) => note.includes('secret-value')));
});
