# Evals architecture

The harness runs a skill against fixture cases with an agent CLI (Codex by default,
or Claude via `--agent`), then grades
the outcome with a separate judge invocation of the same CLI. Agent-specific
behaviour (arguments, skill directory and prompt, trace parsing, runtime
isolation) lives in `lib/agents.ts`. It produces a self-contained
artifact directory per run. There is no aggregate score or release gate; one
run per case is exploratory.

## Design principles

- **Generic harness, skill-specific suites.** `run.ts` and `lib/` know nothing
  about any skill. Suites supply cases, optional deterministic checks and
  optional judge controls.
- **Validate before spending.** Everything that can be checked without a model
  is checked first (preflight), so a typo fails in seconds, not after minutes of model calls.
- **Traceable runs.** Skill, cases, grading inputs, suite hooks, and harness
  code all run from the live checkout; nothing is snapshotted. `results.json`
  records `skill_hash`, `inputs_hash` (grading, cases, suite files), and the
  harness Git state, so comparability can be judged, but a run cannot be
  replayed from its artifacts and is not isolated from mid-run edits.
- **Provider-specific isolation.** Agent and judge use separate workspaces.
  Codex uses a temporary `CODEX_HOME`, workspace-write agent sandbox, and
  read-only judge sandbox. Claude uses a temporary config directory only when
  environment credentials are present; its judge has a restricted tool allowlist,
  not an OS-level read-only sandbox.
- **Separate between quality and infrastructure failures.** Requirement failures are results.
  Execution, judge or validator errors are infrastructure failures (exit 2).
- **Evidence over inline prompts.** The judge reads files (rubric, schema,
  bundle) rather than a long prompt.

## Components

```
evals/
  run.ts                 Evaluation harness entry point
  lib/                   Evaluation harness implementation modules
  grading/               Shared judge rubric.md and quality.schema.json
  skills/<skill>/        An evaluation suite for a specific skill (see "Suite folder")
  tests/                 Evaluation harness tests
```

## Execution flow

```
CLI args
  │
  ▼
 [1] Preflight          see preflight.ts
  │
  ▼
 [2] Hash inputs        load cases from the live suite · skill/inputs hashes · provider-specific runtime
  ▼
 [3] For each case (sequential)
  │
  │   workspace = temp dir
  │     ├─ .agents/skills/<name>/   (copy of the skill; .claude/skills/ for claude)
  │     └─ fixtures/*                (git init, snapshot)
  │
  │   Agent            prompt = "$skill …" + prompt.md          (workspace-write)
  │        ▼
  │   Deterministic checks (optional)
  │        ▼
  │   Quality judge (optional) temp workspace: bundle.json + rubric.md + schema.json (provider-specific restrictions)
  │        ▼
  │   result.json, workspace archive, delete temp workspace
  │
  ▼
 [4] Calibration        --calibrate: judge controls
  ▼
 [5] Persist            results.json · report.md · baseline comparison (--compare)
                       exit 2 if infrastructureFailure()
```

With `--no-skill` the skill is neither copied nor invoked: the workspace holds
only fixtures and the prompt is `prompt.md` alone (`skill_mode: none`).
With `--no-checks` the suite's `checkCase` is not invoked: each case's checks
are `skipped` and the judge receives that status (`checks_mode: skipped`).

`results.json` and `report.md` are rewritten after every case, so an
interrupted run still leaves partial results. Suite checks and calibration
controls run from the live checkout; the run folder holds no copy of them.

## Evaluation suite folder: `evals/skills/<skill>/`

A suite is named after the skill it evaluates (example `evals/skills/plan/` for `skills/plan/`). The harness discovers everything by convention. Every evaluation suite needs at least one case defined as `cases/<id>/` and the following files included for each case: `prompt.md`, `expected.md` and `fixtures/`.

```
evals/skills/<skill>/
  README.md              Optional: Human guide to the suite.
  cases/<id>/            Required: At least one case.
    prompt.md            Required: The user request sent to the skill.
    expected.md          Required: Requirements the quality judge grades.
    fixtures/            Required: Files the agent starts with, copied into a temp git repo.
  checks.ts              Optional: Deterministic checks
  judge-tests.ts         Optional: Checks for the asserting judge effectiveness (enabled using "--calibrate").
  run.ts                 Optional: wrapper for `pnpm eval:<skill>`.
  artifacts/<runId>/     Evaluation outputs.
```

| Artifact             | Purpose and conventions                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cases/<id>/`        | One scenario; `<id>` is the name passed to `--case`. Safe names only. No `.git`, symlinks or non-regular files.                                                                                                                                                                                                                          |
| `prompt.md`          | The user request. The harness prepends the explicit `$<skill>` invocation. Write it as a real request; do not mention the checklist.                                                                                                                                                                                                     |
| `expected.md`        | Requirements the quality judge grades: one `- [id] text` each, indented lines continue it. IDs are stable and unique, since results and `--compare` key on them.                                                                                                                                                                         |
| `fixtures/`          | Starting workspace, copied as-is and committed in a temp git repo. Mirror the layout the skill expects (e.g. `specs/…`). Fixture edits are allowed unless a suite-specific validator rejects them. Use `.gitkeep` for an empty fixtures directory.                                                                                       |
| `checks.ts`          | Optional deterministic checks (output files, schema, protected inputs). Export `checkCase`, which receives `{caseId, workspace, initialSnapshot, finalResponse}` and returns `{status: pass \| fail, failures[]}`. The result goes to the judge as evidence. `skills/plan/checks.ts` holds the plan structure and protected-input rules. |
| `judge-tests.ts`     | Optional known good and bad controls for `--calibrate`. Export `controls`; include flawed outputs that look plausible.                                                                                                                                                                                                                   |
| `grading/`           | Suite-specific rubric (`*.md`) and schema (`*.schema.json`) pair. The harness reads only the shared `evals/grading/` files, so these are not loaded today.                                                                                                                                                                               |
| `run.ts`             | Thin wrapper calling the shared `main(['<skill>', …])` for `pnpm eval:<skill>`. Skill logic belongs in `checks.ts`.                                                                                                                                                                                                                      |
| `artifacts/<runId>/` | Output of one run; see [Artifacts](#artifacts). Never edit or commit.                                                                                                                                                                                                                                                                    |

## Evaluation artifacts

Everything is under `evals/skills/<skill>/artifacts/<runId>/`.

```
results.json  report.md
<case>/
  result.json
  workspace*
  agent/         prompt.txt trace.jsonl stderr.txt final.txt execution.json
  judge-quality/   bundle.json + run files
calibration/<control>/
```

`results.json` records `skill_hash`, `inputs_hash`, the requested
settings and the settings observed by the CLI. `--compare` uses these to report
which differences limit the comparison.

### Case statuses

Each `CaseResult` has independent channels:

| Channel          | Values                                                            |
| ---------------- | ----------------------------------------------------------------- |
| `execution`      | `ok`, `timeout`, `execution_error`, `not_run`                     |
| `checks`         | `pass`, `fail`, `error`, `not_run`, `skipped`                     |
| `judge`          | `ok`, `invalid_response`, `timeout`, `execution_error`, `not_run` |
| `requirements[]` | `pass`, `fail`, `ungradable` (with evidence)                      |

If the agent or judge fails, requirements are marked `ungradable`, not `fail`,
so a judge failure is never counted as a quality failure.
