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
test("non-gherkin AC fails", () => assert.ok(!checkGherkin(env({ specContent: good.replace("Given a, When b, Then c.", "It works") })).pass));
test("edits outside out/ fail", () => assert.ok(!checkRestrictedEdit(env({ filesChanged: ["out/x.spec.md", "src/a.ts"] })).pass));
