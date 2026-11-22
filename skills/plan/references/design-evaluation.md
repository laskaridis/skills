# Design evaluation

| Evaluation criterion | What good design looks like |
| --- | --- |
| Change locality | Changes are confined within one coherent component or a small set of components. Unrelated behaviour remains untouched. |
| Information hiding and interfaces | Implementation details are hidden behind small, stable, expressive interfaces. Internal decisions may change without affecting consumers. |
| Cohesion | Each component has a single, unambiguous functional purpose to exist. All components within a module are functionally related. They usually change together, for the same reason and at the same time. |
| Coupling | Dependencies are explicit, necessary and directed to stable contracts. No cycles or coupling to implementation details exists. |
| Conceptual simplicity | The design uses the fewest concepts, layers and abstractions necessary to solve the problem. Complexity is proportional, localised and hidden rather than distributed. |
| Testability | Components can be tested independently with observable outcomes and clear failure boundaries. Regressions are easy to detect and localize. |
| Incremental evolvability | New capabilities can be easily added without breaking or destabilizing existing ones. |
