import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { loadCatalog } from '../src/data-store.mjs';
import { compareApi, diffVersions } from '../src/version-tools.mjs';

const retail = await loadCatalog();
const forever = await loadCatalog(undefined, { channel: 'forever' });

test('default MCP exposes both channels with required per-call targets and no implicit selection', { timeout: 20_000 }, async () => {
  const client = new Client({ name: 'multi-channel-test', version: '1' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ['src/cli.mjs'], cwd: process.cwd(), stderr: 'pipe' }));
    const call = async (name, args = {}) => {
      const result = await client.callTool({ name, arguments: args });
      assert.ok(!result.isError, result.content[0]?.text);
      return result.content[0].text;
    };
    const { tools } = await client.listTools();
    const singleBuild = tools.filter((tool) => !['list_versions', 'get_api_history', 'compare_api', 'diff_versions'].includes(tool.name));
    assert.equal(singleBuild.length, 13);
    for (const tool of singleBuild) {
      assert.ok(tool.inputSchema.required.includes('channel'), tool.name);
      assert.ok(tool.inputSchema.required.includes('version'), tool.name);
      assert.deepEqual(tool.inputSchema.properties.channel.enum, ['retail', 'forever']);
    }
    for (const name of ['compare_api', 'diff_versions']) {
      const schema = tools.find((t) => t.name === name).inputSchema;
      for (const key of ['from_channel', 'from_version', 'to_channel', 'to_version']) assert.ok(schema.required.includes(key), name + ':' + key);
    }
    assert.ok(tools.find((t) => t.name === 'get_api_history').inputSchema.required.includes('channel'));
    const versions = await call('list_versions');
    for (const catalog of [retail, forever]) {
      assert.ok(versions.includes(catalog.entry().clientVersion));
      assert.ok(versions.includes(catalog.entry().commit));
    }
    const filtered = await call('list_versions', { channel: 'forever' });
    assert.ok(filtered.includes(forever.entry().clientVersion));
    assert.ok(!filtered.includes(retail.entry().clientVersion));

    const queries = [
      ['get_dataset_info', {}],
      ['lookup_api', { name: 'C_UnitAuras.GetAuraDataByIndex' }],
      ['search_api', { query: 'GetAuraDataByIndex' }],
      ['get_namespace', { namespace: 'C_UnitAuras' }],
      ['get_widget_methods', { name: 'Frame' }],
      ['get_enum', { name: 'PowerType' }],
      ['get_event', { name: 'PLAYER_LOGIN' }],
      ['search_restrictions', { query: 'GetAuraDataByIndex' }],
      ['lookup_resource', { query: 'BackdropTemplate', kind: 'template' }],
      ['search_resources', { query: 'BackdropTemplate', kind: 'template', limit: 1 }],
      ['lookup_engine_api', { name: 'CreateFrame' }],
      ['get_migration_guidance', { name: 'UnitAura' }],
      ['lookup_runtime_resource', { name: 'missing', kind: 'cvar' }],
    ];
    // Concurrent calls exercise both catalogs without a shared active-game setting.
    await Promise.all([retail, forever].flatMap((catalog) => queries.map(async ([name, args]) => {
      const entry = catalog.entry();
      const result = await call(name, { ...args, channel: entry.channel, version: entry.clientVersion });
      assert.ok(result.includes(entry.clientVersion), name);
      assert.ok(result.includes(entry.commit), name);
    })));
    const info = JSON.parse(await call('get_dataset_info', { channel: 'forever', version: 'latest' }));
    assert.equal(info.selected.clientVersion, forever.entry().clientVersion);
    const missing = await call('lookup_api', { name: 'NotAnApiAtAll', channel: 'forever', version: 'latest' });
    assert.match(missing, /No matching/);
    assert.ok(missing.includes(forever.entry().commit));
    const history = await call('get_api_history', { name: 'C_UnitAuras.GetAuraDataByIndex', channel: 'forever' });
    assert.match(history, /Forever beta/);
    assert.ok(!history.includes(retail.entry().clientVersion));

    for (const args of [
      { name: 'GetTime' },
      { name: 'GetTime', version: 'latest' },
      { name: 'GetTime', channel: 'forever' },
      { name: 'GetTime', channel: 'forever', version: ' ' },
      { name: 'GetTime', channel: 'classic', version: 'latest' },
      { name: 'GetTime', channel: 'retail', version: forever.entry().clientVersion },
      { name: 'GetTime', channel: 'forever', version: retail.entry().clientVersion },
      { name: 'GetTime', channel: 'forever', version: '1.60.1.1' },
    ]) assert.equal((await client.callTool({ name: 'lookup_api', arguments: args })).isError, true, JSON.stringify(args));
    assert.equal((await client.callTool({ name: 'get_api_history', arguments: { name: 'GetTime', channel: 'forever', from_version: retail.entry().version } })).isError, true);

    const target = { from_channel: 'retail', from_version: retail.entry().clientVersion, to_channel: 'forever', to_version: forever.entry().clientVersion };
    for (const [name, args] of [['compare_api', { name: 'C_GamepadTargeting.Enable' }], ['diff_versions', { namespace: 'C_GamepadTargeting' }]]) {
      const result = await call(name, { ...args, ...target });
      assert.match(result, /Cross-channel comparison/);
      assert.ok(result.includes(retail.entry().clientVersion));
      assert.ok(result.includes(forever.entry().clientVersion));
      assert.match(result, /added/);
      const { to_channel, ...incomplete } = target;
      assert.equal((await client.callTool({ name, arguments: { ...args, ...incomplete } })).isError, true);
    }
  } finally { await client.close(); }
});

test('cross-channel comparisons preserve direction, exact identities, and target restrictions', async () => {
  const forward = await compareApi(retail, 'C_GamepadTargeting.Enable', 'latest', 'latest', 'function', forever);
  assert.equal(forward.comparisons[0].status, 'added');
  const reverse = await compareApi(forever, 'C_GamepadTargeting.Enable', 'latest', 'latest', 'function', retail);
  assert.equal(reverse.comparisons[0].status, 'removed');
  const restricted = await compareApi(retail, 'C_UnitAuras.GetAuraDataByIndex', 'latest', 'latest', 'function', forever);
  assert.equal(restricted.comparisons[0].before.metadata.RequiresUnitAuraAccess, true);
  assert.equal(restricted.comparisons[0].after.metadata.RequiresUnitAuraAccess, true);
  const diff = await diffVersions(retail, 'latest', 'latest', { toCatalog: forever, namespace: 'C_GamepadTargeting' });
  assert.ok(diff.counts.added > 0);
  assert.equal(diff.from.channel, 'retail');
  assert.equal(diff.to.channel, 'forever');
  await assert.rejects(compareApi(retail, 'GetTime', forever.entry().version, 'latest', 'function', forever), /Unsupported retail version/);
});

for (const channel of ['retail', 'forever']) test(`${channel} compatibility mode rejects explicit requests for the other channel`, async () => {
  const client = new Client({ name: 'restricted-test', version: '1' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ['src/cli.mjs', '--channel', channel], cwd: process.cwd(), stderr: 'pipe' }));
    const other = channel === 'retail' ? 'forever' : 'retail';
    const { tools } = await client.listTools();
    const lookup = tools.find((t) => t.name === 'lookup_api');
    assert.ok(!lookup.inputSchema.required.includes('channel'));
    assert.ok(!lookup.inputSchema.required.includes('version'));
    const ordinary = await client.callTool({ name: 'lookup_api', arguments: { name: 'GetTime' } });
    assert.ok(!ordinary.isError);
    const rejected = await client.callTool({ name: 'lookup_api', arguments: { name: 'GetTime', channel: other, version: 'latest' } });
    assert.equal(rejected.isError, true);
    assert.equal((await client.callTool({ name: 'list_versions', arguments: { channel: other } })).isError, true);
    assert.equal((await client.callTool({ name: 'compare_api', arguments: { name: 'GetTime', from_version: 'latest', to_channel: other } })).isError, true);
  } finally { await client.close(); }
});

test('CLI discovery lists both channels by default and retains single-channel output', () => {
  const info = JSON.parse(execFileSync(process.execPath, ['src/cli.mjs', '--dataset-info'], { encoding: 'utf8' }));
  assert.deepEqual(info.channels.map((c) => c.channel), ['retail', 'forever']);
  const versions = execFileSync(process.execPath, ['src/cli.mjs', '--list-versions'], { encoding: 'utf8' });
  assert.match(versions, /retail\t12\.1\.0/);
  assert.match(versions, /forever\t1\.60\.1/);
  const restricted = JSON.parse(execFileSync(process.execPath, ['src/cli.mjs', '--channel', 'forever', '--dataset-info'], { encoding: 'utf8' }));
  assert.equal(restricted.channel, 'forever');
});
