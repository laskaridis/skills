import test from "node:test";
import assert from "node:assert";
import { checkFileNamed, checkSections, checkAcCodes, checkGherkin, checkRestrictedEdit } from "./assert.ts";

const good = `# Feature Specification: X
## Purpose / Big Picture
p
## User stories
### US-001: a
#### Acceptance criteria
- **AC-001:** Given a, When b, Then c.
### US-002: b
- **AC-002:** Given a, When b, Then c.
## Assumptions
- x
## Out of Scope
- y
## Clarifications needed
- z
`;
const env = (o: object) => JSON.stringify({ specPath: "out/x.spec.md", specContent: good, filesChanged: ["out/x.spec.md"], ...o });

test("good spec passes everything", () => {
  for (const f of [checkFileNamed, checkSections, checkAcCodes, checkGherkin, checkRestrictedEdit])
    assert.ok(f(env({})).pass, f.name);
});
test("bad names fail", () => {
  assert.ok(!checkFileNamed(env({ specPath: "" })).pass);
  assert.ok(!checkFileNamed(env({ specPath: "out/Bad Name.spec.md" })).pass);
});
test("missing section fails", () => assert.ok(!checkSections(env({ specContent: good.replace("## Out of Scope", "") })).pass));
test("duplicate / decreasing AC codes fail", () => {
  assert.ok(!checkAcCodes(env({ specContent: good.replace("AC-002", "AC-001") })).pass);
  assert.ok(!checkAcCodes(env({ specContent: good.replace("AC-001", "AC-003") })).pass);
});
test("malformed Given/When/Then fails", () => assert.ok(!checkGherkin(env({ specContent: good.replace("Given a, When b, Then c.", "Given a, Then c.") })).pass));
test("checklist AC (no Given/When/Then) passes", () => assert.ok(checkGherkin(env({ specContent: good.replace("Given a, When b, Then c.", "It works") })).pass));
test("table-format AC passes AC-codes and Gherkin checks", () => {
  const table = good.replace("- **AC-001:** Given a, When b, Then c.", "| AC-001 | It works |");
  assert.ok(checkAcCodes(env({ specContent: table })).pass);
  assert.ok(checkGherkin(env({ specContent: table })).pass);
});
test("Given/When/Then split across indented lines under the AC still passes", () => {
  const multiline = good.replace(
    "- **AC-001:** Given a, When b, Then c.",
    "- **AC-001:** Given a basket\n  When the guest logs in\n  Then the baskets are merged",
  );
  assert.ok(checkGherkin(env({ specContent: multiline })).pass);
});
test("a block with Given but no completed When/Then still fails even when split across lines", () => {
  const multiline = good.replace(
    "- **AC-001:** Given a, When b, Then c.",
    "- **AC-001:** Given a basket\n  Then the baskets are merged",
  );
  assert.ok(!checkGherkin(env({ specContent: multiline })).pass);
});
test("edits outside out/ fail", () => assert.ok(!checkRestrictedEdit(env({ filesChanged: ["out/x.spec.md", "src/a.ts"] })).pass));
test("extra file alongside the spec fails restricted-edit even when both are under out/", () =>
  assert.ok(!checkRestrictedEdit(env({ filesChanged: ["out/x.spec.md", "out/unrequested.txt"] })).pass));
test("no files changed fails restricted-edit", () => assert.ok(!checkRestrictedEdit(env({ filesChanged: [] })).pass));
