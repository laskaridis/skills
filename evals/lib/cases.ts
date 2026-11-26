/**
 * Owns a suite's on-disk case format.
 *
 * Responsibilities:
 * - load and validate cases
 * - scaffold new cases
 *
 * @module
 */

import * as fs from 'node:fs/promises';
import path from 'node:path';
import { files, nonempty, sha, snapshot } from './utils.ts';

/** A single expected behavior of a case, identified by a stable `id`. */
export interface Requirement {
  id: string;
  text: string;
}

/** A test case loaded from disk: its prompt, fixtures and graded requirements. */
export interface CaseDefinition {
  id: string;
  fixtures: string;
  fixtureFiles: string[];
  prompt: string;
  requirements: Requirement[];
  expectedMarkdown?: string;
  inputHash: string;
}

/**
 * Loads and validates the cases under `<suite>/cases`, sorted by ID.
 * @param suite Path to the suite directory.
 * @param skill Name of the skill under test; must be a safe identifier.
 * @param skillDir Where the skill is installed in a case workspace; fixtures
 * must not collide with it.
 * @returns At least one case, each with its prompt, fixtures and checklist.
 * @throws When the layout, a fixture path or a checklist is invalid.
 */
export async function loadCases(
  suite: string,
  skill: string,
  skillDir = '.agents/skills',
): Promise<CaseDefinition[]> {
  if (!identifier.test(skill)) {
    throw new Error(`Unsafe skill name: ${skill}`);
  }

  const root = path.join(suite, 'cases');

  await _ordinaryDirectory(root);
  const cases: CaseDefinition[] = [];

  for (const entry of (await fs.readdir(root, { withFileTypes: true })).sort(
    (a, b) => (a.name < b.name ? -1 : 1),
  )) {
    if (!identifier.test(entry.name) || !entry.isDirectory()) {
      throw new Error(
        `Expected safe case directory: ${path.join(root, entry.name)}`,
      );
    }

    const directory = path.join(root, entry.name);
    const fixtures = path.join(directory, 'fixtures');

    await _ordinaryDirectory(fixtures);

    // Inspect even empty directories, and never traverse a symlink or accept .git.
    const inspect = async (relative = '') => {
      for (const item of await fs.readdir(path.join(fixtures, relative), {
        withFileTypes: true,
      })) {
        const name = relative ? `${relative}/${item.name}` : item.name;
        const installed = `${skillDir}/${skill}`;

        if (
          item.name === '.git' ||
          item.name.includes('\\') ||
          item.name.includes('\n') ||
          item.name.includes('\r') ||
          name === installed ||
          (!item.isDirectory() && installed.startsWith(`${name}/`))
        ) {
          throw new Error(
            `Unsafe fixture path or installed-skill collision: ${path.join(fixtures, name)}`,
          );
        }

        if (item.isDirectory()) {
          await inspect(name);
        } else if (!item.isFile()) {
          throw new Error(
            `Non-regular fixture file: ${path.join(fixtures, name)}`,
          );
        }
      }
    };

    await inspect();
    const fixtureFiles = (await files(fixtures)).filter(
      (file) => path.posix.basename(file) !== '.gitkeep',
    );
    const prompt = await _optionalText(path.join(directory, 'prompt.md'));
    const expectedMarkdown = await _optionalText(
      path.join(directory, 'expected.md'),
    );

    if (prompt === null || expectedMarkdown === null) {
      throw new Error(`Case ${entry.name} requires prompt.md and expected.md`);
    }

    const requirements = _parseChecklist(
      expectedMarkdown,
      path.join(directory, 'expected.md'),
    );

    cases.push({
      id: entry.name,
      fixtures,
      fixtureFiles,
      prompt,
      expectedMarkdown,
      requirements,
      inputHash: sha(JSON.stringify(await snapshot(directory))),
    });
  }

  if (!cases.length) {
    throw new Error(`No cases in ${root}`);
  }

  return cases;
}

/**
 * Scaffolds a new case with placeholder prompt, checklist and fixtures.
 * @param suite Path to an existing suite directory; `cases/` is created if absent.
 * @param caseId Case directory name; must be a safe identifier.
 * @returns The path of the new case directory.
 * @throws When the ID is unsafe, the suite is missing or the case exists. A
 * partially scaffolded case is removed on failure.
 */
export async function createCase(suite: string, caseId: string) {
  if (!identifier.test(caseId)) {
    throw new Error(`Unsafe case name: ${caseId}`);
  }

  await _ordinaryDirectory(suite);

  const cases = path.join(suite, 'cases');
  const target = path.join(cases, caseId);

  await fs.mkdir(cases, { recursive: true });

  try {
    await fs.mkdir(target);
  } catch (error: any) {
    if (error.code === 'EEXIST') {
      throw new Error(`Case already exists: ${target}`, { cause: error });
    }

    throw error;
  }

  // The target is ours from here on, so remove it if scaffolding fails.
  try {
    await fs.mkdir(path.join(target, 'fixtures'));
    await fs.writeFile(path.join(target, 'fixtures', '.gitkeep'), '');
    await fs.writeFile(
      path.join(target, 'prompt.md'),
      "Describe the user's task here.\n",
    );
    await fs.writeFile(
      path.join(target, 'expected.md'),
      '- [requirement_id] Describe what the judge should verify.\n',
    );
  } catch (error) {
    await fs.rm(target, { recursive: true, force: true });
    throw error;
  }

  return target;
}

const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

// Parses `- [id] text` items with indented continuation lines. Errors cite
// `source` and the line number.
function _parseChecklist(markdown: string, source: string): Requirement[] {
  const requirements: Requirement[] = [];
  const seen = new Set();

  const fail = (line: number, message: string): never => {
    throw new Error(`${source}:${line}: ${message}`);
  };

  let current: Requirement | undefined;

  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    if (!line.trim()) {
      continue;
    }

    const match = line.match(
      /^- \[([a-zA-Z0-9][a-zA-Z0-9_-]*)\](?:[ \t]+(.*))?$/,
    );

    if (match) {
      const [, id, text = ''] = match;

      if (seen.has(id)) {
        fail(index + 1, `Duplicate requirement ID: ${id}`);
      }

      if (!nonempty(text)) {
        fail(index + 1, `Empty requirement: ${id}`);
      }

      seen.add(id);
      current = { id, text: text.trim() };
      requirements.push(current);
    } else if (/^(?: {2,}|\t)\S/.test(line) || /^(?: {2,}|\t).+/.test(line)) {
      if (!current) {
        fail(index + 1, 'Continuation without a requirement');
      }

      current!.text += '\n' + line.trim();
    } else {
      fail(index + 1, 'Expected - [id] text or an indented continuation');
    }
  }

  // Callers pass non-blank text, so every line either adds a requirement or fails.
  return requirements;
}

// Throws unless `file` is an existing directory (not a symlink).
async function _ordinaryDirectory(file: string) {
  let stat;

  try {
    stat = await fs.lstat(file);
  } catch {
    throw new Error(`Missing directory: ${file}`);
  }

  if (!stat.isDirectory()) {
    throw new Error(`Expected ordinary directory: ${file}`);
  }
}

// Reads a non-empty regular file; null when it does not exist.
async function _optionalText(file: string) {
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
    throw new Error(`Expected ordinary file: ${file}`);
  }

  const text = await fs.readFile(file, 'utf8');

  if (!nonempty(text)) {
    throw new Error(`Empty file: ${file}`);
  }

  return text;
}
