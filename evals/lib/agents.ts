import type {
  AgentName,
  Execution,
  InvocationMode,
  JsonRecord,
  RunOptions,
} from './types.ts';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { files } from './utils.ts';

export const AGENT_NAMES: AgentName[] = ['codex', 'claude'];

export const DEFAULT_AGENT: AgentName = 'codex';

export interface Trace {
  session_id: string | null;
  completed: boolean;
  usage: unknown[];
  usage_note: string;
  errors: JsonRecord[];
  failed: boolean;
  messages: string[];
  parse_errors: string[];
  /** Final answer when the CLI reports it in the trace itself. */
  final?: string | null;
  /** Settings the CLI reports in the trace itself. */
  init?: JsonRecord | null;
}

type Models = Pick<
  RunOptions,
  'model' | 'judgeModel' | 'reasoning' | 'judgeReasoning'
>;

export interface Agent {
  name: AgentName;
  binary: string;
  /** Workspace-relative directory the CLI discovers skills in. */
  skillDir: string;
  skillPrompt(skill: string, prompt: string): string;
  validateReasoning(level: string): void;
  /** Throws when the CLI is unavailable; returns its version string. */
  version(): string;
  /** Prepares the temporary runtime home (authentication, isolation). */
  prepareRuntime(runtime: string): Promise<void>;
  /** Static settings recorded in results.json. */
  settings(): JsonRecord;
  args(
    options: Models,
    runtime: string,
    directory: string,
    mode: InvocationMode,
  ): Promise<{ args: string[]; env: NodeJS.ProcessEnv }>;
  parseTrace(raw: string): Trace;
  observedSettings(
    runtime: string,
    execution: Execution,
  ): Promise<JsonRecord | null>;
  settingsNote(observed: JsonRecord | null): string;
}

function splitLines(raw: string) {
  const events: JsonRecord[] = [];
  const parseErrors: string[] = [];

  for (const line of raw.split('\n').filter((line) => line.trim())) {
    try {
      events.push(JSON.parse(line));
    } catch {
      parseErrors.push(line);
    }
  }

  return { events, parseErrors };
}

function cliVersion(label: string, binary: string) {
  const version = spawnSync(binary, ['--version'], { encoding: 'utf8' });

  if (version.status !== 0) {
    throw new Error(
      `${label} CLI unavailable: ${version.error || version.stderr}`,
    );
  }

  return version.stdout.trim();
}

export function parseCodexTrace(raw: string): Trace {
  const { events, parseErrors } = splitLines(raw);

  return {
    session_id:
      events.find((event) => event.type === 'thread.started')?.thread_id ??
      null,
    completed: events.some((event) => event.type === 'turn.completed'),
    usage: events
      .filter((event) => event.type === 'turn.completed')
      .map((event) => event.usage ?? null),
    usage_note:
      'Raw CLI usage; resumed sessions may report cumulative thread totals. Do not sum across turns.',
    errors: events.filter((event) =>
      ['error', 'turn.failed'].includes(event.type),
    ),
    failed: events.some((event) => event.type === 'turn.failed'),
    messages: events
      .filter(
        (event) =>
          event.type === 'item.completed' &&
          event.item?.type === 'agent_message',
      )
      .map((event) => event.item.text),
    parse_errors: parseErrors,
  };
}

// Claude `--output-format stream-json --verbose`: a system/init event, assistant
// messages, and one final result event carrying the answer and usage.
export function parseClaudeTrace(raw: string): Trace {
  const { events, parseErrors } = splitLines(raw);
  const init = events.find(
    (event) => event.type === 'system' && event.subtype === 'init',
  );
  const results = events.filter((event) => event.type === 'result');
  const result = results.at(-1);
  let final: string | null = null;

  if (result) {
    final =
      result.structured_output !== undefined &&
      result.structured_output !== null
        ? JSON.stringify(result.structured_output)
        : typeof result.result === 'string'
          ? result.result
          : null;
  }

  return {
    session_id: result?.session_id ?? init?.session_id ?? null,
    completed: Boolean(result),
    usage: results.map((event) => event.usage ?? null),
    usage_note: 'Raw CLI usage from the final result event.',
    errors: results.filter((event) => event.is_error),
    failed: results.some((event) => event.is_error),
    messages: events
      .filter((event) => event.type === 'assistant')
      .map((event) =>
        (event.message?.content ?? [])
          .filter((block: JsonRecord) => block.type === 'text')
          .map((block: JsonRecord) => block.text)
          .join('\n'),
      )
      .filter((text: string) => text),
    parse_errors: parseErrors,
    final,
    init: init
      ? {
          model: init.model ?? null,
          permissionMode: init.permissionMode ?? null,
        }
      : null,
  };
}

const codex: Agent = {
  name: 'codex',
  binary: 'codex',
  skillDir: '.agents/skills',
  skillPrompt: (skill, prompt) =>
    `$${skill}\nUse the selected local .agents/skills/${skill}/SKILL.md skill explicitly.\n\n${prompt}`,
  validateReasoning() {},
  version: () => cliVersion('Codex', 'codex'),
  async prepareRuntime(runtime) {
    const auth = path.join(
      process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
      'auth.json',
    );

    try {
      await fs.access(auth);
      await fs.symlink(auth, path.join(runtime, 'auth.json'));
    } catch {
      /* inherited provider environment may authenticate instead */
    }
  },
  settings: () => ({
    agent_sandbox: 'workspace-write',
    judge_sandbox: 'read-only',
    approval_policy: 'never',
    user_config: 'ignored',
    runtime_home: 'temporary, with existing file authentication linked',
  }),
  async args(options, runtime, directory, { judge = false, schema = null }) {
    const args = [
      'exec',
      '--json',
      '--ignore-user-config',
      '--ignore-rules',
      '--model',
      judge ? options.judgeModel : options.model,
      '-c',
      `model_reasoning_effort=${JSON.stringify(judge ? options.judgeReasoning : options.reasoning)}`,
      '-c',
      `sandbox_mode=${JSON.stringify(judge ? 'read-only' : 'workspace-write')}`,
      '-c',
      'approval_policy="never"',
      '-o',
      path.join(directory, 'final.txt'),
    ];

    if (schema) {
      args.push('--output-schema', schema);
    }

    args.push('-');
    return { args, env: { ...process.env, CODEX_HOME: runtime } };
  },
  parseTrace: parseCodexTrace,
  async observedSettings(runtime, execution) {
    try {
      const sessions = path.join(runtime, 'sessions');
      const sessionFile = (await files(sessions)).find(
        (file) =>
          file.endsWith('.jsonl') &&
          execution.session_id &&
          file.includes(String(execution.session_id)),
      );

      if (!sessionFile) {
        return null;
      }

      const context = (
        await fs.readFile(path.join(sessions, sessionFile), 'utf8')
      )
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
        .filter((event) => event.type === 'turn_context')
        .at(-1)?.payload;

      return context
        ? {
            model: context.model ?? null,
            reasoning: context.effort ?? null,
            sandbox: context.sandbox_policy ?? null,
            approval_policy: context.approval_policy ?? null,
          }
        : null;
    } catch {
      /* Session-context availability varies by CLI; preserve the requested settings in results.settings regardless. */
      return null;
    }
  },
  settingsNote: (observed) =>
    observed
      ? 'Observed in the persisted CLI turn_context.'
      : 'CLI did not expose a readable turn_context; results.settings records the requested settings.',
};

const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

// A credential in the environment lets the harness run with a temporary config
// directory. Without one, the user's own login (e.g. the macOS Keychain) is the
// only way to authenticate, so the config directory has to be inherited.
const claudeCredential = () =>
  Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY);

const claude: Agent = {
  name: 'claude',
  binary: 'claude',
  skillDir: '.claude/skills',
  skillPrompt: (skill, prompt) => `/${skill}\n\n${prompt}`,
  validateReasoning(level) {
    if (!CLAUDE_EFFORTS.includes(level)) {
      throw new Error(
        `Invalid --reasoning for claude: ${level}; use ${CLAUDE_EFFORTS.join(', ')}`,
      );
    }
  },
  version: () => cliVersion('Claude', 'claude'),
  async prepareRuntime() {
    if (!claudeCredential()) {
      console.warn(
        'Warning: no CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY set; using your existing Claude login with its user config inherited. Run `claude setup-token` for an isolated, reproducible run.',
      );
    }
  },
  settings: () => ({
    agent_sandbox:
      'none (temporary workspace, permissions bypassed; tools not OS-sandboxed)',
    judge_sandbox: 'tool allowlist (Read, Grep, Glob)',
    approval_policy: 'bypassPermissions',
    user_config: claudeCredential()
      ? 'ignored (project setting source only)'
      : 'inherited config directory (project setting source only)',
    runtime_home: claudeCredential()
      ? 'temporary CLAUDE_CONFIG_DIR, authenticated from environment'
      : 'real config directory',
  }),
  async args(options, runtime, _directory, { judge = false, schema = null }) {
    const args = [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--no-session-persistence',
      // Project source only: the temporary workspace's .claude/skills must
      // stay discoverable, while user settings are excluded.
      '--setting-sources',
      'project',
      '--model',
      judge ? options.judgeModel : options.model,
      '--effort',
      judge ? options.judgeReasoning : options.reasoning,
      '--permission-mode',
      'bypassPermissions',
    ];

    if (judge) {
      args.push('--tools', 'Read,Grep,Glob');
    }

    if (schema) {
      args.push('--json-schema', (await fs.readFile(schema, 'utf8')).trim());
    }

    return {
      args,
      env: claudeCredential()
        ? { ...process.env, CLAUDE_CONFIG_DIR: runtime }
        : { ...process.env },
    };
  },
  parseTrace: parseClaudeTrace,
  async observedSettings(_runtime, execution) {
    const init = execution.init as JsonRecord | null | undefined;

    return init
      ? {
          model: init.model ?? null,
          reasoning: null,
          sandbox: null,
          approval_policy: init.permissionMode ?? null,
        }
      : null;
  },
  settingsNote: (observed) =>
    observed
      ? 'Model and permission mode observed in the stream-json init event; reasoning effort is not reported by the CLI.'
      : 'CLI did not emit an init event; results.settings records the requested settings.',
};

const AGENTS: Record<AgentName, Agent> = { codex, claude };

export function getAgent(name: AgentName = DEFAULT_AGENT): Agent {
  const agent = AGENTS[name];

  if (!agent) {
    throw new Error(`Unknown agent: ${name}; use ${AGENT_NAMES.join(', ')}`);
  }

  return agent;
}
