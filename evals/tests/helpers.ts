import type { TestContext } from 'vitest';
import type { CaseDefinition, Requirement } from '../lib/cases.ts';
import type { JudgeVerdict } from '../lib/judging.ts';
import type { InvocationMode } from '../lib/agents.ts';
import type { ExecutionOptions, Transport } from '../lib/execution.ts';
import type { RunOptions } from '../run.ts';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJSON, writeJSON, type JsonRecord } from '../lib/utils.ts';

/** The judge's reply, as defined by quality.schema.json. */
type JudgeReply = { findings: JudgeVerdict[] };

export interface TransportCall {
  workspace: string;
  directory: string;
  prompt: string;
  mode: InvocationMode;
  bundle: JsonRecord;
  stage: string;
}

export interface FakeConfig {
  onCall?: (
    call: TransportCall & { options: ExecutionOptions; runtime: string },
  ) => void | Promise<void>;
  [key: string]: any;
}

export const EVALS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

export async function temporary(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eval-unit-'));

  t.onTestFinished(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

export async function put(
  root: string,
  file: string,
  value: string | Buffer = '',
) {
  const target = path.join(root, file);

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, value);
  return target;
}

/**
 * Declares one judge control, "prepared", that expects every criterion of the
 * case to pass for a final message of "Done" and no generated files.
 * @param suite Path to the suite directory to write judge-controls/ into.
 */
export async function putControl(suite: string, caseId: string) {
  await put(
    suite,
    'judge-controls/controls.yml',
    `version: 1\ncontrols:\n  prepared:\n    case: ${caseId}\n    default: pass\n`,
  );
  await put(suite, 'judge-controls/fixtures/prepared/final-message.md', 'Done');
}

export const requirements: Requirement[] = [
  { id: 'accurate', text: 'Accurate document.' },
];

export function finding(
  req: Requirement[] = requirements,
  status = 'pass',
  extra = {},
): JudgeReply {
  return {
    findings: req.map((r) => ({
      id: r.id,
      status: status as JudgeVerdict['status'],
      evidence: ['document.md: output'],
    })),
    ...extra,
  };
}

export async function fixture(
  t: TestContext,
): Promise<{ root: string; options: RunOptions; item: CaseDefinition }> {
  const root = await temporary(t);
  const fixtures = path.join(root, 'fixtures');

  await put(fixtures, 'document.md', 'Old');
  await put(root, 'skill/SKILL.md', '# Synthetic');
  return {
    root,
    options: {
      model: 'fake',
      judgeModel: 'fake',
      reasoning: 'high',
      judgeReasoning: 'high',
      skillName: 'synthetic',
      skill: path.join(root, 'skill'),
      grading: path.join(EVALS, 'grading'),
    },
    item: {
      id: 'basic',
      fixtures,
      fixtureFiles: ['document.md'],
      inputHash: 'fixture-hash',
      prompt: 'Improve document.',
      requirements,
    },
  };
}

export function fakeTransport(
  config: FakeConfig = {},
  calls: TransportCall[] = [],
): Transport {
  return async (
    options,
    runtime,
    workspace,
    directory,
    prompt,
    mode: InvocationMode = {},
  ) => {
    const bundle = mode.judge
      ? await readJSON(path.join(workspace, 'bundle.json'))
      : {};
    const stage = bundle?.stage ?? (mode.judge ? 'final' : 'agent');

    calls.push({ workspace, directory, prompt, mode, bundle, stage });
    await fs.mkdir(directory, { recursive: true });
    await config.onCall?.({
      options,
      runtime,
      workspace,
      directory,
      prompt,
      mode,
      bundle,
      stage,
    });

    if (config.throwAt === stage) {
      throw Object.assign(new Error('transport broke'), {
        stack: config.noStack ? undefined : 'transport stack',
      });
    }

    let response;

    if (mode.judge) {
      response =
        config.rawJudge ??
        JSON.stringify(finding(bundle.requirements, config.quality ?? 'pass'));

      if (config.mutateJudge) {
        await put(workspace, 'rubric.md', 'Changed');
      }
    } else {
      if (!config.noEdit) {
        await put(workspace, 'document.md', 'Edited');
      }

      if (config.deleteEvidence) {
        await fs.rm(path.join(workspace, 'document.md'), { force: true });
      }

      response = config.noResponse ? '' : 'Document updated.';
    }

    const result = {
      status:
        config.failAt === stage ? (config.failure ?? 'execution_error') : 'ok',
      session_id: 'exact-session',
      final_response: response,
    };

    await put(directory, 'final.txt', response);
    await put(directory, 'stderr.txt');
    await put(
      directory,
      'trace.jsonl',
      JSON.stringify({ type: 'turn.completed' }),
    );
    await writeJSON(path.join(directory, 'execution.json'), result);
    return result;
  };
}

export async function fakeCodex(root: string, body = '') {
  const bin = path.join(root, 'bin');
  const file = await put(
    bin,
    'codex',
    `#!${process.execPath}\n${
      body ||
      `
import fs from 'node:fs';
import path from 'node:path';
if (process.argv.includes('--version')) { console.log('fake-codex'); process.exit(0); }
const args = process.argv.slice(2);
if (process.env.FAKE_CODEX_ARGS) fs.writeFileSync(process.env.FAKE_CODEX_ARGS, JSON.stringify(args));
const home = process.env.CODEX_HOME;
const session = 'fake-session';
const mode = process.env.FAKE_CONTEXT || 'full';
if (mode !== 'missing') {
 fs.mkdirSync(path.join(home, 'sessions'), {recursive:true});
 fs.writeFileSync(path.join(home, 'sessions', (mode === 'unmatched' ? 'other' : session) + '.jsonl'),
 mode === 'malformed' ? 'invalid' : JSON.stringify({type: mode === 'none' ? 'other' : 'turn_context', payload: mode === 'empty' ? {} : {model:'observed',effort:'high',sandbox_policy:'workspace-write',approval_policy:'never'}}));
}
fs.writeFileSync(args[args.indexOf('-o')+1], 'Saved response');
console.log(JSON.stringify({type:'thread.started',thread_id:session}));
console.log(JSON.stringify({type:'turn.completed'}));
`
    }`,
  );

  // Extensionless executable is CommonJS, so use a .ts launcher target.
  await fs.rename(file, file + '.mjs');
  await put(
    bin,
    'codex',
    `#!/bin/sh\nexec '${process.execPath}' '${file}.mjs' "$@"\n`,
  );
  await fs.chmod(file, 0o755);
  return bin;
}

export async function fakeClaude(root: string) {
  const bin = path.join(root, 'bin');
  const file = await put(
    bin,
    'claude',
    `#!${process.execPath}
import fs from 'node:fs';
if (process.argv.includes('--version')) { console.log('fake-claude'); process.exit(0); }
const args = process.argv.slice(2);
const schema = args.includes('--json-schema');
console.log(JSON.stringify({type:'system',subtype:'init',session_id:'fake-session',model:'observed',permissionMode:'bypassPermissions'}));
console.log(JSON.stringify({type:'assistant',message:{content:[{type:'text',text:'Working'}]}}));
console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,session_id:'fake-session',usage:{input_tokens:1},result:'Saved response',...(schema ? {structured_output:{findings:[]}} : {})}));
fs.writeFileSync(process.env.FAKE_CLAUDE_ARGS || '/dev/null', JSON.stringify({args, env: process.env.CLAUDE_CONFIG_DIR ?? null}));
`,
  );

  // Extensionless executable is CommonJS, so use a .mjs launcher target.
  await fs.rename(file, file + '.mjs');
  await put(
    bin,
    'claude',
    `#!/bin/sh\nexec '${process.execPath}' '${file}.mjs' "$@"\n`,
  );
  await fs.chmod(file, 0o755);
  return bin;
}
