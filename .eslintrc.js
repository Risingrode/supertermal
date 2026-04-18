module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es2021: true,
    node: true,
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 'latest',
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-empty': 'warn',
    'no-undef': 'error',
    'no-constant-condition': 'warn',
  },
  globals: {
    'ccApi': 'readonly',
    'ccState': 'writable',
    'SLASH_COMMANDS': 'readonly',
    'MODE_LABELS': 'readonly',
    'AGENT_LABELS': 'readonly',
    'MODEL_OPTIONS': 'readonly',
    'DEFAULT_CODEX_MODEL_OPTIONS': 'readonly',
    'MODE_PICKER_OPTIONS': 'readonly',
    'THEME_OPTIONS': 'readonly',
    'FitAddon': 'readonly',
    'Terminal': 'readonly',
    'WebglAddon': 'readonly',
    'marked': 'readonly',
    'hljs': 'readonly'
  }
};