---
"@quartz-community/remark-obsidian": patch
---

Delimit a display-math block the way Obsidian does

Obsidian parses with `remark-math@3`, whose block tokenizer is not the
code-fence template `micromark-extension-math` follows. The two disagreed about
what the formula _is_, and three rules were read from that tokenizer's source
rather than inferred from samples:

- The opener's remainder is the body's **first line**, not an info string, so
  `$$x^2` is the formula `x^2` where the fence template left the body empty and
  put `x^2` in `meta`.
- A closing `$$` **need not be alone on its line**. It closes when the first `$`
  on the line begins its trailing run, so `$$\nMath$$` is the formula `Math`
  rather than `Math$$`. A backslash does not escape it.
- Only **spaces** are skipped after the opening fence, never tabs, so `$$\t[` is
  the formula `\t[`. The repair reads the source for this reason: `meta` has
  already lost the tab.

The body is read with each line's containers removed, via the `lineOffsets`
table, because `remark-parse@8` strips a quote marker or list indent before its
tokenizer sees the line. Without that a quoted formula gained a `> ` and the
serialiser nested it one level deeper on every formatting pass.

Eleven cases moved from the parity backlog to matching. A same-line `$$x^2$$`
still diverges: the real tokenizer refuses the block outright, since a `$` in
the opener's remainder voids it, and the inline tokenizer produces display math
instead. That needs re-tokenizing rather than repair, so it stays tracked.
