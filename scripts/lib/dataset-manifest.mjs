import { readFile, rename, writeFile } from 'node:fs/promises';
import { channelProfile, matchesChannel } from '../../src/channels.mjs';

export function patchVersion(clientVersion) {
  const match = /^(\d+\.\d+\.\d+)(?:\.(\d+))?$/.exec(clientVersion.trim());
  if (!match) throw new Error(`Unsupported WoW client version: ${clientVersion}`);
  return { version: match[1], build: match[2] ?? null };
}

export function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

export async function readManifest(manifestPath, channel = 'retail') {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { schemaVersion: 1, channel, default: null, versions: [] };
  }
}

export async function updateManifest(manifestPath, entry, channel = 'retail') {
  channelProfile(channel);
  if (!matchesChannel(entry.clientVersion, channel)) throw new Error(`Client version ${entry.clientVersion} does not belong to ${channel}`);
  const manifest = await readManifest(manifestPath, channel);
  if (manifest.schemaVersion !== 1) throw new Error(`Unsupported manifest schema: ${manifest.schemaVersion}`);
  if (manifest.channel !== channel) throw new Error(`Cannot write ${channel} data into a ${manifest.channel} manifest`);

  const versions = manifest.versions.filter((candidate) => candidate.version !== entry.version);
  versions.push(entry);
  versions.sort((left, right) => compareVersions(left.version, right.version));
  const updated = {
    schemaVersion: 1,
    channel,
    default: versions.at(-1).version,
    versions,
  };
  const temporary = `${manifestPath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`);
  await rename(temporary, manifestPath);
  return updated;
}
