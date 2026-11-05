// Reads a promptfoo results JSON, reports per-assertion pass rate across repeats
// and applies the pass bar from DESIGN.md §5. Usage:
//   tsx gate.ts [results.json]            gate (defaults to newest non-control results/*.json)
//   tsx gate.ts [results.json] --update   record current pass counts as baseline.json
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateTests } from "./generateTests.ts";

export const DETERMINISTIC = ["file-named", "sections", "ac-codes", "gherkin", "restricted-edit"];
export const TRAP_MIN_RATE = 0.8;      // >= 4/5 when there is no baseline yet
export const TRAP_MAX_DROP = 1;        // repeats below the recorded baseline
export const MIN_VALID_REPEATS = 3;    // below this, a case/metric is too thin to gate on

export type Tally = { pass: number; total: number };
export type Tallies = Record<string, Record<string, Tally>>;   // case -> metric -> tally
export type Baseline = Record<string, Record<string, Tally>>;  // case -> trap -> {pass, total} at --update time

interface ResultRow {
  failureReason?: number; error?: string | null; testCase?: { description?: string };
  namedScores?: Record<string, number> | null;   // metric -> 0/1 (one assertion per metric)
}

/** Harness errors (failureReason 2 / error set) are excluded from every denominator. */
export function tally(rows: ResultRow[]): { tallies: Tallies; harnessErrors: number } {
  const tallies: Tallies = {};
  let harnessErrors = 0;
  for (const r of rows) {
    if (r.failureReason === 2 || r.error) { harnessErrors++; continue; }
    const c = r.testCase?.description ?? "unknown";
    for (const [m, score] of Object.entries(r.namedScores ?? {})) {
      const t = ((tallies[c] ??= {})[m] ??= { pass: 0, total: 0 });
      t.total++; if (score >= 0.5) t.pass++;
    }
  }
  return { tallies, harnessErrors };
}

export function evaluate(tallies: Tallies, baseline: Baseline): string[] {
  const failures: string[] = [];
  for (const [c, metrics] of Object.entries(tallies)) {
    for (const [m, t] of Object.entries(metrics)) {
      if (DETERMINISTIC.includes(m)) {
        if (t.pass !== t.total) failures.push(`${c}/${m}: ${t.pass}/${t.total} (deterministic must be 100%)`);
      } else {
        const base = baseline[c]?.[m];
        // Baseline pass count is scaled to the current repeat count before applying
        // the drop tolerance, so a differing --repeat between baseline and gated
        // runs doesn't change the effective bar. The absolute 80% floor always
        // applies too, so recording a weak baseline can't lower the bar below it.
        const absoluteFloor = Math.ceil(TRAP_MIN_RATE * t.total);
        const floor = base === undefined
          ? absoluteFloor
          : Math.max(absoluteFloor, Math.ceil((base.pass / base.total) * t.total) - TRAP_MAX_DROP);
        if (t.pass < floor) failures.push(`${c}/${m}: ${t.pass}/${t.total} below floor ${floor}${base === undefined ? " (no baseline, need >=80%)" : ` (baseline ${base.pass}/${base.total})`}`);
      }
    }
  }
  return failures;
}

/** Expected case -> metric list (deterministic checks + every trap id), derived
 *  from the same source generateTests.ts uses to build the promptfoo suite, so
 *  this can't drift from what's actually configured to run. */
export function expectedMetrics(): Record<string, string[]> {
  const expected: Record<string, string[]> = {};
  for (const t of generateTests() as { description: string; assert: { metric: string }[] }[]) {
    expected[t.description] = [...DETERMINISTIC, ...t.assert.map((a) => a.metric)];
  }
  return expected;
}

/** Flags a suite as incomplete if an expected case/metric is entirely missing
 *  (e.g. every run of it errored) or has too few valid (non-harness-error)
 *  repeats to trust, rather than silently reporting on whatever happened to
 *  come back. */
export function checkCompleteness(
  tallies: Tallies,
  expected: Record<string, string[]>,
  minValidRepeats = MIN_VALID_REPEATS,
): string[] {
  const problems: string[] = [];
  for (const [c, metrics] of Object.entries(expected)) {
    for (const m of metrics) {
      const t = tallies[c]?.[m];
      if (!t || t.total === 0) problems.push(`${c}/${m}: missing (0 valid repeats, all harness errors or case/metric not run)`);
      else if (t.total < minValidRepeats) problems.push(`${c}/${m}: only ${t.total} valid repeat(s), need >= ${minValidRepeats}`);
    }
  }
  return problems;
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const args = process.argv.slice(2);
  const update = args.includes("--update");
  let file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    const dir = join(here, "results");
    const newest = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("control-")).sort().pop();
    if (!newest) { console.error("no results/*.json found; run `npm run eval` first"); process.exit(2); }
    file = join(dir, newest);
  }
  const data = JSON.parse(readFileSync(file, "utf8"));
  const rows: ResultRow[] = data.results?.results ?? data.results ?? [];
  const { tallies, harnessErrors } = tally(rows);
  const baselinePath = join(here, "baseline.json");
  const baseline: Baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : {};

  for (const [c, metrics] of Object.entries(tallies)) {
    console.log(`\n${c}`);
    for (const [m, t] of Object.entries(metrics)) console.log(`  ${m.padEnd(16)} ${t.pass}/${t.total}  ${(100 * t.pass / t.total).toFixed(0)}%`);
  }
  console.log(`\nharness errors (excluded from denominators): ${harnessErrors}`);

  const completeness = checkCompleteness(tallies, expectedMetrics());
  if (completeness.length) {
    console.error("\nGATE FAILED (incomplete suite):\n  " + completeness.join("\n  "));
    process.exit(1);
  }

  if (update) {
    const next: Baseline = {};
    for (const [c, metrics] of Object.entries(tallies))
      for (const [m, t] of Object.entries(metrics)) if (!DETERMINISTIC.includes(m)) (next[c] ??= {})[m] = { pass: t.pass, total: t.total };
    writeFileSync(baselinePath, JSON.stringify(next, null, 2) + "\n");
    console.log(`baseline written to ${baselinePath}`);
    return;
  }
  const failures = evaluate(tallies, baseline);
  if (failures.length) { console.error("\nGATE FAILED:\n  " + failures.join("\n  ")); process.exit(1); }
  console.log("\nGATE PASSED");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
