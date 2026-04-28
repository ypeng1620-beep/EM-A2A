import tseslint from 'typescript-eslint'
import js from '@eslint/js'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      '**/dist/',
      '**/artifacts/',
      '**/cache/',
      '**/typechain-types/',
      'contracts/',
      'cli/',
      'scripts/',
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
)
