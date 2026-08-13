import assert from 'node:assert/strict';
import test from 'node:test';

import { parseLuaDocumentationSource, parseLuaMixinsSource } from '../scripts/lib/lua-doc-parser.mjs';

test('parses generated documentation tables without executing Lua', () => {
  const result = parseLuaDocumentationSource(`
    local Example = {
      Name = "Example",
      Type = "System",
      Functions = {
        { Name = "GetValue", Type = "Function", Documentation = { "Unicode: café" }, SecretArguments = "NotAllowed" },
      },
      Events = {},
      Tables = {},
    }
    APIDocumentation:AddDocumentationTable(Example)
  `);

  assert.equal(result.Name, 'Example');
  assert.equal(result.Functions[0].Documentation[0], 'Unicode: café');
  assert.equal(result.Functions[0].SecretArguments, 'NotAllowed');
});

test('uses the local name for constants-only documentation tables', () => {
  const result = parseLuaDocumentationSource('local ExampleConstants = { Tables = {} }');
  assert.equal(result.Name, 'ExampleConstants');
  assert.equal(result.Type, 'Constants');
});

test('accepts C-style casts emitted in historical constants tables', () => {
  const result = parseLuaDocumentationSource(`
    local PetConstants = {
      Tables = {
        { Name = "PetConsts", Type = "Constants", Values = {
          { Name = "SLOT", Type = "number", Value = (int)MAX_PETS },
        } },
      },
    }
  `);
  assert.equal(result.Tables[0].Values[0].Value, 'MAX_PETS');
});

test('extracts public mixin methods and inheritance', () => {
  const result = parseLuaMixinsSource(`
    ChildMixin = CreateFromMixins(ParentMixin)
    function ChildMixin:SetUnit(unit, filter) end
  `);

  assert.deepEqual(result.inheritance, [{ target: 'ChildMixin', parents: ['ParentMixin'] }]);
  assert.deepEqual(result.methods[0], {
    owner: 'ChildMixin',
    name: 'SetUnit',
    arguments: [
      { Name: 'unit', Type: 'unknown', Nilable: false },
      { Name: 'filter', Type: 'unknown', Nilable: false },
    ],
  });
});
