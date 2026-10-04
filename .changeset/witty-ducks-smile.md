---
"@quartz-community/remark-obsidian": patch
---

Add pathological-input tests, run in a watchdog process.

A catastrophic regex or a quadratic tokenizer blocks the thread, so no
same-thread timer — vitest's included — can interrupt it. Each shape is parsed
in its own process that the parent kills after a generous budget, which is the
model cmark uses for the same job.

Eighteen shapes, taken from cmark's `pathological_tests.py` and the issues
behind it at the sizes those reported, plus the same shapes aimed at this
package's own constructs. Attribution is measured by running each with and
without this plugin, so an upstream limit is never mistaken for ours.

Two are ours and quadratic, and are recorded rather than gated: a 20,000-long
`=` run takes the bare chain 26ms and ours over 20s, and `^[` repeated 20,000
times takes 160ms bare and 21s ours. Both are an opener that rescans to end of
input on every failure. Five more shapes fail identically without this plugin
and belong upstream.
