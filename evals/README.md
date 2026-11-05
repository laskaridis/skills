# Skill evals

Implements [DESIGN.md](DESIGN.md) for the `specify` skill.

## Run

```bash
cd evals && npm install
export ANTHROPIC_API_KEY=...        # needed only for the Layer-2 judge (Opus 5.5)
npm test                            # unit tests for assert.ts and gate.ts (no API cost)
npm run eval:control                # ONE-OFF: no-skill calibration arm (DESIGN §5)
npm run eval                        # 3 cases x 5 repeats -> results/<timestamp>.json
npm run gate                        # pass bar vs baseline.json (exit 1 on regression)
npm run gate:update                 # record current trap pass counts as baseline.json
```

Requires the `claude` CLI on PATH and `jq`. `baseline.json` is empty until the first
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
