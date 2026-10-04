---
"@quartz-community/remark-obsidian": patch
---

Treat a multi-line setext heading over a definition as one paragraph.

`H` / `===` / `[^1]: real` is a heading and a definition, but
`para` / `more` / `===` / `[^2]: b` is a single paragraph to Obsidian. The
definition cannot interrupt a paragraph, so with more than one line above it
the paragraph runs on and the underline is just text in the middle.

The discriminator is the number of content lines, and it was found the hard
way: merging on the presence of a following definition alone cost twenty cases
that already matched, every one of them single-line.

Counting those lines needed a second fix. micromark reports a setext heading's
start at the beginning of the block that became it, which can sit _before_ a
link reference definition it never contained — `[ref]: /url` / `para` / `===`
yields a heading whose start offset is 0. Slicing from there counted the
definition as a content line, and would have rebuilt it into the paragraph.
Both setext passes now measure from the heading's children instead, which also
removes that latent corruption from the pass added earlier.

One corpus case.
