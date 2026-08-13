import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { compareVersions } from './lib/dataset-manifest.mjs';

const sourceRoot = path.resolve('.cache', 'wow-ui-source');
const worktreeRoot = path.resolve('.cache', 'wow-ui-history');
const repository = 'https://github.com/Gethe/wow-ui-source';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `${command} ${args.join(' ')} failed`);
  return result.stdout?.trim() ?? '';
}

function git(root, ...args) {
  const safeRoot = root.replaceAll('\\', '/');
  return run('git', ['-c', `safe.directory=${safeRoot}`, '-C', root, ...args]);
}

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  if (!process.argv[index + 1]) throw new Error(`${name} requires a version`);
  return process.argv[index + 1];
}

function canonicalSnapshots(ref) {
  const lines = git(sourceRoot, 'log', ref, '--format=%H%x09%cI%x09%s').split('\n');
  const snapshots = new Map();
  for (const line of lines) {
    const [commit, commitDate, subject] = line.split('\t');
    const match = /^(\d+\.\d+\.\d+) \((\d+)\)$/.exec(subject);
    if (!match || snapshots.has(match[1])) continue;
    snapshots.set(match[1], { version: match[1], build: match[2], commit, commitDate });
  }
  return [...snapshots.values()].sort((left, right) => compareVersions(left.version, right.version));
}

async function main() {
  if (!existsSync(path.join(sourceRoot, '.git'))) throw new Error('Run npm run data:update before building history');
  if (existsSync(worktreeRoot)) throw new Error(`History worktree already exists: ${worktreeRoot}`);
  const origin = git(sourceRoot, 'remote', 'get-url', 'origin').replace(/\/?$/, '').replace(/\.git$/, '');
  if (origin !== repository) throw new Error(`Unexpected source origin: ${origin}`);

  if (git(sourceRoot, 'rev-parse', '--is-shallow-repository') === 'true') {
    run('git', ['-c', `safe.directory=${sourceRoot.replaceAll('\\', '/')}`, '-C', sourceRoot, 'fetch', '--unshallow', '--filter=blob:none', 'origin', 'live'], { stdio: 'inherit' });
  } else {
    run('git', ['-c', `safe.directory=${sourceRoot.replaceAll('\\', '/')}`, '-C', sourceRoot, 'fetch', '--filter=blob:none', 'origin', 'live'], { stdio: 'inherit' });
  }

  const from = argument('--from', '10.0.0');
  const to = argument('--to', '999.999.999');
  const snapshots = canonicalSnapshots('FETCH_HEAD').filter((snapshot) => (
    compareVersions(snapshot.version, from) >= 0 && compareVersions(snapshot.version, to) <= 0
  ));
  if (snapshots.length === 0) throw new Error(`No versions found between ${from} and ${to}`);

  try {
    git(sourceRoot, 'worktree', 'add', '--detach', worktreeRoot, snapshots[0].commit);
    for (const [index, snapshot] of snapshots.entries()) {
      if (index > 0) git(worktreeRoot, 'checkout', '--detach', snapshot.commit);
      console.log(`\n[${index + 1}/${snapshots.length}] Building retail ${snapshot.version} (${snapshot.build})`);
      run(process.execPath, [
        'scripts/build-dataset.mjs',
        '--source', worktreeRoot,
        '--client-version', `${snapshot.version}.${snapshot.build}`,
      ], { stdio: 'inherit' });
    }
  } finally {
    try {
      git(sourceRoot, 'worktree', 'remove', '--force', worktreeRoot);
    } catch (error) {
      console.error(`Could not remove temporary worktree: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
