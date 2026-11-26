# Skill evaluation harness

Evaluate a skill on repeatable example tasks, inspect what the agent produced,
and judge the result against written expectations. The harness explicitly
invokes the selected skill, so it measures how the skill performs when used, not
whether an agent discovers it.

## Prerequisites

- Node.js 22.21+
- pnpm 9.15.1
- An authenticated codex or claude agent CLI on `PATH`

**Codex authentication:** the harness ignores personal CLI config and execpolicy
rules and uses a temporary `CODEX_HOME`. File credentials from `$CODEX_HOME/auth.json`
(or `~/.codex/auth.json`) are linked into it; inherited provider environment also
works. Keychain-only credentials may not be available. Credentials are never
archived.

**Claude authentication**: run `claude setup-token` once and export
the resulting token as `CLAUDE_CODE_OAUTH_TOKEN` (or set `ANTHROPIC_API_KEY`).
With a credential in the environment the harness uses a temporary
`CLAUDE_CONFIG_DIR` and loads only the project setting source, so your user
config does not leak into runs. Without one it warns and falls back to your
existing login and real config directory (macOS Keychain logins work), recorded
as `inherited` in `results.json`.

## Run your first evaluation

```sh
cd evals
pnpm install --frozen-lockfile
pnpm eval plan --model YOUR_MODEL
```

The runner prints `Artifacts:` with the run directory, then the path to
`report.md`. Open it for findings and links to the agent's response, generated
files, and judge evidence.

A live run sends the skill and case evidence to the model service and consumes
your usage: each case makes one agent call and one judge call, and `--calibrate`
adds one judge call per control. Allow several
minutes.

Offline checks (`pnpm test`, lint, typecheck) need no credentials. CI runs them
on every pull request and push to `main` via the
[Evals checks workflow](../.github/workflows/evals.yml); live evaluations are
always manual.

## Choose what to run

```sh
pnpm eval plan --model YOUR_MODEL                    # all cases
pnpm eval plan --model YOUR_MODEL --case ambiguous   # one case
```

Case IDs are directory names under `skills/<skill>/cases/`. Cases run sequentially in
sorted order. All case definitions are validated before any model call, even when
one case is selected; unknown IDs and malformed cases fail early. Scripts run
TypeScript through Node's native type stripping, so there is no build step.

| Option                     | What it does                                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--agent AGENT`            | Agent CLI: `codex` or `claude`. Defaults to `codex`. Judge uses the same CLI.                                                                                  |
| `--model MODEL`            | Agent model. Required for live runs.                                                                                                                           |
| `--case CASE_ID`           | Run one case instead of all.                                                                                                                                   |
| `--skill DIR`              | Load the skill from `DIR` (must contain `SKILL.md`) instead of `skills/<skill>`.                                                                               |
| `--no-skill`               | Baseline run: the skill is neither installed nor invoked. `<skill>` still selects the suite. Cannot be combined with `--skill`.                                |
| `--no-checks`              | Skip the suite's deterministic checks (`checks.ts`). Each case's checks are `skipped` and the judge still runs; `results.json` records `checks_mode: skipped`. |
| `--judge-model MODEL`      | Judge model. Defaults to the agent's model.                                                                                                                    |
| `--reasoning EFFORT`       | Agent reasoning effort. Defaults to `high`; use a value your model supports.                                                                                   |
| `--judge-reasoning EFFORT` | Judge reasoning effort. Defaults to the agent's.                                                                                                               |
| `--compare FILE`           | Compare against an earlier `results.json`. Still runs agent and judge.                                                                                         |
| `--calibrate`              | Also judge every prepared control in the suite (see [controls](docs/ADD_CASES.md#check-the-judge-with-controls)).                                              |
| `--create`                 | With `--case`, scaffold `skills/<skill>/cases/<CASE_ID>/` (prompt, checklist, fixtures). Fails if the skill is missing or the case exists; needs no model.     |
| `--help`                   | Print syntax.                                                                                                                                                  |

Each agent or judge invocation has a fixed ten-minute timeout with no override;
a whole suite can take longer.

### Execution environment

Each case gets a fresh temporary Git repository containing the skill at
`.agents/skills/<skill>/` (`.claude/skills/<skill>/` with `--agent claude`) plus the fixture files; the agent may edit them.
Expectations, judge instructions, and schemas stay outside that repository, and
judges run separately on an evidence bundle. Codex uses a read-only judge
sandbox and a temporary `CODEX_HOME`; Claude uses a restricted judge tool
allowlist (`Read,Grep,Glob`) with `bypassPermissions`, not an OS-level read-only
sandbox. For Claude, the config directory is temporary only when environment
credentials are available; otherwise the existing login and config are inherited.
These restrictions are not a confidentiality guarantee against access outside
the working directory. Temporary workspaces and session state are removed after
the run; archived evidence remains.

## Read a result

Start with `skills/<skill>/artifacts/<run-id>/report.md`. Its case table answers four
separate questions:

| Result          | Meaning                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Execution       | Did the agent run? `ok`, or `timeout` / `execution_error`.                                                                                 |
| Checks          | Did the optional deterministic validator pass? `not_run` = no validator; `skipped` = `--no-checks`; `error` = the validator itself failed. |
| Judge execution | Did the judge return valid findings? `invalid_response`, `timeout`, `execution_error` are judge problems.                                  |
| Requirements    | Each expectation is `pass`, `fail`, or `ungradable` (evidence missing, unusable, or lost to an execution problem), with evidence.          |

`execution: ok`, `checks: pass`, `judge: ok`, `covers_reservation: fail` means the
experiment ran fine and found a quality problem. A successful judge call does not
mean the agent passed. Read the cited evidence before acting.

Exit codes: **0** means the experiment completed, even if requirements or checks
failed; **2** means an infrastructure or harness failure (timeout, invalid judge
output, thrown validator error, invalid case); **130** means the run was
cancelled by SIGINT or SIGTERM: the current agent stops, no further agent, judge
or calibration calls start, and the partial evidence is archived with
`cancelled: true` in `results.json`. Do not use exit 0 as a quality
gate: there is no aggregate score. One run per case is exploratory; repeat before
trusting marginal changes.

### Evidence

Artifacts are Git-ignored:

```text
skills/<skill>/artifacts/<run-id>/
  report.md                 # Findings and evidence links
  results.json              # Format-version-2 results for tools/comparison
  <case>/
    result.json
    workspace/              # Final files
    *.manifest.json         # Archived hashes and link metadata (symlinks recorded, not followed)
    agent/                  # Agent invocation evidence
    judge-quality/          # Judge bundle and findings
  calibration/              # When controls run
```

Invocation directories keep `prompt.txt`, `trace.jsonl`,
`stderr.txt`, `final.txt`, and `execution.json`; judge directories add
`bundle.json`, the rubric, schema, and `finding.json`. Start with `final.txt`
for a response, `bundle.json` for what the judge saw, and `stderr.txt` for
failures. Results also retain requested and observed settings, input hashes, and
raw usage. Runs read the skill, cases, grading inputs, and suite hooks from the
live checkout; nothing is copied into the run folder. `skill_hash`,
`inputs_hash`, and `harness_git` identify the versions used, so they show
whether two runs are comparable, but the artifacts alone do not replay a run.
Editing the skill or cases while a run is in progress affects that run.

## Compare a change with a baseline

Compares the results of an evaluation against a baseline to find out whether an edit to a skill made it comparatively better or worse, instead of judging from a single run.

Assuming an available baseline run, then after changing the skill run:

```sh
pnpm eval plan --model YOUR_MODEL \
  --compare skills/plan/artifacts/BASELINE_RUN_ID/results.json

# or evaluate a skill snapshot stored elsewhere, with the same suite and cases
pnpm eval plan --skill /path/to/candidate/plan --model YOUR_MODEL \
  --compare skills/plan/artifacts/BASELINE_RUN_ID/results.json
```

The comparison (in the report and `results.json`) matches skill, case ID, and
requirement ID, and separately reports pass/fail changes, availability changes,
and added/removed cases and requirements. With `--case`, other baseline cases are
excluded rather than reported as removed. Changes to requirement wording, skill
contents, harness code, or runtime settings can change what is being measured, so
read the limitations alongside the findings. Harness code is compared through the
recorded `harness_git` state: a limitation is reported when the commits differ,
when either run had a dirty working tree (the commit then does not identify the
harness code), or when the revision is unknown or missing (for example, results
recorded before it existed). Only version-2 results are accepted.

## Measuring the skill's value

Run the same model, cases, checks, and judge without the skill, then compare a
normal run with that baseline:

```sh
pnpm eval plan --model YOUR_MODEL --no-skill

pnpm eval plan --model YOUR_MODEL \
  --compare skills/plan/artifacts/NO_SKILL_RUN_ID/results.json
```

The agent receives the unmodified `prompt.md` in a workspace holding only the
fixtures. `results.json` records `skill_mode: none` and `skill_hash: none`, and
the comparison says that it is a with/without-skill comparison. Results without
a `skill_mode` count as `installed`.

Before reading a difference as the skill's value, check that:

- **The skill is not installed for your user.** Claude's
  `--setting-sources project` keeps user skills and user-installed plugins out,
  even with an inherited config directory. Codex still discovers skills in
  `$HOME/.agents/skills` despite `--ignore-user-config` and the temporary
  `CODEX_HOME`, so remove the evaluated skill from there first. Skills bundled
  with a CLI stay available in both modes.
- **The case does not depend on the skill.** Prompts are sent as written: the
  `specify` case asks the agent to use the specify skill and its template, which
  do not exist in a no-skill run. Checks may also test a format only the skill
  describes, such as the `plan` design path and JSON fields, so `checks` failures
  can reflect an unstated contract rather than lower quality.

## Next steps

- [Add your own case](docs/ADD_CASES.md): To learn more of how to add cases, expectation checklists, deterministic checks, and judge controls.
- [Troubleshoot a run](docs/TROUBLESHOOT.md): To find solutions on common failures.
