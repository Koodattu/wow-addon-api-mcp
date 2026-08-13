import { gunzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const input = path.resolve(process.argv[2] ?? 'data/mainline.json.gz');
const dataset = JSON.parse(gunzipSync(await readFile(input)));
const summary = { schemaVersion: dataset.schemaVersion, source: dataset.source, stats: dataset.stats };

if (process.argv.includes('--json')) console.log(JSON.stringify(summary));
else console.log(JSON.stringify(summary, null, 2));
