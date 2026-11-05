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

// The template permits a checklist or table instead of Gherkin, so a line is only
// flagged when it attempts Gherkin (contains "Given") but doesn't complete the
// Given/When/Then form — not merely for using a non-Gherkin format.
export function checkGherkin(output: unknown): GradingResult {
  const spec = parseEnvelope(output).specContent;
  const lines = spec.split("\n").filter((l) => new RegExp(AC_CODE_SRC).test(l));
  if (lines.length === 0) return res(false, "no acceptance criteria found");
  const bad = lines.filter((l) => /\bGiven\b/i.test(l) && !/Given\b.*\bWhen\b.*\bThen\b/i.test(l));
  return res(bad.length === 0, bad.length ? `malformed Given/When/Then: ${bad.map((l) => l.trim().slice(0, 80)).join(" | ")}` : `${lines.length} ACs checked`);
}

export function checkRestrictedEdit(output: unknown): GradingResult {
  const e = parseEnvelope(output);
  const outside = e.filesChanged.filter((f) => !f.startsWith("out/"));
  return res(outside.length === 0, outside.length ? `changed outside out/: ${outside.join(", ")}` : "only out/ changed");
}
