import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'src-tauri/', 'node_modules/'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      // The `globals` package ships a key with a trailing space
      // ("AudioWorkletGlobalScope "), which eslint 10 rejects outright.
      globals: {
        ...Object.fromEntries(
          Object.entries(globals.browser).map(([k, v]) => [k.trim(), v]),
        ),
        // Used in type positions only (`React.MouseEvent`, `PermissionName`),
        // which need no import — but `no-undef` cannot distinguish a type
        // reference from a value reference. Declaring them keeps the rule on,
        // and the rule is what catches a prop that was never destructured.
        React: 'readonly',
        PermissionName: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/error-boundaries': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // typescript-eslint's recommended config turns this off, on the assumption
      // that `tsc` runs. We don't run `tsc`, and vite's esbuild strips types
      // without checking them — so a prop declared in an interface but never
      // destructured reaches the browser as a ReferenceError that blanks the
      // whole window. This rule is the only thing that catches it pre-runtime.
      'no-undef': 'error',
    },
  },
);
