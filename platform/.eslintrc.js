module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    quotes: ['error', 'single'],
    semi: ['error', 'always'],
    'no-multiple-empty-lines': 'error',
    indent: ['error', 2],
    'quote-props': ['error', 'as-needed'],
  },
  env: {
    node: true
  },
};
