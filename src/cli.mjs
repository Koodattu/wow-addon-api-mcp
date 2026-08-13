#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createServer } from './server.mjs';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

if (process.argv.includes('--version')) {
  console.log(packageJson.version);
} else {
  const { server, store } = await createServer({ version: packageJson.version });
  if (process.argv.includes('--dataset-info')) {
    console.log(JSON.stringify(store.info(), null, 2));
  } else {
    await server.connect(new StdioServerTransport());
  }
}
