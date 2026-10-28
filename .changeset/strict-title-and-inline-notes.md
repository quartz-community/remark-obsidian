---
"@quartz-community/remark-obsidian": patch
---

Three more shapes the invariant fuzzer found, closing its per-push list.

- **Inline footnotes after an unclosed one (`strict`):** an unclosed `^[` stopped every inline
  footnote after it in the whole document from forming. `^[a`, a blank line, then `^[b]` held
  none. A speed-up meant for one paragraph applied to every later offset.
- **Footnote labels (`strict` with `bareFootnoteRefs`):** a label holding `[` is read from its
  first `[^`, as under `legacy`. `[^_[^1]\_]` is one reference named `_[^1`.
- **Callout titles (`strict`):** a formula opened in a callout's title and closed on a lazy line
  above `===` no longer keeps the whole paragraph as the title.
- **`&` after a character reference:** remark-parse 8 reads a bare `&` before punctuation,
  anywhere after a character reference, as that reference's character (`&#65; x &,` reads
  `A x A,`). Formatting escapes such an `&`, including after the `&#x20;` it writes for a
  line's leading spaces.
