import assert from 'node:assert/strict';
import test from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('serves the bundled docs over MCP stdio', { timeout: 20_000 }, async () => {
  const client = new Client({ name: 'wow-addon-api-test', version: '1.0.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['src/cli.mjs'],
    cwd: process.cwd(),
    stderr: 'pipe',
  });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const lookupTool = tools.tools.find((tool) => tool.name === 'lookup_api');
    assert.ok(lookupTool);
    assert.equal(lookupTool.annotations.readOnlyHint, true);
    assert.ok(tools.tools.some((tool) => tool.name === 'search_restrictions'));

    const result = await client.callTool({
      name: 'lookup_api',
      arguments: { name: 'C_UnitAuras.GetAuraDataByIndex', kind: 'function' },
    });
    const text = result.content.find((item) => item.type === 'text').text;
    assert.match(text, /RequiresUnitAuraAccess/);
    assert.match(text, /SecretArguments/);
  } finally {
    await client.close();
  }
});
