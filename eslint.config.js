import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Keep lint focused on this repo's source code (avoid scanning virtualenvs, build output, etc.)
  globalIgnores(['dist', '.next', '.venv/**']),
  {
    // Frontend React code - runs in the browser / client component graph
    files: ['src/**/*.{js,jsx}', 'app/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],

      // These rules are intended for React Compiler / memoization preservation.
      // This project does not rely on React Compiler optimizations, and these rules
      // currently create lots of false-positive errors (e.g., setState in effects).
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },

  {
    // Backend/API scripts - runs in Node (process, Buffer, etc.)
    files: ['api/**/*.{js,jsx}', 'lib/**/*.{js,jsx}', '*.config.js', '*.config.mjs', 'next.config.mjs', 'postcss.config.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])
