---
name: gh-review-pr
description: "Perform a read-only code review on a GitHub pull request and post the findings as a real PR review (inline comments plus a sign-off summary). Use when the user asks to review a PR, review this branch's PR, or get a second opinion on a pull request before merging."
argument-hint: Which PR should be reviewed (number, URL, or branch)? Defaults to the open PR for the current branch if omitted.
---

# gh-review-pr

Review a GitHub pull request against the project's actual code and tests, then publish the review on GitHub itself. Inline comments on the exact lines they concern, and a single sign-off review comment that always gets posted, whether or not issues were found.

## Core rules

1. **Read-only.** The reviewing agent must never edit, create, delete, or stage files, and must never push commits or alter the PR's branch. It only reads the repository, the diff, and GitHub metadata, and it only writes by posting a GitHub review.
2. **Always sign off.** Every run ends with exactly one PR review submitted via the GitHub API (`event=COMMENT`), even when there are zero findings. A clean PR gets a short, genuine sign-off, not a fabricated issue.
3. **Comments live on GitHub, on the right line.** Every finding that concerns a specific line of a specific file in the diff is posted as an inline review comment on that file and line. Findings that don't map to one line (e.g. "this PR is missing a migration", overall architecture concerns) go in the review's top-level body instead of being forced onto an arbitrary line.
4. **Evidence over suspicion.** Ground every finding in the diff and the surrounding code you actually read — not assumptions about what the code "probably" does. If you're unsure whether something is a real problem, say so in the comment rather than asserting it.
5. **Don't invent scope.** Review the PR's own changes. Pre-existing issues in code the PR doesn't touch are out of scope unless the PR's changes depend on or worsen them — mention those only in the summary, not as inline comments on unchanged lines.

## Workflow

### 0. Check for `gh`

This skill is built around the GitHub CLI. Before doing anything else, confirm it's available and authenticated: `gh auth status`. If `gh` is missing or not authenticated, stop and tell the user what's missing (install `gh` / run `gh auth login`) instead of falling back to raw GitHub API calls with a manually supplied token.

### 1. Resolve the target PR

- If the user named a PR (number, URL, or explicit branch), use that.
- Otherwise, check for an open PR on the current branch: `gh pr view --json number,url,headRefName`. If `gh` reports no PR for the branch, do not guess.
- If there's no explicit PR and no open PR for the current branch, stop and ask the user which PR to review. Do not pick an arbitrary PR or fall back to reviewing a diff that isn't attached to a PR.

### 2. Gather context

- `gh pr view <pr> --json number,title,body,baseRefName,headRefName,url,additions,deletions,files` for the PR's intent and scope.
- `gh pr diff <pr> --patch` for the actual diff, including hunk headers — you need these to map comments to correct file/line numbers.
- Read the full content of changed files (not just the diff hunks) when you need surrounding context to judge correctness, naming, or design — a 3-line hunk often can't be judged in isolation.
- Read related tests for changed production code, and related production code for changed tests.
- Note the repo's `owner/name` and the PR's current head commit SHA (`gh pr view <pr> --json headRefOid`) — both are needed to post the review via the API.

### 3. Review

Delegate the review to a subagent with no write tools (or, if subagents aren't available, perform this pass yourself without using any edit/write tool). Give it the PR description, diff, and relevant file contents, and ground it explicitly in `references/review-checklist.md` (correctness, testability, clarity, design). Ask it to return findings as a structured list: `{file, line (or null), severity, comment}`, plus a short overall assessment for the review body.

Forbid the review pass from running anything beyond read-only commands (tests, linters, `gh`/`git` reads). It must not run `git commit`, `git push`, or any command that mutates the working tree or the remote.

### 4. Publish the review on GitHub

Post everything as a single GitHub review so the sign-off and the inline comments land atomically:

```bash
gh api repos/<owner>/<repo>/pulls/<pr>/reviews \
  -f commit_id='<head_sha>' \
  -f event='COMMENT' \
  -f body='<overall summary + any findings that do not map to one line>' \
  -F comments='[{"path":"<file>","line":<line>,"side":"RIGHT","body":"<finding>"}, ...]'
```

- `path` is the file path relative to the repo root, exactly as it appears in the diff.
- `line` is the line number in the **new** version of the file for additions/context (`side: RIGHT`), or in the **old** version for a comment about a removed line (`side: LEFT`).
- Only comment on lines that appear in the diff; GitHub rejects comments on lines outside the diff context.
- If there are no inline findings, still submit the review with an empty `comments` array and a `body` that states the review was done and nothing stood out — do not skip posting because there's nothing to flag.
- Never use `event='REQUEST_CHANGES'` or `event='APPROVE'` unless the user explicitly asks for an approval/block decision — default to `COMMENT` so the review is informative without gating the merge.

### 5. Summarize back to the user

After the review is posted, report concisely in the conversation (not by repeating every inline comment verbatim):

- The PR reviewed (number/title) and a link to the posted review.
- Count of findings by severity, and the one or two that matter most, if any.
- Anything you flagged in the summary body but couldn't tie to a specific line.
- Confirmation that no files were modified locally.
