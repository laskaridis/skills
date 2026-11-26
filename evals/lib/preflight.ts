import type { RunOptions, RunResults } from './types.ts';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { loadCases } from './cases.ts';
import { loadJudgeControls, loadDeterministicChecksFor } from './loader.ts';
import { readJSON } from './utils.ts';
import { normalizeResults } from './reporting.ts';
import { getAgent } from './agents.ts';

export interface Preflight {
  definedCases: Awaited<ReturnType<typeof loadCases>>;
  previous: RunResults | null;
  cliVersion: string;
}

// Reads and validates a previous results file; null when none is given.
async function loadBaseline(file: string | undefined) {
  if (!file) {
    return null;
  }

  const previous = await readJSON<RunResults>(file);

  normalizeResults(previous);

  return previous;
}

// copyTree performs the remaining nonregular-file validation, before execution.
async function validateSkillDir(skill: string) {
  const stat = await fs.lstat(skill);

  if (
    !stat.isDirectory() ||
    !(await fs.lstat(path.join(skill, 'SKILL.md'))).isFile()
  ) {
    throw new Error('Skill requires an ordinary directory and SKILL.md');
  }
}

// Resolves every case, hook, baseline, control, and tool before any model call.
export async function preflight(
  options: RunOptions,
  suite: string,
): Promise<Preflight> {
  const agent = getAgent(options.agent);

  agent.validateReasoning(options.reasoning);
  agent.validateReasoning(options.judgeReasoning);

  const definedCases = await loadCases(
    suite,
    options.skillName,
    agent.skillDir,
  );

  if (options.case && !definedCases.some((c) => c.id === options.case)) {
    throw new Error(`Unknown case ID: ${options.case}`);
  }

  if (!options.noChecks) {
    await loadDeterministicChecksFor(suite);
  }

  if (options.calibrate) {
    await loadJudgeControls(suite, definedCases);
  }

  const previous = await loadBaseline(options.compare);

  if (!options.noSkill) {
    await validateSkillDir(options.skill);
  }

  return { definedCases, previous, cliVersion: agent.version() };
}
