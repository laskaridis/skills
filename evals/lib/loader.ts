import type { CaseDefinition, Control, QualityStatus } from './types.ts';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { exactKeys, files, nonempty, object } from './utils.ts';

type ControlCases = Pick<CaseDefinition, 'id' | 'requirements'>[];

// A control as declared in controls.yml, before its fixture is read.
export type ControlDeclaration = Omit<
  Control,
  'generatedFiles' | 'finalResponse'
>;

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

const STATUSES: unknown[] = ['pass', 'fail', 'ungradable'];

const CONTROL_KEYS = ['case', 'description', 'default', 'expect'];

// Stats a path without following links; null when it does not exist.
async function optionalStat(file: string) {
  try {
    return await fs.lstat(file);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

// Imports an optional suite module; returns null when the file does not exist.
async function optionalModule(directory: string, name: string) {
  const file = path.join(directory, name);
  const stat = await optionalStat(file);

  if (!stat) {
    return null;
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

// Validates a parsed controls.yml and expands each control's default and
// expect overrides to a verdict for every criterion of its case.
export function validateControls(
  document: unknown,
  cases: ControlCases,
): ControlDeclaration[] {
  if (!exactKeys(document, ['version', 'controls']) || document.version !== 1) {
    throw new Error('controls.yml must contain only version: 1 and controls');
  }

  if (!object(document.controls) || !Object.keys(document.controls).length) {
    throw new Error('controls.yml must define at least one control');
  }

  return Object.entries(document.controls).map(([id, control]) => {
    const item = cases.find((c) => object(control) && c.id === control.case);

    if (!IDENTIFIER.test(id) || !item) {
      throw new Error(`Invalid control ID or unknown case: ${id}`);
    }

    const criteria = item.requirements.map((r) => r.id);
    const expect = control.expect ?? {};

    if (
      !Object.keys(control).every((key) => CONTROL_KEYS.includes(key)) ||
      !['string', 'undefined'].includes(typeof control.description) ||
      !STATUSES.includes(control.default) ||
      !object(expect) ||
      !Object.entries(expect).every(
        ([criterion, status]) =>
          criteria.includes(criterion) && STATUSES.includes(status),
      )
    ) {
      throw new Error(`Invalid control declaration: ${id}`);
    }

    return {
      id,
      caseId: item.id,
      ...(control.description === undefined
        ? {}
        : { description: control.description }),
      expected: Object.fromEntries(
        criteria.map((c): [string, QualityStatus] => [
          c,
          expect[c] ?? control.default,
        ]),
      ),
    };
  });
}

async function readControlsFile(file: string) {
  if (!(await optionalStat(file))?.isFile()) {
    throw new Error(`Expected ordinary file: ${file}`);
  }

  try {
    return parse(await fs.readFile(file, 'utf8'));
  } catch (error: any) {
    throw new Error(`Invalid YAML in ${file}: ${error.message}`, {
      cause: error,
    });
  }
}

// Lists a directory's entries; empty when it does not exist.
async function entries(directory: string) {
  try {
    return await fs.readdir(directory, { withFileTypes: true });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

// Reads skill-output-files/ into generatedFiles, keyed by relative path.
async function readOutputFiles(directory: string) {
  const generatedFiles: Record<string, string> = {};

  for (const file of await files(directory)) {
    const absolute = path.join(directory, file);

    if (!(await fs.lstat(absolute)).isFile()) {
      throw new Error(`Non-regular skill output file: ${absolute}`);
    }

    generatedFiles[file] = await fs.readFile(absolute, 'utf8');
  }

  return generatedFiles;
}

// Reads a control's fixture folder: final-message.md and optional skill-output-files/.
async function readFixture(folder: string) {
  let finalResponse: string | null = null;
  let generatedFiles: Record<string, string> = {};

  for (const entry of await entries(folder)) {
    const file = path.join(folder, entry.name);

    if (entry.name === 'final-message.md' && entry.isFile()) {
      finalResponse = await fs.readFile(file, 'utf8');
    } else if (entry.name === 'skill-output-files' && entry.isDirectory()) {
      generatedFiles = await readOutputFiles(file);
    } else {
      throw new Error(`Unexpected control fixture entry: ${file}`);
    }
  }

  if (!nonempty(finalResponse)) {
    throw new Error(
      `Missing or empty final-message.md: ${path.join(folder, 'final-message.md')}`,
    );
  }

  return { generatedFiles, finalResponse };
}

// Loads and validates the suite's optional judge-controls/; null when absent.
export async function loadJudgeControls(
  suite: string,
  cases: ControlCases,
): Promise<Control[] | null> {
  const root = path.join(suite, 'judge-controls');
  const stat = await optionalStat(root);

  if (!stat) {
    return null;
  }

  if (!stat.isDirectory()) {
    throw new Error(`Expected ordinary directory: ${root}`);
  }

  const declarations = validateControls(
    await readControlsFile(path.join(root, 'controls.yml')),
    cases,
  );
  const fixtures = path.join(root, 'fixtures');
  const ids = declarations.map((d) => d.id);
  const folders = (await entries(fixtures)).map((entry) => {
    if (!entry.isDirectory() || !ids.includes(entry.name)) {
      throw new Error(
        `Fixture without a control: ${path.join(fixtures, entry.name)}`,
      );
    }

    return entry.name;
  });
  const controls: Control[] = [];

  for (const declaration of declarations) {
    if (!folders.includes(declaration.id)) {
      throw new Error(`Control without a fixture folder: ${declaration.id}`);
    }

    controls.push({
      ...declaration,
      ...(await readFixture(path.join(fixtures, declaration.id))),
    });
  }

  return controls;
}
