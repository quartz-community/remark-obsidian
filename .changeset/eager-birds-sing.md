---
"@quartz-community/remark-obsidian": patch
---

Make a footnote reference inside `^[...]` inert, and count the ones inside `%%`.

Two rules from the Footnotes Shortcuts author's list, both confirmed against
recorded goldens, and both invisible until the `metadataCache` oracle was
turned on.

GFM binds `[^1]` to its definition wherever it sits, so `^[see [^1]]` arrived
holding a live reference. Obsidian records none for that document, and the
inline note renders as a single marker. The node becomes the text it was
written as, which loses nothing. Only footnote constructs are demoted —
whether emphasis inside an inline note is also inert has no case behind it
yet, so it is left alone.

Conversely Obsidian _does_ index a reference written inside a `%%` comment,
even though nothing renders it. Our tree keeps a comment as one opaque value,
so the metadata projection reads references out of it rather than walking for
them.

Eleven cases move to matching: the two from the list, plus nine already in
the backlog that shared the comment cause.
