import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { extractDataset } from './lib/extract-dataset.mjs';

const DEFAULT_SOURCE = path.resolve('.cache', 'wow-ui-source');
const DEFAULT_OUTPUT = path.resolve('data', 'mainline.json.gz');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  if (!process.argv[index + 1]) throw new Error(`${name} requires a path`);
  return path.resolve(process.argv[index + 1]);
}

function git(sourceRoot, ...args) {
  const result = spawnSync('git', ['-c', `safe.directory=${sourceRoot.replaceAll('\\', '/')}`, '-C', sourceRoot, ...args], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
}

function validateDataset(dataset) {
  if (dataset.schemaVersion !== 1) throw new Error('Unexpected dataset schema version');
  if (dataset.stats.systems < 500) throw new Error(`Only ${dataset.stats.systems} API systems were extracted`);
  if (dataset.stats.functions < 2000) throw new Error(`Only ${dataset.stats.functions} API functions were extracted`);

  if (dataset.source.version.startsWith('12.1.')) {
    const functionNames = new Set(dataset.functions.map((entry) => entry.fullName));
    const widgetNames = new Set(dataset.widgets.map((entry) => entry.name));
    if (!functionNames.has('C_UnitAuras.GetHiddenGroupBuffs')) {
      throw new Error('Expected 12.1 API is missing: C_UnitAuras.GetHiddenGroupBuffs');
    }
    if (functionNames.has('C_UnitAuras.TriggerPrivateAuraShowDispelType')) {
      throw new Error('Removed 12.1 API is still present: C_UnitAuras.TriggerPrivateAuraShowDispelType');
    }
    for (const name of ['AuraButton', 'AuraContainer']) {
      if (!widgetNames.has(name)) throw new Error(`Expected 12.1 intrinsic widget is missing: ${name}`);
    }
  }

  const hasSecurityMetadata = dataset.functions.some((entry) => Object.keys(entry.metadata).some((key) => (
    key === 'SecretArguments' || key === 'HasRestrictions' || key === 'RequiresUnitAuraAccess'
  )));
  if (!hasSecurityMetadata) throw new Error('No function security metadata was extracted');
}

async function main() {
  const sourceRoot = option('--source', DEFAULT_SOURCE);
  const output = option('--output', DEFAULT_OUTPUT);
  const version = (await readFile(path.join(sourceRoot, 'version.txt'), 'utf8')).trim();
  const commit = git(sourceRoot, 'rev-parse', 'HEAD');
  const commitDate = git(sourceRoot, 'show', '-s', '--format=%cI', 'HEAD');
  const branch = git(sourceRoot, 'branch', '--show-current') || 'live';

  const dataset = await extractDataset(sourceRoot, {
    repository: 'https://github.com/Gethe/wow-ui-source',
    branch,
    version,
    commit,
    commitDate,
  });
  validateDataset(dataset);

  const compressed = gzipSync(Buffer.from(`${JSON.stringify(dataset)}\n`), {
    level: 9,
    mtime: 0,
  });
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp`;
  await writeFile(temporary, compressed);
  await rename(temporary, output);

  console.log(JSON.stringify({ output, bytes: compressed.length, source: dataset.source, stats: dataset.stats }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
