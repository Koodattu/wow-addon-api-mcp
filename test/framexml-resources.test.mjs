import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { extractFrameXmlResources, parseResourceLua, parseResourceXml } from '../scripts/lib/framexml-resources.mjs';
import { loadCatalog, WowApiStore } from '../src/data-store.mjs';
import { formatMatches, formatResources } from '../src/formatters.mjs';
import { compareApi, apiHistory } from '../src/version-tools.mjs';

test('extracts Lua definitions and references without inventing signatures or exposing locals', () => {
  const source = '\uFEFF' + [
    'local PrivateMixin = {}',
    'function PrivateMixin:Hidden() end',
    'PublicMixin = CreateFromMixins{ParentMixin}',
    'function PublicMixin:Init(value, ...) local hidden = value; return hidden end',
    'OtherMixin = Mixin({}, ParentMixin)',
    'GlobalFunction = function(value) return value end',
    'local CreateFrame = function() end',
    'CreateFrame()',
    'CreateFont("MyFont")',
    'C_CVar.GetCVar("testCvar")',
    'local texture = {}; texture:SetAtlas("test-atlas")',
    'while true do break; end',
    'TextSizeManager = CreateFromMixins(TextSizeManagerBase)',
    'QueueUpdater = Mixin(CreateFrame("FRAME"), QueueUpdaterMixin)',
  ].join('\n');
  const entries = parseResourceLua(source, 'fixture.lua');
  assert.ok(!entries.some((entry) => entry.name.startsWith('PrivateMixin')));
  assert.ok(!entries.some((entry) => entry.name === 'CreateFrame'));
  assert.deepEqual(entries.find((entry) => entry.name === 'PublicMixin' && entry.metadata.parents)?.metadata.parents, ['ParentMixin']);
  assert.deepEqual(entries.find((entry) => entry.name === 'OtherMixin')?.metadata.parents, ['ParentMixin']);
  const method = entries.find((entry) => entry.name === 'PublicMixin:Init');
  assert.deepEqual(method.metadata.parameters, ['value', '...']);
  assert.equal(method.metadata.signatureComplete, false);
  assert.equal(method.sourceLine, 4);
  assert.equal(entries.find((entry) => entry.name === 'GlobalFunction').sourceKind, 'framexml-definition');
  const reference = entries.find((entry) => entry.name === 'CreateFont');
  assert.equal(reference.sourceKind, 'framexml-reference');
  assert.equal(reference.metadata.parameters, undefined);
  assert.ok(entries.some((entry) => entry.kind === 'cvar' && entry.name === 'testCvar'));
  assert.ok(entries.some((entry) => entry.kind === 'atlas' && entry.name === 'test-atlas'));
  assert.deepEqual(entries.find((entry) => entry.kind === 'mixin' && entry.name === 'TextSizeManager').metadata.parents, ['TextSizeManagerBase']);
  assert.equal(entries.find((entry) => entry.name === 'QueueUpdater' && entry.sourceKind === 'framexml-definition').metadata.mixinApplication, true);
});

test('keeps nested XML templates, dynamic children, and client conditions distinct', () => {
  const source = [
    '<Ui>',
    '<!-- <Frame name="NotAFrame"/> -->',
    '<Frame name="Outer" virtual="true" inherits="Base, Second" mixin="OuterMixin">',
    '<Frames><Frame name="$parentChild"><Frame name="Nested"/></Frame></Frames>',
    '</Frame>',
    '<Frame name="Concrete"/>',
    '<Frame name="ClassicOnly" allowLoadGameType="classic"/>',
    "<Frame name='RetailOnly' allowLoadGameType='mainline'/>",
    '<Script file="Code.lua"/>',
    '</Ui>',
  ].join('\n');
  const { entries, includes } = parseResourceXml(source);
  assert.deepEqual(entries.map((entry) => entry.name), ['Outer', '$parentChild', 'Nested', 'Concrete', 'RetailOnly']);
  assert.equal(entries[0].kind, 'template');
  assert.deepEqual(entries[0].metadata.inheritedTemplates, ['Base', 'Second']);
  assert.deepEqual(entries[0].metadata.mixins, ['OuterMixin']);
  assert.equal(entries[1].metadata.namePattern, true);
  assert.equal(entries[2].metadata.templateChild, true);
  assert.equal(entries[3].metadata.templateChild, false);
  assert.deepEqual(includes, ['Code.lua']);
  assert.throws(() => parseResourceXml('<Ui><Frame></Ui>'), /Unbalanced XML/);
});

test('selects mainline TOCs and resolves both source include conventions deterministically', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wow-resources-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const addon = path.join(root, 'Interface', 'AddOns', 'Example');
  await mkdir(path.join(addon, 'Mainline'), { recursive: true });
  const files = {
    'Example.toc': 'MissingDefault.lua',
    'Example_Classic.toc': 'MissingClassic.lua',
    'Example_Mainline.toc': [
      '## AllowLoadGameType: mainline',
      '[Family]/UI.xml',
      'MissingClassic.lua [AllowLoadGameType classic]',
      'MissingExcluded.lua [ExcludeLoadGameType standard]',
      '[Game].lua',
    ].join('\n'),
    'Mainline/UI.xml': '<Ui><Script file="SIBLING.lua"/><Script file="mainline/RootRelative.lua"/><Frame name="ExampleTemplate" virtual="true"/></Ui>',
    'Mainline/Sibling.lua': 'function PublicFunction() end',
    'Mainline/RootRelative.lua': 'ExampleMixin = {}',
    'Standard.lua': 'CreateFont("ExampleFont")',
  };
  for (const [name, contents] of Object.entries(files)) await writeFile(path.join(addon, name), contents);
  const tocs = Object.keys(files).filter((name) => name.endsWith('.toc')).map((name) => path.join(addon, name));
  for (const name of ['GlueBase', 'Glue']) {
    const directory = path.join(root, 'Interface', 'AddOns', name);
    await mkdir(directory);
    const toc = path.join(directory, name + '.toc');
    await writeFile(toc, '## AllowLoad: Glue');
    tocs.push(toc);
  }
  const first = await extractFrameXmlResources(root, tocs);
  assert.deepEqual(first, await extractFrameXmlResources(root, [...tocs].reverse()));
  assert.deepEqual(first.coverage.excludedAddOns, ['Interface/AddOns/Glue/Glue.toc', 'Interface/AddOns/GlueBase/GlueBase.toc']);
  assert.equal(first.coverage.files, 4);
  assert.equal(first.counts.template, 1);
  assert.ok(first.entries.some((entry) => entry.name === 'ExampleMixin'));
  assert.ok(first.entries.some((entry) => entry.sourceFile === 'Interface/AddOns/Example/Mainline/Sibling.lua'));
  assert.ok(first.entries.every((entry) => entry.addon === 'Example'));
});

test('resource lookup reports coverage and pagination without contaminating API contracts', async () => {
  const catalog = await loadCatalog();
  const store = await catalog.store();
  const template = store.resources('SecureActionButtonTemplate', { kind: 'template', exact: true });
  assert.equal(template.available, true);
  assert.deepEqual(template.entries[0].metadata.inheritedTemplates, ['SecureFrameTemplate']);
  assert.equal(store.lookup('SecureActionButtonTemplate').length, 0);
  const references = store.resources('CreateFrame', { exact: true, limit: 1 });
  assert.equal(references.entries[0].sourceKind, 'framexml-reference');
  assert.equal(references.nextOffset, 1);
  const next = store.resources('CreateFrame', { exact: true, limit: 1, offset: 1 });
  assert.notDeepEqual(next.entries, references.entries);
  assert.equal(next.total, references.total);
  assert.ok(formatResources(references, catalog.entry()).includes('/blob/' + catalog.entry().commit + '/'));
  const old = new WowApiStore({ ...store.dataset, resources: undefined });
  assert.equal(old.resources('CreateFrame').available, false);
  assert.match(formatResources(old.resources('CreateFrame'), catalog.entry('10.0.0')), /not collected/);
});

test('exact API identity wins over short names and migration tools never substitute a namespaced API', async () => {
  const catalog = await loadCatalog();
  const store = await catalog.store();
  assert.ok(store.lookup('GetTime').every(({ entry }) => entry.fullName === 'GetTime'));
  const short = store.lookup('CreateFrame');
  assert.equal(short[0].entry.fullName, 'C_PingSecure.CreateFrame');
  assert.equal(short[0].matchType, 'short-name');
  assert.match(formatMatches(short, catalog.entry()), /do not establish that a global/);
  assert.deepEqual(store.lookup('CreateFrame', 'function', { allowShortNames: false }), []);
  assert.equal((await compareApi(catalog, 'CreateFrame', '12.0.7', '12.1.0', 'function')).comparisons.length, 0);
  assert.ok((await apiHistory(catalog, 'CreateFrame', { kind: 'function' })).transitions.every((entry) => entry.matches.length === 0));
  assert.equal(store.lookup('Frame:SetScript', 'function', { allowShortNames: false })[0].entry.fullName, 'ScriptRegion:SetScript');
});
