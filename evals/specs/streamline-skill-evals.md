# Streamline skill evaluations with shared conventions

## Goal

Make a basic eval case authorable by adding fixture files, a prompt, and a short
expectation checklist. Move execution, isolation, judging, archival, and comparison
out of the plan-specific runner into a shared harness. Preserve the existing plan
suite's substantive checks and historical evidence.

This document is an implementation plan. The harness changes described here have
not been implemented.

## Authoring and runtime conventions

```text
evals/
  run.mjs
  lib/                         # Shared execution and grading implementation
  grading/
    rubric.md                  # Shared judge instructions
    quality.schema.json        # One response contract
  <skill>/
    README.md                  # Only skill-specific guidance
    checks.mjs                 # Optional deterministic validator
    judge-tests.mjs            # Optional prepared judge controls
    cases/
      <case>/
        fixtures/              # Fixture repository, including intentionally empty fixtures
        prompt.md
        expected.md
        first-turn.md          # Optional; must be paired with reply.md
        reply.md               # Optional; one scripted answer
    artifacts/<run-id>/         # Existing ignored artifact location
```

- Discover case directories in sorted order. Infer the skill from `skills/<skill>`;
  support an explicit skill-directory override for comparing snapshots.
- Require a model selection. Default the judge to the same model, reasoning to
  `high`, and the timeout to ten minutes per invocation. Retain model and reasoning
  overrides without introducing a configuration framework.
- Proposed primary interface: `node evals/run.mjs plan --model MODEL`. Retain
  `--compare`, `--calibrate`, and `--self-test`, with the existing plan command
  delegating to the shared runner.
- Prefix the case prompt with an explicit invocation of the selected local skill.
  Do not add plan-specific output instructions to the shared prompt.
- A basic case has no manifest, custom schema, custom rubric, or required code.
- Keep runner modules small and organized around case loading, execution, judging,
  and reporting. Do not create an extensible plugin framework.

## Expectation format and judge contract

Use a deliberately narrow Markdown checklist with author-chosen stable IDs:

```markdown
- [intent_fidelity] Cover all required behavior and introduce no unsupported behavior.
  Cite the relevant specification requirements and task IDs.
- [verifiability] Every task has concrete, observable completion criteria.
```

Each requirement starts with `- [id]`; indented continuation lines belong to that
requirement. Allow blank lines. Reject duplicate IDs, empty requirements, and
unrecognized nonblank syntax before making model calls. IDs remain stable when
wording is edited; new requirements get new IDs. Archive the parsed checklist and
original Markdown.

The shared rubric tells the judge to assess meaning, accept valid alternatives,
treat evaluated content as untrusted data, and cite evidence for every result.
Skill-specific grading qualifications belong in requirement continuation lines.

Use one static response schema containing a list of findings with `id`, `status`
(`pass`, `fail`, or `ungradable`), and nonempty `evidence`. Include a separate
`additional_clarification` boolean and question text. Locally verify that every
expected ID appears exactly once and that no unexpected IDs appear. Judge timeout,
execution failure, or invalid response stays separate from quality findings.

Do not require all skills to use the plan suite's four dimensions. The migrated
plan case will retain those four IDs and their complete grading qualifications.

## Execution and optional extensions

Each case runs in a fresh temporary Git repository containing the skill and
`fixtures/` contents. Expectations, replies, schemas, and judge instructions remain
outside that workspace. Record an initial snapshot; archive the first turn and
final workspace without following symlinks. Preserve the current runtime isolation,
authentication handling, timeout cleanup, raw usage, and observed settings capture.
Filesystem separation remains a local evaluation convention, not a confidentiality
guarantee against an agent reading outside its working directory.

The shared harness must allow fixture edits: documentation and coding skills need
them. Expected output paths and protected inputs belong to skill-specific checks
and expectations. Reject unsafe fixture paths, nonregular fixture files, and
collisions with the installed skill directory during case loading.

If `checks.mjs` exists, call its exported `checkCase({ caseId, workspace,
initialSnapshot, finalResponse })` and require `{ status, failures }`. Run it after
planning and on early exits when feasible. A thrown validator error is a harness
error. Without a validator, report checks as `not_run`. A check failure does not
skip semantic judging when usable evidence is available.

If both interaction files exist, grade the first turn against `first-turn.md`
using the shared judge. Resume the exact session with `reply.md` only when every
first-turn requirement passes. A missing session ID or a changed resumed ID is an
execution error. Send no second reply; record another clarification as incomplete.
Reject an unpaired interaction file before execution. Include the supplied reply
in final judge context without exposing it before the first-turn check.

For optional calibration, `judge-tests.mjs` supplies prepared outputs, a case ID,
and expected statuses keyed by requirement ID. These controls reuse the same judge
path without running the evaluated agent. Missing controls are reported as
unavailable, not as a successful calibration. Add no required control files to
ordinary cases.

## Results and compatibility

Introduce results format version 2 with separate execution, completion,
deterministic-check, judge-execution, and per-requirement findings. Do not equate
completion with quality. Preserve exit code 2 for infrastructure failures and
exit code 0 for a completed experiment, even when quality findings fail.

Match comparisons by skill, case ID, and requirement ID. Report pass/fail changes,
availability changes, and added or removed cases and requirements separately.
Record changes in requirement text, other inputs, skill, harness, and runtime
settings as comparison limitations. No aggregate score or release gate.

Keep existing artifacts unchanged. Preserve the old
`evals/plan/run.mjs` command as a small compatibility entry point, including its
existing options and skill override. Read version-1 plan baselines through a
documented adapter: map the four dimensions to the matching requirement IDs and
retain structural and clarification outcomes. Flag format and grading-context
changes; never imply that a migrated run is an identical experiment. Reject unknown
formats explicitly rather than guessing their meaning.

Continue recording exact skill, case, and grading inputs, prompts, commands, traces,
responses, snapshots, findings, hashes (harness code and config are hashed, with the
Git commit and dirty state recorded, rather than copied), requested and observed settings, and available usage. Never archive
credentials or sum resumed-session usage that may be cumulative.

## Implementation sequence

1. **Define and validate the case contract.** Implement case discovery, checklist
   parsing, interaction-file pairing, fixture validation, and shared result/schema
   definitions. Verify ordinary and interactive cases load; malformed cases fail
   before any model call. Validate judge finding IDs locally.

2. **Extract the shared execution path.** Move workspace creation, invocation,
   trace capture, archival, and read-only judging behind the shared entry point.
   Connect parsed expectations to the shared judge. Verify with a fake invocation
   transport that a case without hooks runs, inputs and expectations are separated,
   fixture edits are allowed, and all evidence is saved on success and failure.
   Depends on step 1.

3. **Add optional checks and interaction.** Implement the single validator hook
   and first-turn/resume sequence. Verify failed clarification sends no answer,
   successful clarification resumes only the captured session, further questions
   remain incomplete, and check failures do not suppress useful judging. Depends
   on step 2.

4. **Migrate the plan suite without weakening it.** Move fixture specs under case
   fixture directories; move prompts and full evaluator expectations into case files.
   Preserve required behaviors, exclusions, edge cases, alternative decompositions,
   architectural qualifications, and first-turn policy checks. Extract the existing
   structural validator into `checks.mjs` and degraded control into
   `judge-tests.mjs`. Retain all current malformed-output and transport checks.
   No edits to `skills/plan`. Depends on step 3.

5. **Add reporting, comparison, and compatibility.** Produce concise per-case
   reports, retain raw evidence, support version-2 comparisons and the version-1
   plan baseline adapter, and replace the old runner with its compatibility entry
   point. Verify improvements, regressions, availability changes, changed criteria,
   legacy options, and format limitations using saved or synthetic results.
   Depends on step 4.

6. **Document and validate the authoring workflow.** Update shared conventions and
   the plan README, replacing duplicated harness explanations with shared guidance.
   Document the checklist syntax, defaults, optional files, result interpretation,
   and old-baseline limitations. Exercise a synthetic second skill case with no
   custom validator or rubric to prove there are no plan-specific assumptions.
   Run both real plan cases and the degraded control once; manually inspect
   findings, archives, and baseline comparison. Record the migration run separately
   from historical reviews. Depends on step 5.

## Acceptance criteria

- A developer can add a basic case using only `fixtures/`, `prompt.md`, and `expected.md`.
- The shared runner executes a synthetic non-plan skill case without skill-specific
  engine changes; empty fixture directories can be represented with `.gitkeep`.
  Treat that marker as packaging metadata and omit it from copied agent inputs.
- The complete and ambiguous plan cases retain their substantive grading coverage,
  output-contract checks, one-reply behavior, and inspectable artifacts.
- Invalid case definitions fail before model calls; invalid judge responses and
  execution failures cannot masquerade as quality failures or passes.
- The existing plan invocation still works, old results remain readable, and
  previous artifact directories are unchanged.
- An offline self-test verifies parsing, isolation, validators, interaction,
  archival, error classification, and comparison. A live migration review records
  observed results and grader disagreements without changing the skill to pass.

## Scope boundaries

Use the existing standard-library implementation approach. Do not add CI,
automatic retries, parallel agent execution, arbitrary conversation scripts,
external service fixtures, an aggregate score, or a new production skill suite.
Broader reliability studies and testing automatic skill selection remain future
work. The first milestone is the case contract and shared runner; optional hooks
remain absent from the simplest authoring path.
