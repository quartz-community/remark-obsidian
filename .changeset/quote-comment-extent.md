---
"@quartz-community/remark-obsidian": patch
---

Extend an unclosed `%%` to the end of the quote that opened it

An opener with no closer already runs to the end of the note at the top level.
Inside a quote it has to run to the end of the quote, and the quote's own lazy
continuation makes one case look different — a following line with no marker is
pulled into the quote, so the comment takes it:

```
> %%            one blockquote, the comment holds `[^1]: def`,
[^1]: def       and nothing is defined

> %%            the blank line ends the quote, so the definition
                below it is live
[^1]: def
```

Recorded against Obsidian 1.14.4 rather than reasoned. `%%` is Obsidian's own
construct, so the legacy stack cannot arbitrate it the way it settles a tab or a
fence — and inferring from pattern-matched corpus data had already produced a
wrong rule once. Seven probes isolate the question; all seven now match.

`> %%` / `> [^1]: def` already worked, since a marked line is plainly the quote's
content. Only the unmarked continuation needed this.
