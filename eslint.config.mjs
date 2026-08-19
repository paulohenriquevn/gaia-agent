// Provisioned by review-cycle quality_gates.py — maximum rigor. Tighten-only.
export default [
  {
    rules: {
      "no-unused-vars": "error", "no-undef": "error", "no-eval": "error",
      "no-implied-eval": "error", "eqeqeq": "error", "no-cond-assign": "error",
      "no-dupe-keys": "error", "no-constant-condition": "error", "no-self-compare": "error",
      "no-var": "error", "prefer-const": "error", "complexity": ["error", 10],
      "max-lines-per-function": ["error", {"max": 50, "skipBlankLines": true, "skipComments": true}],
      "max-params": ["error", 6], "max-depth": ["error", 4],
    },
  },
];
