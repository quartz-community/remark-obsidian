---
"@quartz-community/remark-obsidian": patch
---

Formatting keeps a document's words in the shapes the invariant fuzzer still found. Of 31 of
600 generated documents whose words changed on format, one is left.

- **Callout titles kept no escapes.** `> [!note] *em\*` came back as emphasis, and `\[[b]]` as a
  wikilink.
- **Tags:**
  - A tag after a bracket pair (`a [x]#t`) or after leading whitespace (`[^1]:     #tag`) was
    lost.
  - `\\#t`, a tag after an escaped backslash, keeps its tag.
- **Highlights:** a `=` just before a highlight's closer is written as `&#x3D;`. Obsidian's
  closer scan ignores escapes, so `==mark` / `=` closed one character early.
- **Inline footnotes:** a `]` inside one (`^[a\]b]`) and wikilink brackets inside one
  (`^[[[[[target]]]]]`) no longer end it early or leave it open. A `^` before a footnote
  reference is escaped so it does not open an inline footnote.
- **Emphasis (`legacy`):** an emphasis ending in `*` is written with `_`. remark-parse 8 cannot
  close `*\*em\**`.
- **Block comments:** a comment straight under a paragraph is written with its closer on its own
  line, so it stays a block.
- **Math:**
  - A formula opening on a line ending, an empty formula (`$$$$`), a formula padded with
    whitespace (`$$⇥x$$`), and `$a\$ $b$` are each written so they read back the same.
  - A literal backslash before an encoded space, and a `&` after leading whitespace (which
    remark-parse 8 drops after `&#x20;`), keep their characters.
- **`strict` parsing:**
  - A callout title followed by lazy lines that read alone as a setext heading kept the whole
    paragraph as its title. It now ends at its line, as in Obsidian.
  - A formula opened by a title's `$$` stays title text.
  - With `bareFootnoteRefs` on, no footnote reference is made inside a literal URL
    (`https://e.test/p[^1]`), as under `legacy`.
