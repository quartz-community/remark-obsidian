---
"@quartz-community/remark-obsidian": patch
---

Fix six catastrophically-backtracking regexes, and gate against more.

`eslint-plugin-redos` (recheck, real automaton analysis rather than the
star-height heuristic most linters use) found eleven vulnerable patterns, six
of them in shipped code that parses untrusted vault notes. All were polynomial
rather than exponential, but polynomial is enough:

- `/\s+$/` twice, the classic quadratic trailing scan — every start position
  consumes the whole run before failing at `$`. Both are now `trimEnd`.
- `[ \t]*>?[ \t]*` in the setext underline, and `[ \t]*\|?[ \t]*$` in both
  table delimiter patterns, where a whitespace run can split between the two
  stars in every position. The optional marker now absorbs its own spacing.
- A footnote label scan that could run to end of document, bounded to the line
  it can actually occupy.

The lint is scoped to `src`, which is the whole threat model: the harness runs
only against the committed corpus.
