import { readFile } from 'node:fs/promises';
import path from 'node:path';

const positional = process.argv.slice(2).find((argument) => !argument.startsWith('-'));
const input = path.resolve(positional ?? 'data/manifest.json');
const manifest = JSON.parse(await readFile(input, 'utf8'));
const summary = { schemaVersion: manifest.schemaVersion, channel: manifest.channel, default: manifest.default, versions: manifest.versions };

if (process.argv.includes('--json')) console.log(JSON.stringify(summary));
else console.log(JSON.stringify(summary, null, 2));
