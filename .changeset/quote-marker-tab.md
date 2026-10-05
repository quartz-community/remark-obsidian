---
"@quartz-community/remark-obsidian": patch
---

Read a tab after a quote marker as indentation

`remark-parse@8`'s blockquote tokenizer consumes the `>` and then at most one
**space**. A tab is not a space, so it survives into the quote's content and
supplies a full indent -- four columns, which is an indented code block. Every
construct behind such a marker is therefore code to Obsidian, not just the
footnote definition that led here:

```
>	plain text   -> code
>	# heading    -> code
>	- item       -> code
>	[^1]: def    -> code
```

micromark admits the tab as the marker's own whitespace instead and reads each
line as the construct it looks like.

Verified against the legacy stack Obsidian parses with -- `remark-parse@8` plus
`remark-footnotes@2` -- which reports `blockquote > code` for all four, and
against a recorded `computeMetadataAsync` answer: `>\t[^1]: def` is reported with
no definition at all.

Only a quote whose every content line is marked this way is rewritten; a mixture
would need the lines regrouped into alternating code and prose, and guessing at
that split is worse than leaving it recorded.
