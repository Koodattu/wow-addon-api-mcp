#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createServer } from './server.mjs';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

if (process.argv.includes('--version')) {
  console.log(packageJson.version);
} else {
  const channelIndex = process.argv.indexOf('--channel');
  const channel = channelIndex < 0 ? undefined : process.argv[channelIndex + 1];
  if (channelIndex >= 0 && (!channel || channel.startsWith('--'))) throw new Error('--channel requires retail or forever');
  const runtimePaths = process.argv.flatMap((argument, index) => {
    if (argument !== '--runtime-data') return [];
    const file = process.argv[index + 1];
    if (!file || file.startsWith('--')) throw new Error('--runtime-data requires a JSON snapshot path');
    return [file];
  });
  const { server, catalog, catalogs } = await createServer({ packageVersion: packageJson.version, channel,
    runtimeDataPath: runtimePaths.length ? runtimePaths : undefined });
  if (process.argv.includes('--dataset-info')) {
    console.log(JSON.stringify(catalog ? catalog.info('latest') : { channels: [...catalogs.values()].map((entry) => entry.info('latest')) }, null, 2));
  } else if (process.argv.includes('--list-versions')) {
    console.log([...catalogs.values()].flatMap((selected) => selected.listVersions().map((entry) =>
      `${catalog ? '' : entry.channel + '\t'}${entry.version}\t${entry.build}${entry.default ? '\tlatest' : ''}`)).join('\n'));
  } else {
    await server.connect(new StdioServerTransport());
  }
}
