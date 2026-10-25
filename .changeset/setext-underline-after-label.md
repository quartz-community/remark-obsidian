---
"@quartz-community/remark-obsidian": patch
---

A setext underline directly under a footnote label heads the line even when content follows.

`[^1]: x` over `===` is already read as a heading rather than a definition. That only applied
when the definition was exactly two lines, so `[^1]: x` / `===` / `    chunk` kept its
definition — the indented line was absorbed as continuation, where Obsidian ends the definition
at the underline and reads the indented line as a root code block.

The underline is now required to sit directly after the label line, which is what the previous
rule meant, and whatever follows it is re-parsed in place.

    referee 6255 -> 6259
    root code blocks we fail to report   23 -> 20
