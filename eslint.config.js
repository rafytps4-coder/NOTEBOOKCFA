import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'playwright-report', 'test-results', 'prompts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Dependency direction (CLAUDE.md): core and engines never import helpers.
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['src/core/**', 'src/engines/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/helpers/**', '@/helpers/**'],
              message: 'core/engines must not import helpers',
            },
          ],
        },
      ],
    },
  },
  {
    // Isolation: the CFA Helper must stay removable. Nothing outside src/helpers may name it
    // (features may use the registry and types; they discover Helpers only through the registry).
    files: ['src/features/**', 'src/ui/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/helpers/cfa', '**/helpers/cfa/**', '@/helpers/cfa', '@/helpers/cfa/**'],
              message:
                'Only src/helpers may reference helpers/cfa. Use the Helper registry instead.',
            },
          ],
        },
      ],
    },
  },
);
