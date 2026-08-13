import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { extractDataset } from './lib/extract-dataset.mjs';
import { patchVersion, updateManifest } from './lib/dataset-manifest.mjs';

const DEFAULT_SOURCE = path.resolve('.cache', 'wow-ui-source');
const DEFAULT_MANIFEST = path.resolve('data', 'manifest.json');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  if (!process.argv[index + 1]) throw new Error(`${name} requires a path`);
  return path.resolve(process.argv[index + 1]);
}

function stringOption(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  if (!process.argv[index + 1]) throw new Error(`${name} requires a value`);
  return process.argv[index + 1];
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
  if (dataset.stats.systems < 300) throw new Error(`Only ${dataset.stats.systems} API systems were extracted`);
  if (dataset.stats.functions < 1500) throw new Error(`Only ${dataset.stats.functions} API functions were extracted`);

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

  if (Number.parseInt(dataset.source.version, 10) >= 12) {
    const hasSecurityMetadata = dataset.functions.some((entry) => Object.keys(entry.metadata).some((key) => (
      key === 'SecretArguments' || key === 'HasRestrictions' || key === 'RequiresUnitAuraAccess'
    )));
    if (!hasSecurityMetadata) throw new Error('No function security metadata was extracted');
  }
}

async function main() {
  const sourceRoot = option('--source', DEFAULT_SOURCE);
  const manifestPath = option('--manifest', DEFAULT_MANIFEST);
  const suppliedVersion = stringOption('--client-version', null);
  const version = suppliedVersion ?? (await readFile(path.join(sourceRoot, 'version.txt'), 'utf8')).trim();
  const parsedVersion = patchVersion(version);
  const output = option('--output', path.join(path.dirname(manifestPath), 'retail', `${parsedVersion.version}.json.gz`));
  const commit = git(sourceRoot, 'rev-parse', 'HEAD');
  const commitDate = git(sourceRoot, 'show', '-s', '--format=%cI', 'HEAD');
  const branch = git(sourceRoot, 'branch', '--show-current') || 'live';

  const dataset = await extractDataset(sourceRoot, {
    repository: 'https://github.com/Gethe/wow-ui-source',
    branch,
    version,
    patch: parsedVersion.version,
    build: parsedVersion.build,
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

  await mkdir(path.dirname(manifestPath), { recursive: true });
  const relativeFile = path.relative(path.dirname(manifestPath), output).split(path.sep).join('/');
  const manifest = await updateManifest(manifestPath, {
    version: parsedVersion.version,
    clientVersion: version,
    build: parsedVersion.build,
    commit,
    commitDate,
    file: relativeFile,
    stats: dataset.stats,
  });

  console.log(JSON.stringify({ output, manifest: manifestPath, default: manifest.default, bytes: compressed.length, source: dataset.source, stats: dataset.stats }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
