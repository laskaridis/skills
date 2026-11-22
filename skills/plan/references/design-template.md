# <Title explaining the goal of this design document>

## References

* <Reference to corresponding specification document>
* <Reference to other relevant documents such as ARCHITECTURE.md>
* ...

## Key architectural drivers

Provide a short list of key architectural drivers that influence the design:

* <Driver: Explain in what way it influences this design (1-2 sentences max).>
* ...

## Key decisions and trade-offs

Record consequential design decisions, their rationale and relevant trade-offs not evident from module descriptions. Keep this section concise and focused. Don't add prose or mention things that don't bear significant impact on the design or architecture.

- <Decision, rationale and trade-off in 1-3 sentences>
- ...

## Alternatives considered (optional)

Record any plausible alternative you weighed for a contestable decision above and why it was not selected. Skip this section if no decision warranted comparing alternatives:

- <Decision: the alternative considered and why it was not selected, in 1-2 sentences.>
- ...

## Module changes (optional)

List all identified modules which need to change to deliver the requested scope, or skip section if no changes.

### <Module name>

List below only the aspects that change. Do not include a full documentation of the module unless it is a new module being added. Mark unchanged sections accordingly. Example of a change to an existing module that hides three existing interfaces under a new unified abstraction:

```markdown
### Reporting

**Responsibility**: Unchanged

**Collaborators**: Unchanged

**Interfaces**:

- Hide `JsonReporter`, `HtmlReporter` and `CsvReporter` interfaces under a unified `ReportMaker` facade.

**Scope of change and rationale:**

- Add a new unified layer of abstraction that reduces coupling by reducing the connascence degree.
- `JsonReporter`, `HtmlReporter` and `CsvReporter` remain but become internal.
- Required because the large number of modules coupled to `Reporting` module on these interfaces creates unnecessary friction when specific (JSON, HTML, CSV) reporting options change.
```

**Responsibility:** <Describe the module's main responsibility (reason it exists) in 1 sentence>.

**Collaborators:**

List the module's efferent or afferent collaborators (other modules):

- <Module: Explain why the coupling exist and through which interface is achieved, in 1 sentence.>
- ...

**Interfaces:**

Provide a list of the module's published interfaces:

- <Interface: Explain in 1 sentence its purpose.>
- ...

**Scope of change and rationale:**

- Briefly explain **what** needs to change and **why** it is necessary (1-3 sentences).
- Avoid being prescriptive on **how** changes need to manifest. Leave the implementation details to the implementor.

## API changes (optional)

Summarise any changes to published APIs, or skip section if no changes.

## Schema changes (optional)

Summarise any changes to existing data schemas, or skip section if empty.

## Flow of execution (optional)

Define the affected flow of execution only when essential to understand system behaviour or correctness. Otherwise skip this section.

## Key risks and uncertainties (optional)

Capture below any significant architectural risks or uncertainties which have been identified during and may need to be mitigated during implementation, or skip this section if empty:

- <Explain the risk/uncertainty and why it is important in 1-2 sentences.>
- ...
