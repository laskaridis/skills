/**
 * Dependency rules checked by `pnpm lint:deps`.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
export default {
  forbidden: [
    {
      name: 'no-circular',
      comment:
        'Runtime import cycle. Cycles closed by `import type` are allowed, as they are erased at runtime.',
      severity: 'error',
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } },
    },
  ],
  options: {
    // Needed to see `import type` and label it as type-only.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(artifacts|fixtures)/' },
  },
};
