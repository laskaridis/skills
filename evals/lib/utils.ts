import type { JsonRecord, Snapshot } from './types.ts';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';

export const sha = (data: string | Buffer) =>
  createHash('sha256').update(data).digest('hex');

export const readJSON = async <T = JsonRecord>(file: string): Promise<T> =>
  JSON.parse(await fs.readFile(file, 'utf8'));

export const writeJSON = (file: string, data: unknown) =>
  fs.writeFile(file, JSON.stringify(data, null, 2) + '\n');

export const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const object = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const exactKeys = (
  value: unknown,
  keys: readonly string[],
): value is JsonRecord =>
  object(value) &&
  Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');

// Do not follow links: inputs and artifacts must be ordinary files inside their root.
export async function files(
  root: string,
  prefix = '',
  includeGit = false,
): Promise<string[]> {
  const result = [];

  for (const entry of (
    await fs.readdir(path.join(root, prefix), { withFileTypes: true })
  ).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!includeGit && !prefix && entry.name === '.git') {
      continue;
    }

    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      result.push(...(await files(root, relative, includeGit)));
    } else {
      result.push(relative);
    }
  }

  return result;
}

export async function snapshot(root: string): Promise<Snapshot> {
  const result: Snapshot = {};

  for (const file of await files(root)) {
    const absolute = path.join(root, file);
    const stat = await fs.lstat(absolute);

    result[file] = stat.isFile()
      ? sha(await fs.readFile(absolute))
      : 'NON_REGULAR_FILE';
  }

  return result;
}

export async function copyTree(
  source: string,
  destination: string,
): Promise<void> {
  if (!(await fs.lstat(source)).isDirectory()) {
    throw new Error(`Expected ordinary directory: ${source}`);
  }

  await fs.mkdir(destination, { recursive: true });

  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.name === '.git') {
      continue;
    }

    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyTree(from, to);
    } else if (entry.isFile()) {
      await fs.copyFile(from, to);
    } else {
      throw new Error(`Non-regular input file: ${from}`);
    }
  }
}

export async function archiveWorkspace(
  source: string,
  directory: string,
  label: string,
) {
  const destination = path.join(directory, label);
  const manifest: Record<
    string,
    { type: string; sha256?: string; target?: string | null }
  > = {};

  await fs.mkdir(destination, { recursive: true });

  for (const file of await files(source)) {
    const from = path.join(source, file);
    const stat = await fs.lstat(from);

    if (stat.isFile()) {
      const to = path.join(destination, file);

      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
      manifest[file] = { type: 'file', sha256: sha(await fs.readFile(from)) };
    } else {
      // Preserve evidence without following or recreating links in the archive.
      manifest[file] = {
        type: stat.isSymbolicLink() ? 'symlink' : 'other',
        target: stat.isSymbolicLink() ? await fs.readlink(from) : null,
      };
    }
  }

  await writeJSON(path.join(directory, `${label}.manifest.json`), manifest);
}

export function gitInit(cwd: string) {
  const result = spawnSync('git', ['init', '--quiet'], {
    cwd,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(`git init: ${result.stderr || result.error}`);
  }
}

// Records the commit and whether the tree has uncommitted changes; nulls when
// the directory is not a Git checkout.
export function gitState(cwd: string) {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  });
  const status = spawnSync('git', ['status', '--porcelain'], {
    cwd,
    encoding: 'utf8',
  });

  if (head.status !== 0 || status.status !== 0) {
    return { commit: null, dirty: null };
  }

  return { commit: head.stdout.trim(), dirty: status.stdout.trim() !== '' };
}

export async function readablePath(root: string, relative: unknown) {
  if (
    !nonempty(relative) ||
    path.posix.isAbsolute(relative) ||
    relative.includes('\\') ||
    relative.split('/').some((part) => part === '..' || part === '.' || !part)
  ) {
    return false;
  }

  let current = root;

  for (const part of relative.split('/')) {
    current = path.join(current, part);

    if ((await fs.lstat(current)).isSymbolicLink()) {
      return false;
    }
  }

  if (!(await fs.stat(current)).isFile()) {
    return false;
  }

  await fs.access(current);
  await fs.readFile(current);

  return true;
}
