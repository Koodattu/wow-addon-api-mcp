#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createServer } from './server.mjs';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

if (process.argv.includes('--version')) {
  console.log(packageJson.version);
} else {
  const channelIndex = process.argv.indexOf('--channel');
  const channel = channelIndex < 0 ? 'retail' : process.argv[channelIndex + 1];
  if (channelIndex >= 0 && (!channel || channel.startsWith('--'))) throw new Error('--channel requires retail or forever');
  const runtimeIndex = process.argv.indexOf('--runtime-data');
  const runtimeDataPath = runtimeIndex < 0 ? undefined : process.argv[runtimeIndex + 1];
  if (runtimeIndex >= 0 && (!runtimeDataPath || runtimeDataPath.startsWith('--'))) throw new Error('--runtime-data requires a JSON snapshot path');
  const { server, catalog } = await createServer({ packageVersion: packageJson.version, channel, runtimeDataPath });
  if (process.argv.includes('--dataset-info')) {
    console.log(JSON.stringify(catalog.info('latest'), null, 2));
  } else if (process.argv.includes('--list-versions')) {
    console.log(catalog.listVersions().map((entry) => `${entry.version}\t${entry.build}${entry.default ? '\tlatest' : ''}`).join('\n'));
  } else {
    await server.connect(new StdioServerTransport());
  }
}
