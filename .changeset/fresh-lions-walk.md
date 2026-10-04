---
"@quartz-community/remark-obsidian": patch
---

Require a block comment's opener line to hold no other percent sign.

Measured against Obsidian: `%% 50%` and `%%%` are ordinary paragraphs, so an
opener is not simply "a line beginning with `%%`" — any further `%` on that
line disqualifies it. Container prefixes still come first, since `> %%` opens
one inside a quote.

This also, correctly, stops a self-closing `%% a %%` from being treated as a
block region; that is an inline comment and belongs to the text construct.

Two cases move to matching. Two more from the same rule remain: an unclosed
`%%` still opens a region through the micromark construct, which needs the
check inside the tokenizer rather than in the region pass.
