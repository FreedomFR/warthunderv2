// The checks of `npm run lint`: what the tests do not execute can still hold a name that does not exist (a typo, a helper that moved). `no-undef` is an error;
// unused names are warnings (there are some left: they are dead code candidates, not mistakes).
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'naval.html', 'out/**', 'refs/**', '_site/**', 'shots/**'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023, sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, GPUBufferUsage: 'readonly', GPUTextureUsage: 'readonly', GPUShaderStage: 'readonly', GPUMapMode: 'readonly' },
    },
    rules: {
      'no-undef': 'error', 'no-dupe-keys': 'error', 'no-redeclare': 'error', 'no-const-assign': 'error', 'no-unreachable': 'warn', 'no-self-assign': 'warn',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
    },
  },
];
