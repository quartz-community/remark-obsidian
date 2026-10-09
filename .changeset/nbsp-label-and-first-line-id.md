---
"@quartz-community/remark-obsidian": patch
---

A footnote label may hold a no-break space, and a block identifier may sit on a
paragraph's first line.

`\s` matches U+00A0, so the three label patterns silently excluded it and `[^~~ ~~]` was
not read as a reference -- the same trap as `\w` quietly meaning "and underscore". ASCII
whitespace is now written out.

And `*^blk*` over `next` renders just `next`: the host walk only looked at the paragraph's
last segment. Wrapped identifiers only, since an unwrapped `^blk` over `para` keeps its
text.
