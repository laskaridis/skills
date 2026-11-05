// Builds promptfoo test cases from cases/*/{transcript.md,traps.yaml}.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const SPEC_OF_ENVELOPE = "JSON.parse(output).specContent";
const EVIDENCE = " Answer PASS or FAIL and justify with a short verbatim quote from the specification.";

const framing = (transcript: string, arm: string) =>
  arm === "control"
    ? `The following is the prior conversation between you and the user:\n<transcript>\n${transcript}\n</transcript>\nContinuing from it, write a feature spec in ./out`
    : `The following is the prior conversation between you and the user:\n<transcript>\n${transcript}\n</transcript>\nContinuing from it, invoke the specify skill and write the spec to ./out`;

export function generateTests() {
  const arm = process.env.EVAL_ARM === "control" ? "control" : "skill";
  const casesDir = join(here, "cases");
  return readdirSync(casesDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => {
    const transcript = readFileSync(join(casesDir, d.name, "transcript.md"), "utf8").trim();
    const traps: { id: string; rubric: string }[] = parse(readFileSync(join(casesDir, d.name, "traps.yaml"), "utf8"));
    return {
      description: d.name,
      vars: { task: framing(transcript, arm), caseName: d.name },
      assert: traps.map((t) => ({
        type: "llm-rubric", metric: t.id, transform: SPEC_OF_ENVELOPE, value: t.rubric + EVIDENCE,
      })),
    };
  });
}
