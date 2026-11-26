/**
 * Owns a suite's on-disk judge control format.
 *
 * Responsibilities:
 * - load and validate controls against their cases
 * - expand each control to a verdict per requirement
 *
 * @module
 */

import type { CaseDefinition } from './cases.ts';
import type { JudgeVerdict } from './judging.ts';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { exactKeys, files, nonempty, object, optionalStat } from './utils.ts';

/** A judge control: a specimen output plus the verdicts the judge must reach. */
export interface Control {
  id: string;
  caseId: string;
  /** Why the specimen is good or bad; documentation only. */
  description?: string;
  generatedFiles: Record<string, string>;
  finalResponse: string;
  expected: Record<string, QualityStatus>;
}

/** The case fields controls are validated against: id and requirements. */
export type ControlCases = Pick<CaseDefinition, 'id' | 'requirements'>[];

/**
 * Loads and validates the suite's optional judge-controls/, pairing each
 * controls.yml declaration with its fixture folder.
 * @param suite Path to the suite directory.
 * @param cases The suite's cases; controls must name one and its criteria.
 * @returns The controls, or null when judge-controls/ is absent.
 * @throws When declarations are invalid or fixtures are missing or unexpected.
 */
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

  const declarations = _validateControls(
    await _readControlsFile(path.join(root, 'controls.yml')),
    cases,
  );
  const fixtures = path.join(root, 'fixtures');
  const ids = declarations.map((d) => d.id);
  const folders = (await _entries(fixtures)).map((entry) => {
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
      ...(await _readFixture(path.join(fixtures, declaration.id))),
    });
  }

  return controls;
}

/** Verdict for one requirement. */
type QualityStatus = JudgeVerdict['status'];

/** A control as declared in controls.yml, before its fixture is read. */
type ControlDeclaration = Omit<Control, 'generatedFiles' | 'finalResponse'>;

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

const STATUSES: unknown[] = ['pass', 'fail', 'ungradable'];

const CONTROL_KEYS = ['case', 'description', 'default', 'expect'];

/**
 * Validates a parsed controls.yml and expands each control's default and
 * expect overrides to a verdict for every criterion of its case.
 * @param document The parsed controls.yml contents.
 * @param cases The suite's cases; controls must name one and its criteria.
 * @throws When the document or any control declaration is invalid.
 */
function _validateControls(
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

async function _readControlsFile(file: string) {
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
async function _entries(directory: string) {
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
async function _readOutputFiles(directory: string) {
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
async function _readFixture(folder: string) {
  let finalResponse: string | null = null;
  let generatedFiles: Record<string, string> = {};

  for (const entry of await _entries(folder)) {
    const file = path.join(folder, entry.name);

    if (entry.name === 'final-message.md' && entry.isFile()) {
      finalResponse = await fs.readFile(file, 'utf8');
    } else if (entry.name === 'skill-output-files' && entry.isDirectory()) {
      generatedFiles = await _readOutputFiles(file);
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
