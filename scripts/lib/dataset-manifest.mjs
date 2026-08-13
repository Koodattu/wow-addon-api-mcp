import { readFile, rename, writeFile } from 'node:fs/promises';

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

export async function readManifest(manifestPath) {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { schemaVersion: 1, channel: 'retail', default: null, versions: [] };
  }
}

export async function updateManifest(manifestPath, entry) {
  const manifest = await readManifest(manifestPath);
  if (manifest.schemaVersion !== 1) throw new Error(`Unsupported manifest schema: ${manifest.schemaVersion}`);

  const versions = manifest.versions.filter((candidate) => candidate.version !== entry.version);
  versions.push(entry);
  versions.sort((left, right) => compareVersions(left.version, right.version));
  const updated = {
    schemaVersion: 1,
    channel: 'retail',
    default: versions.at(-1).version,
    versions,
  };
  const temporary = `${manifestPath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`);
  await rename(temporary, manifestPath);
  return updated;
}
