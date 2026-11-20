/** JSON from agent CLI traces and historical results is validated at runtime. */
export type JsonRecord = Record<string, any>;

export type AgentName = 'codex' | 'claude';

export type Snapshot = Record<string, string>;

export type QualityStatus = 'pass' | 'fail' | 'ungradable';

export interface Requirement {
  id: string;
  text: string;
}

export interface Finding {
  id: string;
  text?: string | null;
  status: QualityStatus;
  evidence: string[];
}

export interface JudgeFinding {
  findings: Finding[];
}

export interface CaseDefinition {
  id: string;
  fixtures: string;
  fixtureFiles: string[];
  prompt: string;
  requirements: Requirement[];
  expectedMarkdown?: string;
  inputHash: string;
}

export interface Execution {
  status: string;
  session_id?: string | null;
  final_response: string;
  observed_settings?: JsonRecord | null;
  settings_note?: string;
  exit_code?: number | null;
  signal?: NodeJS.Signals | null;
  spawn_error?: string | null;
  duration_ms?: number;
  [key: string]: unknown;
}

export interface CheckResult {
  status: string;
  failures: string[];
}

export interface CheckContext {
  caseId: string;
  workspace: string;
  initialSnapshot: Snapshot;
  finalResponse: string;
}

export type CheckCase = (
  context: CheckContext,
) => CheckResult | Promise<CheckResult>;

export interface InvocationMode {
  judge?: boolean;
  schema?: string | null;
}

export type Transport = (
  options: RunOptions,
  runtime: string,
  cwd: string,
  directory: string,
  prompt: string,
  mode?: InvocationMode,
) => Promise<Execution>;

export interface RunOptions {
  agent?: AgentName;
  skillName: string;
  skill: string;
  model: string;
  judgeModel: string;
  reasoning: string;
  judgeReasoning: string;
  grading: string;
  calibrate?: boolean;
  help?: boolean;
  compare?: string;
  case?: string;
  timeout?: number;
  transport?: Transport;
  checkCase?: CheckCase;
}

export interface JudgeResult {
  status: string;
  execution?: Execution;
  finding?: JudgeFinding;
  error?: string;
}

export interface CaseResult {
  case: string;
  input_hash?: string;
  execution: { status: string; calls: Execution[]; error?: string };
  checks: CheckResult;
  judge: JudgeResult;
  requirements: Finding[];
  harness_error?: string;
}

export interface Control {
  id: string;
  caseId: string;
  generatedFiles: Record<string, string>;
  finalResponse: string;
  expected: Record<string, QualityStatus>;
}

export interface CalibrationResult {
  status: string;
  reason?: string;
  controls?: {
    id: string;
    case: string;
    expected: Control['expected'];
    judge: JudgeResult;
    status: string;
  }[];
}

export interface ComparisonChange {
  skill: string;
  case: string;
  channel: string;
  requirement?: string;
  before: unknown;
  after: unknown;
  direction: string;
}

export interface RequirementChange {
  skill: string;
  case: string;
  id: string;
}

export interface Comparison {
  limitations: string[];
  changes: ComparisonChange[];
  added_cases: string[];
  removed_cases: string[];
  excluded_cases: string[];
  added_requirements: RequirementChange[];
  removed_requirements: RequirementChange[];
}

export interface RunResults {
  format_version: number;
  skill: string;
  cases: CaseResult[];
  run_id?: string;
  selection?: { case: string | null };
  settings: JsonRecord;
  skill_hash?: string;
  inputs_hash?: string;
  harness_git?: { commit: string | null; dirty: boolean | null };
  observed_settings?: JsonRecord;
  calibration?: CalibrationResult;
  comparison?: Comparison;
}
