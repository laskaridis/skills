# Skill evals

Implements [DESIGN.md](DESIGN.md). Layout: shared `package.json` and `fixture/` here,
everything skill-specific under `evals/<skill>/` (currently only [`specify/`](specify/)).

## Run

```bash
cd evals && pnpm install
export ANTHROPIC_API_KEY=...        # needed only for the Layer-2 judge (Opus 5.5)
pnpm test                           # unit tests for every skill's assertions/gate (no API cost)
pnpm specify:eval:control           # ONE-OFF: no-skill calibration arm (DESIGN §5)
pnpm specify:eval                   # 3 cases x 5 repeats -> specify/results/<timestamp>.json
pnpm specify:gate                   # pass bar vs specify/baseline.json (exit 1 on regression)
pnpm specify:gate:update            # record current trap pass counts as the baseline
```

Add a skill by creating `evals/<skill>/` and `<skill>:*` scripts in `package.json`.

Requires the `claude` CLI on PATH and `jq`. `specify/baseline.json` is empty until the first
accepted run; until then traps must reach >= 4/5 per case.

## Deviations from DESIGN.md

- **promptfoo is pinned to 0.120.19.** Later versions require Node >= 22.22; this was built on 22.21.
  Bump the pin when the Node requirement is acceptable.
- **"Fixed temperature" is not enforceable**: `claude -p` exposes no temperature flag. Model ID is pinned;
  the 5 repeats measure the resulting noise.
- **"No network" is not enforced.** Isolation is a fresh fixture copy, `--setting-sources project`,
  `--strict-mcp-config` and a restricted `--allowedTools` list (Read, Glob, Grep, Write, Edit, Skill).
- `Skill` was added to `--allowedTools` so the harness can invoke the installed skill; the skill is copied
  to `.claude/skills/specify` in the run dir (excluded from the nothing-outside-`out/` check because it is
  committed in the baseline commit).

## Status

Verified: unit tests, config validation, one real end-to-end provider run (envelope + all five deterministic
assertions pass), gate parsing of real promptfoo output. **Not yet run:** the full 15-run suite, the control
arm, and the LLM judge (no `ANTHROPIC_API_KEY` in the build environment) — so `baseline.json` is unpopulated.
