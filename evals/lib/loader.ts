import type { CaseDefinition, Control } from './types.ts';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { exactKeys, nonempty, object } from './utils.ts';

// Imports an optional suite module; returns null when the file does not exist.
async function optionalModule(directory: string, name: string) {
  const file = path.join(directory, name);
  let stat;

  try {
    stat = await fs.lstat(file);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }

  if (!stat.isFile()) {
    throw new Error(`Expected ordinary module: ${file}`);
  }

  return import(pathToFileURL(file).href);
}

// Loads and validates the suite's optional checks.ts hook module; null when absent.
export async function loadDeterministicChecksFor(suite: string) {
  const hooks = await optionalModule(suite, 'checks.ts');

  if (hooks && typeof hooks.checkCase !== 'function') {
    throw new Error('checks.ts must export checkCase');
  }

  return hooks;
}

// Loads and validates the suite's optional judge-tests.ts controls; null when absent.
export async function loadJudgeTests(
  suite: string,
  cases: Pick<CaseDefinition, 'id' | 'requirements'>[],
): Promise<Control[] | null> {
  const module = await optionalModule(suite, 'judge-tests.ts');

  if (!module) {
    return null;
  }

  validateControls(module.controls, cases);

  return module.controls;
}

export function validateControls(
  controls: unknown,
  cases: Pick<CaseDefinition, 'id' | 'requirements'>[],
): asserts controls is Control[] {
  if (!Array.isArray(controls) || !controls.length) {
    throw new Error('judge-tests.ts must export a nonempty controls array');
  }

  const ids = new Set();

  for (const control of controls) {
    const item = cases.find((c) => c.id === control.caseId);

    if (
      !nonempty(control.id) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(control.id) ||
      ids.has(control.id) ||
      !item
    ) {
      throw new Error('Invalid/duplicate control ID or unknown case ID');
    }

    ids.add(control.id);

    if (
      !object(control.generatedFiles) ||
      !Object.values(control.generatedFiles).every(
        (value) => typeof value === 'string',
      ) ||
      typeof control.finalResponse !== 'string' ||
      !exactKeys(
        control.expected,
        item.requirements.map((r) => r.id),
      ) ||
      !Object.values(control.expected).every(
        (s) =>
          typeof s === 'string' && ['pass', 'fail', 'ungradable'].includes(s),
      )
    ) {
      throw new Error(
        `Invalid control output or expected statuses: ${control.id}`,
      );
    }
  }
}
