---
"@quartz-community/remark-obsidian": patch
---

The highlight scan is now linear on a long run of `==` openers after whitespace (`==a ==a ==a `),
under either preset. Each opener used to read to the end of the run, testing all it had read at each
`==`. No tree changes. One limit stays under `strict`: over many lines (`==a\n`), parsing is still
superlinear in micromark's `resolveAllText`, as `&&a\n` is with no plugin.
