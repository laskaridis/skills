# Skill Evaluation Design

How we measure whether the skills in this repository do what they claim.

This document captures the agreed methodology. The harness is replaceable; the
methodology is the part we reuse for every subsequent skill.

## 1. Scope

**First target: `specify`.**

It is the cheapest skill to grade credibly:

- It runs in RESTRICTED EDIT MODE and writes exactly one file, `<slug>.spec.md`.
- Its output structure is fixed by `skills/specify/references/spec-template.md`,
  which states mechanically checkable rules (required sections, Gherkin
  acceptance criteria, AC codes unique and monotonically increasing).
- It never mutates a codebase, so a run is cheap and safe to repeat.

`doc-gardening` is the intended second target: planted-defect recall gives a
hard numeric score. `tdd` is last, as it needs a working project and test
runner per case.

**We measure execution quality only.** Whether a skill *triggers* on the right
prompts is a separate experiment with a different shape (many cheap prompts,
binary outcome) and is deliberately out of scope here. `specify` declares an
`argument-hint` and is slash-invoked in practice, so triggering is low-value
for this skill specifically.

## 2. Execution

Each run invokes the **real** Claude Code harness, not a simulation:

```
claude -p --output-format json --allowedTools Read,Glob,Grep,Write,Edit
```

We do not paste `SKILL.md` into a system prompt and grade the text that comes
back. These skills instruct the model to read reference files and explore a
codebase; an API-only simulation would score a skill as passing even if its
`SKILL_ROOT/references/...` path were broken. Running the real harness is the
only way the eval can catch that class of defect.

- **Subject model:** Sonnet 5.5. A skill that only works on Opus is not a
  useful skill.
- **Judge model:** Opus 5.5. Deliberately different from the subject —
  self-grading inflates scores on exactly the subjective criteria where we
  need honesty.
- **Isolation:** every run gets a fresh `cp -R` of the fixture into `$TMPDIR`
  with cwd set there. No network. A pristine known-state copy is what lets us
  assert that nothing outside `out/` was modified, which is one of the skill's
  own stated guarantees.
- **Failures:** a timeout or non-zero exit is recorded as a *harness error*,
  distinct from a graded failure, and is not retried. A harness error and a
  skill defect are different things; conflating them corrupts the pass rate.
  A lost run reduces the denominator visibly rather than silently scoring 0.

### Provider contract

The promptfoo `exec` provider emits a JSON envelope on stdout:

```json
{
  "specPath": "out/wishlist-sharing.spec.md",
  "specContent": "...",
  "runDir": "/tmp/skill-eval-xxxx",
  "filesChanged": ["out/wishlist-sharing.spec.md"],
  "exitCode": 0,
  "agentTranscript": "..."
}
```

`filesChanged` comes from `git status --porcelain` on the fixture copy and is
required for the restricted-edit-mode assertion. `agentTranscript` is retained
so a failure is debuggable without paying for a re-run.

## 3. Test cases

### Fixture

**One shared fixture repository**, roughly 15 files, TypeScript/Node:
a small commerce service with one clear bounded context, one ADR, a
conventions document, and established domain vocabulary.

A single well-built fixture amortises across future skill evals — `plan`,
`ddd` and `doc-gardening` can all reuse it. Keeping it small is also how we
keep the suite fast and cheap (see §6).

### Transcripts

Each case is a `transcript.md` under ~400 words representing the prior
product/technical conversation, including deliberate corrections and rejected
proposals.

The transcript is **inlined into the prompt** inside a framing block:

> The following is the prior conversation between you and the user:
> `<transcript>…</transcript>`. Continuing from it, invoke the specify skill
> and write the spec to `./out`.

It is not left as a file for the agent to read. If it were, the skill would
treat it as a document *in the codebase* rather than as agreed prior context,
and the resulting spec may cite "as discussed in transcript.md" — an artefact
of the harness, not a real failure, and the kind of thing that poisons a
rubric.

### Planted traps

Five traps, one per checkable instruction in the skill's workflow:

| ID | Trap | Expected behavior |
|----|------|-------------------|
| T1 | Superseded proposal — an approach proposed, then explicitly rejected mid-transcript | Spec contains no trace of it |
| T2 | Answerable-from-code question — an open question the fixture repo answers | Resolved from the codebase, **not** listed under "Clarifications needed" |
| T3 | Material ambiguity — a genuine scope-affecting unknown | Appears under "Clarifications needed", not silently invented |
| T4 | Scope-creep bait — an adjacent "we could also…" never agreed | Does not become a story; may appear under "Out of Scope" |
| T5 | Domain vocabulary — fixture says `Basket`, transcript sloppily says "cart" | Spec uses the project's term |

T2 and T5 are the only traps that test whether the skill's codebase-exploration
step does anything, which is precisely where a weaker model cuts corners.

## 4. Grading

**Two layers. Anything a script can decide never goes to a judge.**

### Layer 1 — deterministic (TypeScript)

A `file://assert.ts:functionName` assertion, loaded in-process by promptfoo
(`.ts`, `.js`, `.mjs`, `.cjs` are all first-class, with the same
`(output, context) => boolean | number | GradingResult` contract Python gets).
TypeScript over Python: no second runtime beyond the Node that promptfoo
already needs, typed `GradingResult` imports, and in-process errors instead of
subprocess serialisation.

Checks:

1. Output file exists and is named `<feature-name-slug>.spec.md`.
2. All required template sections present: Purpose / Big Picture, User stories,
   Assumptions, Out of Scope, Clarifications needed.
3. AC codes unique across all stories and monotonically increasing.
4. Acceptance criteria use Given/When/Then form.
5. `filesChanged` contains nothing outside `out/`.

### Layer 2 — LLM rubric

One `llm-rubric` assertion **per trap**, each a single yes/no question
requiring a quoted justification from the spec. Narrow binary questions with
required evidence are the most reliable thing an LLM judge does.

No holistic 1–5 score. Such scores drift between runs and are not actionable:
you cannot fix "3.5/5", you can fix "T4 fails 60% of the time".

## 5. Experimental method

**3 cases × 5 repeats = 15 runs**, fixed temperature, pinned model ID, fresh
fixture copy and empty `out/` per run.

Repeats matter more than breadth for an agentic eval: without knowing the noise
floor, a single run cannot distinguish a flake from a regression. Breadth
widens to 5 cases once the harness is stable and the noise floor is known.

Results are reported as **per-assertion pass rate across repeats**, never a
single pass/fail.

### Pass bar

- **Deterministic assertions: 100%.** These are rules the skill itself states.
  Anything below 100% is a real defect.
- **Trap assertions: ≥80% (4/5).** Probabilistic by nature, so the gate is
  baseline-relative: the suite fails if any trap drops more than one repeat
  below its recorded baseline.

### Control arm

Run **once, at the start**: the same transcripts and fixture, with the skill
removed from the prompt ("write a feature spec in ./out").

This calibrates the suite. A criterion the bare model passes 100% of the time
is measuring the model, not the skill, and should be dropped or rewritten
harder. It is not kept as a permanent arm — that doubles cost for information
that changes slowly.

## 6. Budget

Target: **~20 minutes and a few dollars per full suite.**

Enforced by design rather than machinery: fixture capped at ~15 files,
transcripts under ~400 words, cases run in parallel via promptfoo concurrency.
An eval that takes 40 minutes stops being run after a skill edit, which defeats
its purpose. Speed is a feature.

## 7. Layout

```
evals/
  DESIGN.md           this document
  promptfooconfig.yaml
  provider.sh         exec provider -> claude -p, emits the JSON envelope
  assert.ts           deterministic assertions
  baseline.json       accepted pass rates (committed)
  fixture/            the shared fixture repository
  cases/
    <case>/transcript.md
    <case>/traps.yaml
  results/            timestamped run output
```

Everything is versioned next to the skills it tests, so the eval actually gets
run when a skill changes. `baseline.json` is committed: a regression shows up
as a diff. If package bloat becomes a concern for `npx skills add` consumers,
exclude `evals/` at publish time rather than splitting the repo.
