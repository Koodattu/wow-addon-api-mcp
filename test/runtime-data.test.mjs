import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { lua, lauxlib, lualib, to_luastring, to_jsstring } from 'fengari';
import { loadRuntimeData, runtimeLookup, runtimeSchema } from '../src/runtime-data.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const source = await readFile(new URL('../tools/WowApiSnapshot/Collector.lua', import.meta.url), 'utf8');
function collect(request) {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  const script = String.raw`
    WOW_PROJECT_ID, WOW_PROJECT_MAINLINE = 1, 1
    function GetBuildInfo() return "12.1.0", "69587", "Aug 27 2026", 120100 end
    function GetLocale() return "enUS" end
    function date() return "2026-09-05T15:00:00Z" end
    C_CVar = { GetCVarInfo = function(name)
      if name == "failed" then error("not available") end
      if name == "missing" then return nil end
      return "PRIVATE_CURRENT_SETTING", "1", true, false, true, false, false
    end }
    C_Texture = { GetAtlasInfo = function(name)
      if name == "missing" then return nil end
      return { width=32, height=16, leftTexCoord=0, rightTexCoord=0.5,
        topTexCoord=0.25, bottomTexCoord=1, tilesHorizontally=false, tilesVertically=true }
    end }
    EXAMPLE_LOCALIZED = "Count %d\n\"quoted\"\\path ä你好"
    local addon = {}
    local function module(...)
    ${source}
    end
    module("WowApiSnapshot", addon)
    return addon.export(${request})
  `;
  try {
    const status = lauxlib.luaL_dostring(state, to_luastring(script));
    assert.equal(status, lua.LUA_OK, to_jsstring(lua.lua_tostring(state, -1)));
    return to_jsstring(lua.lua_tostring(state, -1));
  } finally { lua.lua_close(state); }
}

test('Lua collector exports only requested metadata, preserves text, and omits current settings', () => {
  const json = collect('{cvars={"example","missing","failed"}, atlases={"example","missing"}, symbols={"C_CVar.GetCVarInfo","noSuchName"}, globalStrings={"EXAMPLE_LOCALIZED"}}');
  assert.ok(!json.includes('PRIVATE_CURRENT_SETTING'));
  const snapshot = runtimeSchema.parse(JSON.parse(json));
  assert.equal(snapshot.records.globalStrings[0].value, 'Count %d\n"quoted"\\path ä你好');
  assert.equal(snapshot.records.cvars.length, 1);
  assert.deepEqual(snapshot.failed.cvars, ['failed']);
  assert.deepEqual(snapshot.missing.cvars, ['missing']);
  assert.deepEqual(snapshot.missing.atlases, ['missing']);
  assert.deepEqual(snapshot.missing.symbols, ['noSuchName']);
  assert.equal(snapshot.records.atlases[0].width, 32);
  assert.equal(snapshot.records.symbols[0].type, 'function');
  assert.equal(runtimeLookup(snapshot, 'example', 'cvar', { clientVersion: '12.1.0.69587' }).entry.defaultValue, '1');
  assert.equal(runtimeLookup(snapshot, 'missing', 'cvar', { clientVersion: '12.1.0.69587' }).requested, true);
  assert.equal(runtimeLookup(snapshot, 'unrequested', 'cvar', { clientVersion: '12.1.0.69587' }).requested, false);
  assert.equal(runtimeLookup(snapshot, 'example', 'cvar', { clientVersion: '12.1.0.99999' }).available, false);
  assert.equal(runtimeLookup(snapshot, 'EXAMPLE_LOCALIZED', 'globalstring', { clientVersion: '12.1.0.69587' }, 'deDE').available, false);
});

test('empty collector arrays remain arrays and invalid requests fail', () => {
  const snapshot = runtimeSchema.parse(JSON.parse(collect('{cvars={}, atlases={}, symbols={}, globalStrings={}}')));
  assert.deepEqual(snapshot.records.atlases, []);
  assert.throws(() => collect('{cvars={"duplicate","duplicate"}, atlases={}, symbols={}, globalStrings={}}'), /duplicate/);
  assert.throws(() => collect('{cvars={}, atlases={}, symbols={}, globalStrings={"playerName"}}'), /uppercase/);
});

test('runtime JSON rejects current values, unrequested entries, duplicates and executable input', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wow-runtime-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'snapshot.json');
  const original = JSON.parse(collect('{cvars={"example"}, atlases={}, symbols={}, globalStrings={}}'));
  await writeFile(file, JSON.stringify(original));
  assert.equal((await loadRuntimeData(file)).source.locale, 'enUS');
  for (const mutate of [
    (s) => { s.records.cvars[0].value = 'user setting'; },
    (s) => { s.records.cvars[0].name = 'unrequested'; },
    (s) => { s.records.cvars.push(s.records.cvars[0]); },
    (s) => { s.failed.cvars.push('example'); },
    (s) => { s.records.cvars = []; },
  ]) {
    const invalid = structuredClone(original);
    mutate(invalid);
    await writeFile(file, JSON.stringify(invalid));
    await assert.rejects(loadRuntimeData(file), /documented schema/);
  }
  await writeFile(file, 'return { doNotExecute = true }');
  await assert.rejects(loadRuntimeData(file), /data-only JSON/);
});

test('CLI serves a collector snapshot over MCP with build and locale gates', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wow-runtime-stdio-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'snapshot.json');
  const manifest = JSON.parse(await readFile(new URL('../data/manifest.json', import.meta.url), 'utf8'));
  const current = manifest.versions.find((entry) => entry.version === manifest.default);
  const snapshot = JSON.parse(collect('{cvars={"example","missing","failed"}, atlases={}, symbols={}, globalStrings={"EXAMPLE_LOCALIZED"}}'));
  snapshot.source.clientVersion = current.clientVersion;
  await writeFile(file, JSON.stringify(snapshot));
  const client = new Client({ name: 'runtime-integration', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: ['src/cli.mjs', '--runtime-data', file], cwd: process.cwd(), stderr: 'pipe' });
  try {
    await client.connect(transport);
    const query = async (args) => {
      const result = await client.callTool({ name: 'lookup_runtime_resource', arguments: args });
      assert.ok(!result.isError);
      return JSON.parse(result.content[0].text.split('\n\n')[1]);
    };
    assert.equal((await query({ name: 'example', kind: 'cvar', version: current.version })).entry.defaultValue, '1');
    assert.equal((await query({ name: 'missing', kind: 'cvar', version: current.version })).missing, true);
    assert.equal((await query({ name: 'failed', kind: 'cvar', version: current.version })).failed, true);
    assert.equal((await query({ name: 'example', kind: 'cvar', version: '10.0.0' })).available, false);
    assert.equal((await query({ name: 'EXAMPLE_LOCALIZED', kind: 'globalstring', version: current.version, locale: 'deDE' })).available, false);
  } finally { await client.close(); }
});
