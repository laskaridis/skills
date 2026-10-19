---
name: ddd
description: "Document stablished domain language inside the project. Use this skill when you are instructed to capture the domain language given some context (a discussion with the user, a specification or other document, some specific code area) or when you discover a meaningful domain concept, rule, or linguistic distinction that is relevant to the task and is missing, ambiguous, or inconsistent in the existing documentation. Do not invoke merely because domain terminology appears in the code."
---

# Domain Driven Design 

Enable coding agents to write code that aligns with the ubiquitous domain language used by the business.

## Core rule

Make ubiquitous domain language explicit in the project. When coding, follow established language and linguistic boundaries consistently instead of inventing your own.

## Workflow

### 1. Distill the specific context for business domain language

Inspect the specific context (explicilty provided by user or implicitly established by the current task) and extract:

- Terms and their contextual meanings, synonyms, and rejected names.
- Business purpose, capabilities, participants, and workflows.
- Business rules, invariants, states, commands, queries, and domain events.

### 2. Inspect relevant existing language

- Read existing `CONTEXT.md`, `LANGUAGE.md`, `CONTEXT-MAP.md` of relevant bounded contexts as needed **before editing** to establish prior knowledge of the domain language.
- Inspect relevant code as needed to better understand the discussed domain.
- Distinguish intended business behavior from implemented behavior. When sources conflict, record the discrepancy and its sources without silently choosing one.

### 3. Determine context boundaries 

Project structure specifies the relevant document placement. For a project with a single bounded context typical structure would look as follows:

```text
project/
├── CONTEXT.md
├── LANGUAGE.md
├── ...
└── src/
```

For a project containing multiple bounded contexts, typical structure would look as follows:

```text
project/
├── CONTEXT-MAP.md
├── context-a/
│   ├── CONTEXT.md   # Documents bounded context purpose, boundary and responsibilities
│   ├── LANGUAGE.md  # Documents the ubiquitous language bounded by the context's linguistic boundary.
│   ├── ...
│   └── src/  
└── context-b/
    ├── CONTEXT.md
    ├── LANGUAGE.md
    ├── ...
    └── src/
```

- Preserve and reuse established bounded contexts and their existing roots.
- Context roots may be nested inside the project's existing layout. 
- External contexts can appear in relationships without receiving local directories or counting as additional project contexts.
- When no boundary is established and the available evidence supports one coherent model, use the project root and mark the context scope provisional.
- Do not invent additional contexts to fill a map.
- Never reorganize code or the project's existing structure to resolve a documentation ambiguity.
- If materially different interpretations would place documents in different roots, ask about placement. 

### 4. Write or merge the documents

Read fully [references/document-templates.md](references/document-templates.md) for the document outlines and content guidance. Adapt the outlines to existing useful structure instead of replacing maintained documents wholesale.

- Maintain `CONTEXT.md` and `LANGUAGE.md` at each identified project context root.
- For multiple project contexts, maintain a root `CONTEXT-MAP.md` indexing all identified contexts and their relationships.
- For a single context, describe external relationships in its `CONTEXT.md`, no `CONTEXT-MAP.md` is needed.
- Create or update documentation only for contexts directly relevant to the task. Do not attempt to complete the domain model or document unrelated contexts.
- Place language definitions in the owning context's `LANGUAGE.md`, place responsibilities and rules in its `CONTEXT.md`, place cross-context relationships in the map. Link between them instead of duplicating substantial content.
- Preserve distinct local meanings, previously established knowledge, and useful examples.-
- Consolidate duplicates and update superseded definitions when the change is explicit.
- Mark deprecated terms and their replacements explicitly.
- Keep documentation consistent when terminology or scope changes.
- Limit changes to the domain documents and necessary links between them.
- Do not rename code, alter behavior, or scaffold a new architecture as part of this capture task.

### 5. Review and report

Verify that:

- Every identified project context has both files, and a multi-context project has a root map with working relative links.
- Terms describe domain meanings within their context; synonyms and overloaded terms are explicit.
- Rules, boundaries, and relationships have support. Inferences and unknowns remain visibly provisional.
- Relationship direction is explained in words, and no integration pattern or ownership arrangement has been invented.
- New content reflects the conversation without dropping prior knowledge or duplicating definitions across documents.

Report the files created or updated, the main terminology or boundary changes, and any unresolved question that affects interpretation. Do not paste the full documents unless requested.

**CRITICAL**: If you find ambiguous, conflicting or inconsistent language do not try to resolve it yourself. Call it out explicitly by documenting it in the relevant `LANGUAGE.md` document and notify the user.
