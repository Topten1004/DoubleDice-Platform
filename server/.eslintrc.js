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
    '@typescript-eslint/member-delimiter-style': 'error',
    'quote-props': ['error', 'as-needed'],
    'comma-dangle': ['error', 'always-multiline'],
  },
  env: {
    node: true,
  },
};
