// Layer 1 — deterministic assertions (DESIGN.md §4). Each is a promptfoo
// `file://assert.ts:<name>` assertion: (output, context) => GradingResult.
// `output` is the JSON envelope emitted by provider.sh.

export interface GradingResult { pass: boolean; score: number; reason: string; }
export interface Envelope {
  specPath: string; specContent: string; runDir: string;
  filesChanged: string[]; exitCode: number; agentTranscript: string;
}

const res = (pass: boolean, reason: string): GradingResult => ({ pass, score: pass ? 1 : 0, reason });

export const parseEnvelope = (output: unknown): Envelope =>
  (typeof output === "string" ? JSON.parse(output) : output) as Envelope;

export const REQUIRED_SECTIONS = [
  "Purpose / Big Picture", "User stories", "Assumptions", "Out of Scope", "Clarifications needed",
];
const SLUG_SPEC = /^out\/[a-z0-9]+(-[a-z0-9]+)*\.spec\.md$/;

export function checkFileNamed(output: unknown): GradingResult {
  const e = parseEnvelope(output);
  return res(SLUG_SPEC.test(e.specPath), `specPath=${JSON.stringify(e.specPath)} (expected out/<kebab-slug>.spec.md)`);
}

export function checkSections(output: unknown): GradingResult {
  const e = parseEnvelope(output);
  const headings = [...e.specContent.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1]);
  const missing = REQUIRED_SECTIONS.filter((s) => !headings.some((h) => h.toLowerCase() === s.toLowerCase()));
  return res(missing.length === 0, missing.length ? `missing sections: ${missing.join(", ")}` : "all sections present");
}

// An AC code is either prose ("**AC-001:**") or a table cell ("| AC-001 |"), per
// spec-template.md's "Use a concise checklist or table when a scenario format
// would obscure the acceptance condition." Shared by acCodes and checkGherkin so
// the two can't drift on what counts as an AC line.
const AC_CODE_SRC = "\\bAC-(\\d+)\\b(?=\\**:|\\s*\\|)";

export const acCodes = (spec: string): number[] =>
  [...spec.matchAll(new RegExp(AC_CODE_SRC, "g"))].map((m) => Number(m[1]));

export function checkAcCodes(output: unknown): GradingResult {
  const codes = acCodes(parseEnvelope(output).specContent);
  if (codes.length === 0) return res(false, "no AC-NNN definitions found");
  const unique = new Set(codes).size === codes.length;
  const increasing = codes.every((c, i) => i === 0 || c > codes[i - 1]);
  return res(unique && increasing, `AC codes: ${codes.join(", ")} (unique=${unique}, increasing=${increasing})`);
}

// The template permits a checklist or table instead of Gherkin, so a block is only
// flagged when it attempts Gherkin (contains "Given") but doesn't complete the
// Given/When/Then form — not merely for using a non-Gherkin format. A block spans
// from its AC-code line up to (but not including) the next AC-code line or the
// next section heading, so clauses written on their own indented lines (rather
// than all crammed onto the AC-code line) are still recognized.
export function checkGherkin(output: unknown): GradingResult {
  const spec = parseEnvelope(output).specContent;
  const lines = spec.split("\n");
  const acLineIdx = lines.reduce<number[]>((acc, l, i) => (new RegExp(AC_CODE_SRC).test(l) ? [...acc, i] : acc), []);
  if (acLineIdx.length === 0) return res(false, "no acceptance criteria found");
  const blocks = acLineIdx.map((start, i) => {
    const nextAc = i + 1 < acLineIdx.length ? acLineIdx[i + 1] : lines.length;
    let end = nextAc;
    for (let j = start + 1; j < nextAc; j++) if (/^#{1,6}\s+/.test(lines[j])) { end = j; break; }
    return lines.slice(start, end).join("\n");
  });
  const bad = blocks.filter((b) => /\bGiven\b/i.test(b) && !/Given\b[\s\S]*\bWhen\b[\s\S]*\bThen\b/i.test(b));
  return res(bad.length === 0, bad.length ? `malformed Given/When/Then: ${bad.map((b) => b.trim().replace(/\n/g, " / ").slice(0, 80)).join(" | ")}` : `${blocks.length} ACs checked`);
}

export function checkRestrictedEdit(output: unknown): GradingResult {
  const e = parseEnvelope(output);
  const outside = e.filesChanged.filter((f) => !f.startsWith("out/"));
  if (outside.length) return res(false, `changed outside out/: ${outside.join(", ")}`);
  // specify permits only the single spec file to be created/changed; extra files
  // under out/ (or a missing/mismatched spec) are also a restricted-edit failure.
  const onlySpec = e.filesChanged.length === 1 && e.filesChanged[0] === e.specPath;
  return res(onlySpec, onlySpec ? "only the spec file changed" : `expected exactly one changed file (${e.specPath}), got: ${e.filesChanged.join(", ") || "(none)"}`);
}
