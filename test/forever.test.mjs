import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { DatasetCatalog, loadCatalog } from '../src/data-store.mjs';
import { loadCuratedData, curatedLookup } from '../src/curated-data.mjs';
import { apiHistory } from '../src/version-tools.mjs';
import { updateManifest } from '../scripts/lib/dataset-manifest.mjs';
import { validateDataset } from '../scripts/build-dataset.mjs';
import { extractFrameXmlResources } from '../scripts/lib/framexml-resources.mjs';

test('Forever catalogs isolate defaults, history, provenance and curated contracts from retail', async (t) => {
  const retail = await loadCatalog();
  const forever = await loadCatalog(undefined, { channel: 'forever' });
  assert.equal(retail.info().channel, 'retail');
  assert.equal(forever.info().channel, 'forever');
  assert.ok(forever.listVersions().every((entry) => entry.channel === 'forever' && entry.version.startsWith('1.60.')));
  assert.throws(() => retail.resolve(forever.entry().clientVersion), /Unsupported retail version/);
  assert.throws(() => forever.resolve(retail.entry().clientVersion), /Unsupported forever version/);
  assert.equal(forever.resolve(forever.entry().build), forever.entry().version);
  const history = await apiHistory(forever, 'C_UnitAuras.GetAuraDataByIndex');
  assert.ok(history.transitions.every((entry) => entry.version.channel === 'forever'));
  const curated = await loadCuratedData();
  assert.equal(curatedLookup(curated, 'CreateFrame', forever.entry()).available, false);
  assert.equal(curatedLookup(curated, 'CreateFrame', { channel: 'forever', clientVersion: curated.reviewedClientVersion }).available, false);
  const wrong = { ...forever.manifest, channel: 'retail' };
  assert.throws(() => new DatasetCatalog(wrong), /mixes client channels/);
  await assert.rejects(loadCatalog(undefined, { channel: 'unknown' }), /Unsupported channel/);

  const directory = await mkdtemp(path.join(os.tmpdir(), 'wow-channel-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'manifest.json');
  await updateManifest(file, retail.entry());
  const before = await readFile(file, 'utf8');
  await assert.rejects(updateManifest(file, forever.entry()), /does not belong to retail/);
  await assert.rejects(updateManifest(file, forever.entry(), 'forever'), /Cannot write forever/);
  assert.equal(await readFile(file, 'utf8'), before);
  const foreverFile = path.join(directory, 'forever.json');
  await updateManifest(foreverFile, { version: '1.60.1', clientVersion: '1.60.1.69893', build: '69893' }, 'forever');
  await updateManifest(foreverFile, { version: '1.60.1', clientVersion: '1.60.1.69913', build: '69913' }, 'forever');
  await updateManifest(foreverFile, { version: '1.60.2', clientVersion: '1.60.2.70000', build: '70000' }, 'forever');
  const refreshed = await loadCatalog(foreverFile, { channel: 'forever' });
  assert.deepEqual(refreshed.listVersions().map((e) => e.version), ['1.60.1', '1.60.2']);
  assert.equal(refreshed.resolve(), '1.60.2');
  assert.equal(refreshed.resolve('69913'), '1.60.1');
  assert.throws(() => refreshed.resolve('69893'), /Unsupported forever version/);
});

test('Forever rejects archives from another channel even when the manifest claims they belong', async () => {
  const retail = await loadCatalog();
  const forever = await loadCatalog(undefined, { channel: 'forever' });
  const entry = { ...forever.entry(), file: retail.datasetPath(retail.entry()).href,
    resourceFile: retail.datasetPath({ file: retail.entry().resourceFile }).href };
  const mixed = new DatasetCatalog({ ...forever.manifest, versions: [entry] }, forever.manifestPath);
  await assert.rejects(mixed.store(), /API snapshot does not match/);
  await assert.rejects(mixed.lookupResources('BackdropTemplate'), /Resource snapshot does not match/);
});

test('Forever extraction requires secret metadata despite its 1.x version and keeps Camelot resources', async () => {
  const catalog = await loadCatalog(undefined, { channel: 'forever' });
  for (const entry of catalog.listVersions()) {
    const { dataset } = await catalog.store(entry.version);
    validateDataset(dataset);
    assert.equal(dataset.source.channel, 'forever');
    assert.equal(dataset.source.branch, 'forever');
    assert.deepEqual(dataset.stats, entry.stats);
    const withoutRestrictions = { ...dataset, functions: dataset.functions.map((f) => ({ ...f, metadata: {} })) };
    assert.throws(() => validateDataset(withoutRestrictions), /No function security metadata/);
    const result = await catalog.lookupResources('ColoredProgressBarMixin', { version: entry.version, kind: 'mixin', exact: true });
    assert.equal(result.scope, 'forever-source');
    assert.ok(result.entries.some((r) => r.sourceFile.includes('/Camelot/')));
    assert.equal(result.coverage.status, entry.resourceCoverage);
    // New coverage gaps require review; the initial beta has one known ambiguity.
    for (const issue of result.coverage.issues) {
      assert.equal(issue.sourceFile, 'Interface/AddOns/Blizzard_FrameXML/Camelot/EquipmentFlyout.xml');
      assert.equal(issue.message, 'Ambiguous source include: Interface/AddOns/Blizzard_FrameXML/Camelot/EquipmentFlyout.xml -> EquipmentFlyout.lua');
    }
    const friends = await catalog.lookupResources('FriendsFrame_OnLoad', { version: entry.version, exact: true });
    assert.ok(friends.entries.some((r) => r.sourceFile.includes('/Camelot/FriendsFrame.lua')));
    assert.ok(!friends.entries.some((r) => r.sourceFile.includes('/Mainline/FriendsFrame.lua')));
  }
});

test('Forever honors Mainline family, Camelot game, and TOC/XML exclusions', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wow-camelot-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const addon = path.join(root, 'Interface', 'AddOns', 'Example');
  await mkdir(path.join(addon, 'Mainline'), { recursive: true });
  await mkdir(path.join(addon, 'Camelot'));
  const files = {
    'Example.toc': 'MissingDefault.lua',
    'Example_Mainline.toc': '## AllowLoadGameType: mainline\n[Family]/Shared.lua\n[Game]/UI.xml [AllowLoadGameType camelot]\nMissingStandard.lua [ExcludeLoadGameType camelot]\nMissingClassic.lua [AllowLoadGameType classic]',
    'Mainline/Shared.lua': 'function SharedFunction() end',
    'Camelot/UI.xml': '<Ui><Frame name="ForeverFrame" allowLoadGameType="camelot"/><Frame name="SharedFrame" allowLoadGameType="mainline"/><Frame name="WrongFrame" excludeLoadGameType="camelot"/><Script file="Missing.lua" allowLoadGameType="standard"/></Ui>',
  };
  for (const [file, content] of Object.entries(files)) await writeFile(path.join(addon, file), content);
  const excluded = path.join(root, 'Interface', 'AddOns', 'Excluded');
  await mkdir(excluded);
  const excludedToc = path.join(excluded, 'Excluded.toc');
  await writeFile(excludedToc, '## ExcludeLoadGameType: camelot\nMissing.lua');
  const result = await extractFrameXmlResources(root, [path.join(addon, 'Example.toc'), path.join(addon, 'Example_Mainline.toc'), excludedToc], { channel: 'forever' });
  assert.equal(result.coverage.status, 'complete');
  assert.deepEqual(result.coverage.excludedAddOns, ['Interface/AddOns/Excluded/Excluded.toc']);
  assert.ok(result.entries.some((e) => e.name === 'SharedFunction'));
  assert.deepEqual(result.entries.filter((e) => e.kind === 'frame').map((e) => e.name), ['ForeverFrame', 'SharedFrame']);
});

test('Forever MCP stdio labels queries, exposes restrictions and rejects retail versions', { timeout: 20_000 }, async () => {
  const catalog = await loadCatalog(undefined, { channel: 'forever' });
  const client = new Client({ name: 'forever-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['src/cli.mjs', '--channel', 'forever'], cwd: process.cwd(), stderr: 'pipe' });
  try {
    await client.connect(transport);
    const call = async (name, args = {}) => {
      const result = await client.callTool({ name, arguments: args });
      assert.ok(!result.isError, result.content[0]?.text);
      return result.content[0].text;
    };
    assert.equal(JSON.parse(await call('get_dataset_info')).channel, 'forever');
    assert.match(await call('list_versions'), /Supported forever versions/);
    const api = await call('lookup_api', { name: 'C_UnitAuras.GetAuraDataByIndex' });
    assert.match(api, /Dataset: Forever beta/);
    assert.match(api, /SecretArguments/);
    assert.ok(api.includes(catalog.entry().commit));
    assert.match(await call('search_restrictions', { query: 'GetAuraDataByIndex' }), /RequiresUnitAuraAccess/);
    assert.match(await call('lookup_resource', { query: 'ColoredProgressBarMixin', kind: 'mixin' }), /Camelot/);
    assert.match(await call('get_api_history', { name: 'C_UnitAuras.GetAuraDataByIndex' }), /Forever beta/);
    assert.match(await call('diff_versions', { from_version: catalog.entry().version }), /Forever beta/);
    const curated = await call('lookup_engine_api', { name: 'CreateFrame' });
    assert.equal(JSON.parse(curated.split('\n\n')[1]).available, false);
    const wrong = await client.callTool({ name: 'lookup_api', arguments: { name: 'GetTime', version: '12.1.0' } });
    assert.equal(wrong.isError, true);
  } finally { await client.close(); }
});
