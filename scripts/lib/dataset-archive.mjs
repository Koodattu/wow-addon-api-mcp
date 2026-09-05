import { gzipSync } from 'node:zlib';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function writeArchive(output, dataset) {
  const compressed = gzipSync(Buffer.from(`${JSON.stringify(dataset)}\n`), { level: 9, mtime: 0 });
  // Preserve the archive convention across Windows and Linux zlib builds.
  compressed[9] = 0x0a;
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(`${output}.tmp`, compressed);
  await rename(`${output}.tmp`, output);
  return compressed.length;
}
