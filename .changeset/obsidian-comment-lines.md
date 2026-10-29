---
"@quartz-community/remark-obsidian": patch
---

Under `strict`, `%%` comments, footnote references and callout titles follow Obsidian 1.15.0
more closely:

- A `%%` comment spans lines only when its `%%` opens a line with no other `%` on it, as in
  Obsidian. `a %%x` / `y%% b` and `%%%` / `text` / `%%%` are now plain text, as Obsidian renders
  them, not comments.
- A footnote reference whose definition another rule turned back into text is text too
  (`[^1]: def` / `····[^2]: two` / `use[^2]`). Unchanged with `bareFootnoteRefs`.
- A bare URL in text rebuilt by Obsidian's footnote rules is linked, as GFM links it everywhere
  else (`[^[[https://e.test]]]`).
- `> [!note] &#x20;` is an empty title, as Obsidian displays it, and a callout title holding a
  bare URL no longer takes the lazy line below it.

Formatting keeps more documents as they were:

- An empty callout title over code, a comment or a paragraph is written `> [!note] &#x20;`, so
  it stays empty instead of displaying the type.
- Under `legacy`, a tag straight before emphasis, strong or strikethrough keeps its last
  character, which was written as a character reference (`#ta&#x67;*%%*`).
- Nested emphasis and strong keep their nesting (`_**#a/b**_`, `*_**x**_*`, `**_*x*_**`).
- A `_`, `-` or `/` escaped after a tag stays escaped; emphasis after a tag uses `*`.
- A formula opening a highlight no longer gains a space; a `=` opening one at a line start is
  encoded.
- Under `legacy`, a full reference keeps its label as written (`[x][&amp;]`).
- An empty wikilink alias (`[[a|]]`) is kept.
- A heading of footnote references over two lines is written as setext.
- A block comment ending in `%` closes on its own line.
- A footnote label inside a paragraph keeps its `:` from making a definition.
