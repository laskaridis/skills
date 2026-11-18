import type { CaseDefinition, Requirement } from './types.ts';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { files, nonempty, sha, snapshot, writeJSON } from './utils.ts';

const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function parseChecklist(
  markdown: string,
  source = 'expected.md',
): Requirement[] {
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

  if (!requirements.length) {
    fail(1, 'Checklist must contain at least one requirement');
  }

  return requirements;
}

async function ordinaryDirectory(file: string) {
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

async function optionalText(file: string) {
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

export async function loadCases(
  suite: string,
  skill: string,
  skillDir = '.agents/skills',
): Promise<CaseDefinition[]> {
  if (!identifier.test(skill)) {
    throw new Error(`Unsafe skill name: ${skill}`);
  }

  const root = path.join(suite, 'cases');

  await ordinaryDirectory(root);
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
    const input = path.join(directory, 'input');

    await ordinaryDirectory(input);

    // Inspect even empty directories, and never traverse a symlink or accept .git.
    const inspect = async (relative = '') => {
      for (const item of await fs.readdir(path.join(input, relative), {
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
            `Unsafe fixture path or installed-skill collision: ${path.join(input, name)}`,
          );
        }

        if (item.isDirectory()) {
          await inspect(name);
        } else if (!item.isFile()) {
          throw new Error(
            `Non-regular fixture file: ${path.join(input, name)}`,
          );
        }
      }
    };

    await inspect();
    const fixtureFiles = (await files(input)).filter(
      (file) => path.posix.basename(file) !== '.gitkeep',
    );
    const prompt = await optionalText(path.join(directory, 'prompt.md'));
    const expectedMarkdown = await optionalText(
      path.join(directory, 'expected.md'),
    );

    if (prompt === null || expectedMarkdown === null) {
      throw new Error(`Case ${entry.name} requires prompt.md and expected.md`);
    }

    const requirements = parseChecklist(
      expectedMarkdown,
      path.join(directory, 'expected.md'),
    );

    cases.push({
      id: entry.name,
      input,
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

export async function archiveChecklists(
  cases: CaseDefinition[],
  suite: string,
) {
  for (const item of cases) {
    await writeJSON(
      path.join(suite, 'cases', item.id, 'expected.parsed.json'),
      item.requirements,
    );
  }
}
