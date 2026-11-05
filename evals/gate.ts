// Reads a promptfoo results JSON, reports per-assertion pass rate across repeats
// and applies the pass bar from DESIGN.md §5. Usage:
//   tsx gate.ts [results.json]            gate (defaults to newest non-control results/*.json)
//   tsx gate.ts [results.json] --update   record current pass counts as baseline.json
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const DETERMINISTIC = ["file-named", "sections", "ac-codes", "gherkin", "restricted-edit"];
export const TRAP_MIN_RATE = 0.8;      // >= 4/5 when there is no baseline yet
export const TRAP_MAX_DROP = 1;        // repeats below the recorded baseline

export type Tally = { pass: number; total: number };
export type Tallies = Record<string, Record<string, Tally>>;   // case -> metric -> tally
export type Baseline = Record<string, Record<string, number>>; // case -> trap -> passes

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
        const floor = base === undefined ? Math.ceil(TRAP_MIN_RATE * t.total) : base - TRAP_MAX_DROP;
        if (t.pass < floor) failures.push(`${c}/${m}: ${t.pass}/${t.total} below floor ${floor}${base === undefined ? " (no baseline, need >=80%)" : ` (baseline ${base})`}`);
      }
    }
  }
  return failures;
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

  if (update) {
    const next: Baseline = {};
    for (const [c, metrics] of Object.entries(tallies))
      for (const [m, t] of Object.entries(metrics)) if (!DETERMINISTIC.includes(m)) (next[c] ??= {})[m] = t.pass;
    writeFileSync(baselinePath, JSON.stringify(next, null, 2) + "\n");
    console.log(`baseline written to ${baselinePath}`);
    return;
  }
  const failures = evaluate(tallies, baseline);
  if (failures.length) { console.error("\nGATE FAILED:\n  " + failures.join("\n  ")); process.exit(1); }
  console.log("\nGATE PASSED");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
