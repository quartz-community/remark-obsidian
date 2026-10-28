---
"@quartz-community/remark-obsidian": patch
---

Formatting a document keeps what it says, and stops.

Found by a new invariant fuzzer over generated documents under every preset and option set:

- `$$a\$$b$$` grew by five characters on every format, and `$a\$ $b$` turned into display
  math: the math writer lengthened the fence past escaped `$` runs. A formula whose `$` runs
  are all escaped is written back with the fence it was read with.
- `\%%note%%`, `\==mark==` (mid-line) and `\#tag` lost their escape when formatted, turning
  text into a hidden comment, a highlight or a tag. They are escaped where they would form one.
  `C#` and `page#section` are left alone.
- `[[target\]]` was written back as `[[target]]`. The backslash Obsidian drops when it resolves
  the target now goes back where the author wrote it.
- Under `strict`, an inline footnote spanning lines (`^[a` / `b]`) lost its line ending, so
  formatting joined the two words.
- Under `strict` with `bareFootnoteRefs` on, as Quartz passes it, three shapes grew without
  bound: a footnote label reaching past a line ending (no longer a reference, since a label
  holds no whitespace), and text after a reference rebuilt from the raw source, keeping an
  escape's backslash or a list's indent.
