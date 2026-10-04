import tseslint from "typescript-eslint";
import redos from "eslint-plugin-redos";

/**
 * One job: catch a regular expression that can be made to backtrack
 * catastrophically. This package parses untrusted Markdown with around forty
 * hand-written expressions, several with nested quantifiers over
 * user-controlled input, and a vault note is exactly the kind of input an
 * attacker controls.
 *
 * `recheck` behind this rule does real automaton analysis rather than the
 * star-height heuristic most linters use, so it reports polynomial as well as
 * exponential blow-up. `auto` lets it fall back to fuzzing on patterns the
 * automaton cannot decide; `ignoreErrors: false` makes an undecided pattern
 * fail rather than pass quietly, which is the point of running it at all.
 *
 * Style and correctness linting is deliberately absent — prettier and tsc
 * already own those.
 *
 * Scoped to `src`, which is the whole threat model: shipped code parses a
 * vault note an attacker may have authored. The harness under `test` runs
 * only against the committed corpus, so a quadratic pattern there costs a
 * slower test run rather than a denial of service, and gating it would mean
 * rewriting working projection code for no safety gain.
 */
export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "*.tmp.mts"] },
  {
    files: ["src/**/*.ts"],
    languageOptions: { parser: tseslint.parser },
    plugins: { redos },
    rules: {
      "redos/no-vulnerable": [
        "error",
        {
          checker: "auto",
          timeout: 10_000,
          cache: { strategy: "conservative" },
          ignoreErrors: false,
        },
      ],
    },
  },
);
