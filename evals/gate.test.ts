import test from "node:test";
import assert from "node:assert";
import { tally, evaluate } from "./gate.ts";

const row = (c: string, metrics: Record<string, boolean>, extra = {}) => ({
  testCase: { description: c }, failureReason: 0,
  namedScores: Object.fromEntries(Object.entries(metrics).map(([m, pass]) => [m, pass ? 1 : 0])), ...extra,
});

test("harness errors are excluded from denominators", () => {
  const { tallies, harnessErrors } = tally([row("a", { T1: true }), { testCase: { description: "a" }, failureReason: 2, error: "timeout" }]);
  assert.equal(harnessErrors, 1);
  assert.deepEqual(tallies.a.T1, { pass: 1, total: 1 });
});
test("deterministic must be 100%", () => {
  assert.equal(evaluate({ a: { gherkin: { pass: 4, total: 5 } } }, {}).length, 1);
  assert.equal(evaluate({ a: { gherkin: { pass: 5, total: 5 } } }, {}).length, 0);
});
test("trap with no baseline needs >=80%", () => {
  assert.equal(evaluate({ a: { T1: { pass: 3, total: 5 } } }, {}).length, 1);
  assert.equal(evaluate({ a: { T1: { pass: 4, total: 5 } } }, {}).length, 0);
});
test("trap fails only when more than one repeat below baseline", () => {
  assert.equal(evaluate({ a: { T1: { pass: 4, total: 5 } } }, { a: { T1: 5 } }).length, 0);
  assert.equal(evaluate({ a: { T1: { pass: 3, total: 5 } } }, { a: { T1: 5 } }).length, 1);
});
