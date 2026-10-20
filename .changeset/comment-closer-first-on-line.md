---
"@quartz-community/remark-obsidian": patch
---

A block comment's closer is the first `%%` on its closing line.

`commentTailTransform` found the closer with `lastIndexOf("%%")` over the whole comment, which
agrees whenever the closing line holds one `%%` and silently declines when it holds two — the tail
is then empty, so the split never happens:

```
%%
x
%% culpa ex %%
[^1]: def
```

Obsidian closes at the first `%%` of line 3, leaving ` culpa ex %%` as a paragraph that takes lazy
lines, so the label below is lazy text and not a definition. We read the line as a complete inline
pair and defined it.

Searching from the last line ending keeps the opener out of reach, so a single-line `%% a %%` still
lands on offset 0 and is still declined by the existing guard. Six probes against live Obsidian now
agree where five did before.

Footnote agreement moves from 6013/6818 to 6015/6818 with zero regressions, verified by comparing
the agreeing sets by identity. The gain is two documents rather than the twenty-one carrying the
shape, because those also diverge elsewhere; what the change buys is the rule being right.
