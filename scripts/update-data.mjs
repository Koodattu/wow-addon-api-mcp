import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { channelProfile } from '../src/channels.mjs';

const repository = 'https://github.com/Gethe/wow-ui-source.git';
const channelIndex = process.argv.indexOf('--channel');
const channel = channelIndex < 0 ? 'retail' : process.argv[channelIndex + 1];
if (channelIndex >= 0 && !channel) throw new Error('--channel requires retail or forever');
const { branch } = channelProfile(channel);
const sourceRoot = path.resolve('.cache', channel === 'retail' ? 'wow-ui-source' : 'wow-ui-forever');

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
  run('git', ['clone', '--depth', '1', '--branch', branch, repository, sourceRoot]);
} else {
  const safeRoot = sourceRoot.replaceAll('\\', '/');
  const origin = output('git', ['-c', `safe.directory=${safeRoot}`, '-C', sourceRoot, 'remote', 'get-url', 'origin'])
    .replace(/\/?$/, '')
    .replace(/\.git$/, '');
  if (origin !== repository.replace(/\.git$/, '')) {
    console.error(`Refusing to update unexpected origin at ${sourceRoot}: ${origin}`);
    process.exit(1);
  }
  if (output('git', ['-c', `safe.directory=${safeRoot}`, '-C', sourceRoot, 'status', '--porcelain'])) {
    throw new Error(`Refusing to update a source checkout with local changes: ${sourceRoot}`);
  }
  run('git', ['-c', `safe.directory=${safeRoot}`, '-C', sourceRoot, 'fetch', 'origin', branch]);
  run('git', ['-c', `safe.directory=${safeRoot}`, '-C', sourceRoot, 'checkout', branch]);
  run('git', ['-c', `safe.directory=${safeRoot}`, '-C', sourceRoot, 'merge', '--ff-only', 'FETCH_HEAD']);
}

run(process.execPath, ['scripts/build-dataset.mjs', '--source', sourceRoot, '--channel', channel,
  ...(process.argv.includes('--allow-partial-resources') ? ['--allow-partial-resources'] : [])]);
