# Testing Guidelines

- Write tests from the perspective of the caller, identifying the smallest, stable interface through which the desired behaviour can be accessed.
- Focus relentlessly on writing readable and comprehensive tests:
  * Tests should act as documentation artifacts explaining how the software behaves.
  * Name test scenarios after the behavior they specify, not implementation internals.
  * Ensure the system under test (SUT) is clearly identifiable in each test method to enforce readability.
  * Structure tests to make pre-conditions, execution and expected outcome clear to the reader.
- Avoid testing implementation details (private methods, internal collaborators, etc), which makes changing code brittle. Focus tests on stable public interfaces such that if internals change, tests do not need to be re-written.
- Use mocks/stubs for external collaborators that make the test slow, are costly to construct, or non-deterministic. Use real collaborators if they are cheap, deterministic and practical to construct. Avoid mocking implementation details of the SUT.
- Keep each test focused on one behavior. Use as many related assertions as needed to establish it. Split the test when assertions describe independent outcomes.
- NEVER weaken or delete existing tests to make the suite pass, unless you explicitly confirm the related behavior was changed or removed.
- Add the minimum fixture data needed to explain the scenario.
- Use intention-revealing, reusable, factory methods if they meaningfully improve readability and remove duplication.