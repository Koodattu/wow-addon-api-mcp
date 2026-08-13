import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const repository = 'https://github.com/Gethe/wow-ui-source.git';
const sourceRoot = path.resolve('.cache', 'wow-ui-source');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function output(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stderr.trim());
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

if (!existsSync(path.join(sourceRoot, '.git'))) {
  run('git', ['clone', '--depth', '1', '--branch', 'live', repository, sourceRoot]);
} else {
  const safeRoot = sourceRoot.replaceAll('\\', '/');
  const origin = output('git', ['-c', `safe.directory=${safeRoot}`, '-C', sourceRoot, 'remote', 'get-url', 'origin'])
    .replace(/\/?$/, '')
    .replace(/\.git$/, '');
  if (origin !== repository.replace(/\.git$/, '')) {
    console.error(`Refusing to update unexpected origin at ${sourceRoot}: ${origin}`);
    process.exit(1);
  }
  run('git', ['-c', `safe.directory=${safeRoot}`, '-C', sourceRoot, 'fetch', '--depth', '1', 'origin', 'live']);
  run('git', ['-c', `safe.directory=${safeRoot}`, '-C', sourceRoot, 'checkout', 'live']);
  run('git', ['-c', `safe.directory=${safeRoot}`, '-C', sourceRoot, 'merge', '--ff-only', 'FETCH_HEAD']);
}

run(process.execPath, ['scripts/build-dataset.mjs', '--source', sourceRoot]);
