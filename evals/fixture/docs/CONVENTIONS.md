# Conventions

- Domain logic lives in `src/<context>/`; HTTP adapters in `src/http/` contain no business rules.
- Domain errors extend `DomainError` (`src/basket/errors.ts`) and are mapped to HTTP status in `src/http/`.
- Money is an integer number of minor units (`Price`), never a float.
- Every domain rule has a test in `test/`.
- Use the vocabulary in `docs/GLOSSARY.md` in code, tests and docs.
