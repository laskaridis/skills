import type { CheckContext, CheckResult } from '../../lib/types.ts';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { readablePath, snapshot } from '../../lib/utils.ts';

export const SPEC = 'specs/workshop-rsvp.spec.md';

// Exact output contract: a single nonempty spec at the requested path, with
// all fixture and installed-skill files preserved.
export async function checkCase({
  workspace,
  initialSnapshot,
}: CheckContext): Promise<CheckResult> {
  const failures: string[] = [];
  const after = await snapshot(workspace);

  for (const [file, hash] of Object.entries(initialSnapshot)) {
    if (after[file] !== hash) {
      failures.push('Input modified or deleted: ' + file);
    }
  }

  for (const [file, hash] of Object.entries(after)) {
    if (!(file in initialSnapshot) && file !== SPEC) {
      failures.push('Unexpected output: ' + file);
    }

    if (hash === 'NON_REGULAR_FILE') {
      failures.push('Non-regular file: ' + file);
    }
  }

  if (SPEC in initialSnapshot) {
    failures.push('Spec path already existed in the case fixture: ' + SPEC);
  }

  if (!(await readablePath(workspace, SPEC))) {
    failures.push('Missing or unsafe specification: ' + SPEC);
  } else if (!(await fs.readFile(path.join(workspace, SPEC), 'utf8')).trim()) {
    failures.push('Empty specification: ' + SPEC);
  }

  return {
    status: failures.length ? 'fail' : 'pass',
    failures,
  };
}
