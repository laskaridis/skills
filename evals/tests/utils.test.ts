import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { temporary, put } from './helpers.ts';
import {
  sha,
  nonempty,
  object,
  exactKeys,
  readJSON,
  writeJSON,
  files,
  snapshot,
  copyTree,
  archiveWorkspace,
  gitInit,
  gitState,
  readablePath,
} from '../lib/utils.ts';

test('scalar helpers validate hashes, strings, objects and keys', () => {
  // Given
  const blanks = [null, [], 42, '', ' '];
  const nonObjects = [null, [], 42, 'x'];

  // When
  const blankResults = blanks.map((value) => nonempty(value));
  const nonObjectResults = nonObjects.map((value) => object(value));
  const digest = sha('abc');

  // Then
  assert.deepEqual(blankResults, [false, false, false, false, false]);
  assert.deepEqual(nonObjectResults, [false, false, false, false]);

  assert.equal(
    digest,
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );

  assert.equal(nonempty(' a '), true);
  assert.equal(object({}), true);

  assert.equal(exactKeys({ a: 1, b: 2 }, ['b', 'a']), true);
  assert.equal(exactKeys({}, ['a']), false);
});

test('JSON round trips and rejects malformed or missing files', async (t) => {
  // Given
  const root = await temporary(t);
  const file = path.join(root, 'data.json');

  await put(root, 'bad', '{');

  // When
  await writeJSON(file, { a: 1 });
  const written = await readJSON(file);

  // Then
  assert.deepEqual(written, { a: 1 });

  await assert.rejects(readJSON(path.join(root, 'bad')));
  await assert.rejects(readJSON(path.join(root, 'absent')));
});

test('file traversal sorts and only skips root Git directory', async (t) => {
  // Given
  const root = await temporary(t);

  await put(root, 'z');
  await put(root, 'a/first');
  await put(root, 'a/.git/kept');
  await put(root, '.git/omitted');

  // When
  const visible = await files(root);
  const all = await files(root, '', true);

  // Then
  assert.deepEqual(visible, ['a/.git/kept', 'a/first', 'z']);
  assert.deepEqual(all, ['.git/omitted', 'a/.git/kept', 'a/first', 'z']);
});

test('snapshots and archives hash regular files and record links and special files without copying them', async (t) => {
  // Given
  const root = await temporary(t);
  const source = path.join(root, 'source');

  await put(source, 'nested/file', 'abc');
  await fs.symlink('/outside', path.join(source, 'link'));

  const mkfifo = spawnSync('mkfifo', [path.join(source, 'fifo')]);

  // When
  const hashes = await snapshot(source);

  await archiveWorkspace(source, root, 'archive');

  const manifest = await readJSON(path.join(root, 'archive.manifest.json'));

  // Then
  assert.equal(mkfifo.status, 0);

  assert.deepEqual(hashes, {
    fifo: 'NON_REGULAR_FILE',
    link: 'NON_REGULAR_FILE',
    'nested/file': sha('abc'),
  });

  assert.deepEqual(manifest.fifo, { type: 'other', target: null });
  assert.deepEqual(manifest.link, { type: 'symlink', target: '/outside' });
  assert.equal(manifest['nested/file'].sha256, sha('abc'));

  await assert.rejects(fs.access(path.join(root, 'archive/link')));
  await assert.rejects(fs.access(path.join(root, 'archive/fifo')));
});

test('copy preserves nested empty directories and omits .git', async (t) => {
  // Given
  const root = await temporary(t);
  const source = path.join(root, 'source');

  await put(source, 'a/file', 'content');
  await put(source, '.git/config');
  await fs.mkdir(path.join(source, 'empty'));

  // When
  await copyTree(source, path.join(root, 'copy'));

  const content = await fs.readFile(path.join(root, 'copy/a/file'), 'utf8');

  // Then
  assert.equal(content, 'content');

  await fs.access(path.join(root, 'copy/empty'));
  await assert.rejects(fs.access(path.join(root, 'copy/.git')));
});

test('copy rejects nonregular inputs', async (t) => {
  // Given
  const root = await temporary(t);
  const source = path.join(root, 'source');

  await put(source, 'a/file', 'content');
  await fs.symlink('/outside', path.join(source, 'link'));

  // When
  const fromFile = copyTree(
    path.join(source, 'a/file'),
    path.join(root, 'bad'),
  );
  const fromLink = copyTree(source, path.join(root, 'bad'));

  // Then
  await assert.rejects(fromFile, /ordinary directory/);
  await assert.rejects(fromLink, /Non-regular/);
});

test('readablePath accepts only ordinary files with safe relative components', async (t) => {
  // Given
  const root = await temporary(t);

  await put(root, 'dir/file', 'content');
  await fs.symlink('dir', path.join(root, 'alias'));
  await fs.symlink('dir/file', path.join(root, 'link'));

  // When / Then
  assert.equal(await readablePath(root, 'dir/file'), true);

  for (const relative of [
    null,
    '',
    ' ',
    '/absolute',
    'a\\b',
    '../outside',
    'dir/../file',
    './dir/file',
    'dir//file',
    'dir/',
    'dir',
    'link',
    'alias/file',
  ]) {
    assert.equal(await readablePath(root, relative), false, String(relative));
  }

  await assert.rejects(readablePath(root, 'missing'), /ENOENT/);
});

test('Git initialization creates an isolated repository', async (t) => {
  // Given
  const root = await temporary(t);

  // When
  gitInit(root);

  // Then
  await fs.access(path.join(root, '.git'));
});

test('Git initialization reports unavailable executable', async (t) => {
  // Given
  const root = await temporary(t);
  const old = process.env.PATH;

  t.onTestFinished(() => {
    process.env.PATH = old;
  });
  process.env.PATH = root;

  // When
  const act = () => gitInit(root);

  // Then
  assert.throws(act, /git init:/);
});

test('Git initialization reports executable failures', async (t) => {
  // Given
  const root = await temporary(t);
  const old = process.env.PATH;

  await put(root, 'git', '#!/bin/sh\necho failure >&2\nexit 2\n');
  await fs.chmod(path.join(root, 'git'), 0o755);

  t.onTestFinished(() => {
    process.env.PATH = old;
  });
  process.env.PATH = root;

  // When
  const act = () => gitInit(root);

  // Then
  assert.throws(act, /failure/);
});

test('Git state is unknown outside a repository', async (t) => {
  // Given
  const root = await temporary(t);

  // When
  const state = gitState(root);

  // Then
  assert.deepEqual(state, { commit: null, dirty: null });
});
