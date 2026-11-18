import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Top-level statements must be separated by a blank line, including one-line
// `test(...)` calls that padding-line-between-statements cannot tell apart
// from assertions nested inside a test.
const topLevelBlankLines = {
  rules: {
    'top-level-blank-lines': {
      meta: {
        type: 'layout',
        fixable: 'whitespace',
        schema: [],
        messages: {
          missing: 'Separate top-level statements with a blank line.',
        },
      },
      create(context) {
        return {
          Program(node) {
            for (let i = 1; i < node.body.length; i += 1) {
              const prev = node.body[i - 1];
              const next = node.body[i];
              const bothImports =
                prev.type === 'ImportDeclaration' &&
                next.type === 'ImportDeclaration';

              if (!bothImports && next.loc.start.line - prev.loc.end.line < 2) {
                context.report({
                  node: next,
                  messageId: 'missing',
                  fix: (fixer) => fixer.insertTextAfter(prev, '\n'),
                });
              }
            }
          },
        };
      },
    },
  },
};

export default [
  {
    ignores: [
      '**/artifacts/**',
      'coverage/**',
      'node_modules/**',
      '.pnpm-store/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    plugins: { '@stylistic': stylistic, local: topLevelBlankLines },
    rules: {
      'local/top-level-blank-lines': 'error',
      'one-var': ['error', 'never'],
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: 'import', next: '*' },
        { blankLine: 'any', prev: 'import', next: 'import' },
        { blankLine: 'always', prev: '*', next: 'block-like' },
        { blankLine: 'always', prev: 'block-like', next: '*' },
        { blankLine: 'always', prev: '*', next: 'export' },
        { blankLine: 'always', prev: 'export', next: '*' },
        { blankLine: 'always', prev: ['const', 'let'], next: 'expression' },
      ],
      curly: ['error', 'all'],
      'no-case-declarations': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'SwitchCase > :not(BlockStatement).consequent',
          message: 'Wrap each nonempty switch case body in braces.',
        },
      ],
      'no-fallthrough': 'error',
      // Runtime JSON and synthetic failure fixtures intentionally carry unknown shapes.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];
