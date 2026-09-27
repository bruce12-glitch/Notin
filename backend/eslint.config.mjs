// WP-AUDIT â€” ESLint flat config (backend, ESM, Node >= 22.5).
// Correctness rules only; style stays with the existing codebase conventions.
import js from '@eslint/js';

export default [
  {
    ignores: ['node_modules/**', 'test-results/**', 'playwright-report/**', 'uploads/**', 'prisma/*.sqlite*'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'tests/unit/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        AbortController: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        crypto: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // Deliberate empty catches documented in code (shutdown paths, best-effort
    // cleanup) live in these files; flagged parse catches were converted to
    // logged warnings in WP-AUDIT-M4.
    files: ['src/server.js', 'src/config/db.js'],
    rules: {
      'no-empty': 'off',
    },
  },
];
