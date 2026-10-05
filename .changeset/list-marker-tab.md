---
"@quartz-community/remark-obsidian": patch
---

Read a tab after a list marker's separator as indentation

`remark-parse@8`'s list tokenizer consumes the marker and then a single
whitespace. A tab beyond that survives into the item's content and supplies a
full indent -- four columns, an indented code block -- so what follows is code
whatever it looks like:

```
-	item        -> paragraph, the tab is the separator
- 	item        -> code
1. 	item        -> code
- 	[^1]: def   -> code, and so no definition
```

The distinction is the _second_ whitespace: `-\titem` spends its tab separating
the marker, while `- \titem` has already spent a space.

The same shape as the quote-marker rule beside it, verified the same way against
the legacy stack Obsidian parses with. Narrow in practice -- 64 of 6806 recorded
documents hold the shape -- but it is a real divergence against Obsidian's own
parser, so it is closed rather than recorded.
