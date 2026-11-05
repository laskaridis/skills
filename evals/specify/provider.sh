#!/usr/bin/env bash
# promptfoo exec provider: runs the real Claude Code harness on a fresh fixture copy
# and prints the JSON envelope described in DESIGN.md §2.
# argv: $1 = prompt, $2 = provider options JSON, $3 = context JSON (vars).
# A timeout / non-zero exit is a HARNESS ERROR: nothing on stdout, message on stderr,
# exit 1 (promptfoo counts it as an error, not a graded failure, and we never retry).
set -uo pipefail
SKILL_EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$(cd "$SKILL_EVAL_DIR/../fixture" && pwd)"   # shared across skills
REPO_ROOT="$(cd "$SKILL_EVAL_DIR/../.." && pwd)"
PROMPT="$1"
ARM="${EVAL_ARM:-skill}"                 # skill | control
SUBJECT_MODEL="${EVAL_SUBJECT_MODEL:-claude-sonnet-5-5}"
TIMEOUT_S="${EVAL_TIMEOUT_S:-600}"

RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/skill-eval-XXXXXX")"
cp -R "$FIXTURE_DIR/." "$RUN_DIR/"
mkdir -p "$RUN_DIR/out" && touch "$RUN_DIR/out/.gitkeep"
if [ "$ARM" != "control" ]; then
  mkdir -p "$RUN_DIR/.claude/skills"
  cp -R "$REPO_ROOT/skills/specify" "$RUN_DIR/.claude/skills/specify"
fi
(cd "$RUN_DIR" && git init -q && git add -A \
  && git -c user.name=eval -c user.email=eval@example.invalid commit -q -m baseline) \
  || { echo "harness error: could not prepare $RUN_DIR" >&2; exit 1; }

TRANSCRIPT_FILE="$RUN_DIR/.agent-transcript.json"
(cd "$RUN_DIR" && perl -e 'alarm shift; exec @ARGV' "$TIMEOUT_S" \
  claude -p "$PROMPT" --output-format json --model "$SUBJECT_MODEL" \
    --allowedTools Read Glob Grep Write Edit Skill \
    --permission-mode acceptEdits --setting-sources project \
    --strict-mcp-config --no-session-persistence \
  >"$TRANSCRIPT_FILE" 2>"$RUN_DIR/.stderr")
EXIT=$?
if [ "$EXIT" -ne 0 ]; then
  echo "harness error: claude exited $EXIT (timeout=${TIMEOUT_S}s) run dir $RUN_DIR: $(tail -c 500 "$RUN_DIR/.stderr")" >&2
  exit 1
fi

# Skill/transcript files written by the harness itself are excluded from the diff.
FILES_CHANGED="$(cd "$RUN_DIR" && git status --porcelain -uall \
  | cut -c4- | grep -v -e '^\.agent-transcript\.json$' -e '^\.stderr$' | jq -R . | jq -s .)"
SPEC_PATH="$(cd "$RUN_DIR" && ls out/*.spec.md 2>/dev/null | head -1 || true)"
SPEC_CONTENT=""
[ -n "$SPEC_PATH" ] && SPEC_CONTENT="$(cat "$RUN_DIR/$SPEC_PATH")"

jq -n --arg specPath "$SPEC_PATH" --arg specContent "$SPEC_CONTENT" --arg runDir "$RUN_DIR" \
  --argjson filesChanged "${FILES_CHANGED:-[]}" --argjson exitCode "$EXIT" \
  --rawfile agentTranscript "$TRANSCRIPT_FILE" \
  '{specPath:$specPath, specContent:$specContent, runDir:$runDir,
    filesChanged:$filesChanged, exitCode:$exitCode, agentTranscript:$agentTranscript}'
