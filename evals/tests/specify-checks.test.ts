import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkCase, SPEC } from '../skills/specify/checks.ts';
import { snapshot } from '../lib/utils.ts';

const roots: string[] = [];

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'specify-checks-'));

  roots.push(workspace);
  await fs.writeFile(path.join(workspace, 'README.md'), 'unchanged');
  await fs.mkdir(path.join(workspace, 'specs'));
  const initialSnapshot = await snapshot(workspace);
  const run = () =>
    checkCase({
      caseId: 'complete',
      workspace,
      initialSnapshot,
      finalResponse: '',
    });
  return { workspace, run };
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe('specify output checks', () => {
  it('accepts exactly one nonempty spec with unchanged inputs', async () => {
    const { workspace, run } = await fixture();

    await fs.writeFile(path.join(workspace, SPEC), '# Workshop RSVP');
    expect(await run()).toEqual({ status: 'pass', failures: [] });
  });

  it('rejects missing and empty specs', async () => {
    const { workspace, run } = await fixture();

    expect((await run()).failures).toContain(
      'Missing or unsafe specification: ' + SPEC,
    );
    await fs.writeFile(path.join(workspace, SPEC), '  ');
    expect((await run()).failures).toContain('Empty specification: ' + SPEC);
  });

  it('rejects modified inputs and unrelated outputs', async () => {
    const { workspace, run } = await fixture();

    await fs.writeFile(path.join(workspace, SPEC), '# Workshop RSVP');
    await fs.writeFile(path.join(workspace, 'README.md'), 'changed');
    await fs.writeFile(path.join(workspace, 'extra.md'), 'unexpected');
    const { failures } = await run();

    expect(failures).toContain('Input modified or deleted: README.md');
    expect(failures).toContain('Unexpected output: extra.md');
  });

  it('rejects non-regular outputs and a linked spec', async () => {
    const { workspace, run } = await fixture();

    await fs.writeFile(path.join(workspace, 'target.md'), 'outside contract');
    await fs.symlink(
      path.join(workspace, 'target.md'),
      path.join(workspace, SPEC),
    );
    const { failures } = await run();

    expect(failures).toContain('Non-regular file: ' + SPEC);
    expect(failures).toContain('Missing or unsafe specification: ' + SPEC);
  });
});
