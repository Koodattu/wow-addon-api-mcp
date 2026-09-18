import { spawnSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { channelManifest, channelProfile, matchesChannel } from '../src/channels.mjs';

import { extractDataset } from './lib/extract-dataset.mjs';
import { patchVersion, readManifest, updateManifest } from './lib/dataset-manifest.mjs';
import { writeArchive } from './lib/dataset-archive.mjs';

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

export function validateDataset(dataset) {
  const channel = dataset.source.channel ?? 'retail';
  if (!matchesChannel(dataset.source.version, channel)) throw new Error(`Client version ${dataset.source.version} does not belong to ${channel}`);
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

  if (channel === 'forever' || Number.parseInt(dataset.source.version, 10) >= 12) {
    const hasSecurityMetadata = dataset.functions.some((entry) => Object.keys(entry.metadata).some((key) => (
      key === 'SecretArguments' || key === 'HasRestrictions' || key === 'RequiresUnitAuraAccess'
    )));
    if (!hasSecurityMetadata) throw new Error('No function security metadata was extracted');
  }
}

async function main() {
  const channel = stringOption('--channel', 'retail');
  const profile = channelProfile(channel);
  const sourceRoot = option('--source', path.resolve('.cache', channel === 'retail' ? 'wow-ui-source' : 'wow-ui-forever'));
  const manifestPath = option('--manifest', fileURLToPath(channelManifest(channel)));
  const suppliedVersion = stringOption('--client-version', null);
  const version = suppliedVersion ?? (await readFile(path.join(sourceRoot, 'version.txt'), 'utf8')).trim();
  const parsedVersion = patchVersion(version);
  if (!matchesChannel(version, channel)) throw new Error(`Client version ${version} does not belong to ${channel}`);
  const previousManifest = await readManifest(manifestPath, channel);
  if (previousManifest.channel !== channel) throw new Error(`Cannot write ${channel} data into a ${previousManifest.channel} manifest`);
  const output = option('--output', path.join(path.dirname(manifestPath), channel === 'retail' ? 'retail' : 'snapshots', `${parsedVersion.version}.json.gz`));
  const commit = git(sourceRoot, 'rev-parse', 'HEAD');
  const commitDate = git(sourceRoot, 'show', '-s', '--format=%cI', 'HEAD');
  const branch = git(sourceRoot, 'branch', '--show-current') || profile.branch;

  const dataset = await extractDataset(sourceRoot, {
    repository: 'https://github.com/Gethe/wow-ui-source',
    ...(channel === 'retail' ? {} : { channel }),
    branch,
    version,
    patch: parsedVersion.version,
    build: parsedVersion.build,
    commit,
    commitDate,
  }, { includeResources: !process.argv.includes('--api-only'), allowPartialResources: process.argv.includes('--allow-partial-resources') });
  validateDataset(dataset);

  const previous = previousManifest.versions.find((entry) => entry.version === parsedVersion.version);
  let resourceMetadata = {};
  if (dataset.resources) {
    const resourceFile = `resources/${parsedVersion.version}.json.gz`;
    await writeArchive(path.join(path.dirname(manifestPath), resourceFile), { schemaVersion: 1, source: dataset.source, resources: dataset.resources });
    resourceMetadata = { resourceFile, resourceCounts: dataset.resources.counts, resourceCoverage: dataset.resources.coverage.status };
    delete dataset.resources;
  } else if (previous?.commit === commit && previous.resourceFile) {
    const { resourceFile, resourceCounts, resourceCoverage } = previous;
    resourceMetadata = { resourceFile, resourceCounts, resourceCoverage };
  }
  const bytes = await writeArchive(output, dataset);

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
    ...resourceMetadata,
  }, channel);

  console.log(JSON.stringify({ output, manifest: manifestPath, default: manifest.default, bytes, source: dataset.source, stats: dataset.stats, ...resourceMetadata }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
