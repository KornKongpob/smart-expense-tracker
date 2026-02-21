import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Keep lint focused on this repo's source code (avoid scanning virtualenvs, build output, etc.)
  globalIgnores(['dist', '.venv/**']),
  {
    // Frontend (Vite/React) - runs in the browser
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
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

      // Project preference: allow inline SVG React components in constants/presets files.
      // React Refresh rule is helpful, but it is noisy in this codebase.
      'react-refresh/only-export-components': 'off',
    },
  },

  {
    // Backend/API scripts - runs in Node (process, Buffer, etc.)
    files: ['api/**/*.{js,jsx}', '*.config.js', 'vite.config.js'],
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
