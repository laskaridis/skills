# Troubleshoot a run

| Symptom                       | What to inspect or change                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `--model is required`         | Supply a model for a live run, or use `pnpm test` for offline tests.                                                |
| `Codex CLI unavailable`       | Install `codex` and put it on `PATH`.                                                                               |
| `Claude CLI unavailable`      | Install `claude` and put it on `PATH`.                                                                              |
| `/<skill> isn't available`    | Claude only discovers skills from the project setting source; do not change `--setting-sources` in `lib/agents.ts`. |
| Authentication failure        | Read the invocation's `stderr.txt`; check file-based auth or provider environment (personal CLI config is ignored). |
| `Unknown case ID`             | Use the exact directory name under `skills/<skill>/cases/`.                                                         |
| Checklist parse error         | Open the reported file and line; use `- [stable_id] text` with indented continuations.                              |
| Invalid fixture or skill path | Use ordinary files/directories; remove unsafe paths, symlinks, installed-skill collisions.                          |
| `timeout` / `execution_error` | Follow report links to the trace, stderr, and command. The limit is a fixed ten minutes.                            |
| Judge `invalid_response`      | Compare `final.txt` with the archived schema and bundle: malformed JSON, missing/duplicate IDs, or absent evidence. |
| Check `error`                 | Read the validator error; check return shape and file handling.                                                     |
| Unexpected comparison         | Check case selection, requirement IDs/text, hashes, and runtime settings before interpreting a change.              |
