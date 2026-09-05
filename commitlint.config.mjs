/**
 * Conventional Commits, enforced by the commit-msg hook.
 *
 *   feat(chat): add streaming response support
 *   fix(auth): resolve session refresh issue
 *   refactor(ai): create provider abstraction layer
 */
const config = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'test', 'docs', 'chore', 'ci', 'build', 'perf', 'style', 'revert'],
    ],
    // Long bodies are encouraged; only the subject line is constrained.
    'body-max-line-length': [0, 'always'],
    'footer-max-line-length': [0, 'always'],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
    'header-max-length': [2, 'always', 100],
  },
};

export default config;
