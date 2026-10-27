---
"@quartz-community/remark-obsidian": major
---

`preset: "legacy"` — the default — now parses with remark-parse 8, the parser Obsidian itself
forks, instead of correcting micromark towards it. `preset: "strict"` parses with micromark, as
`remark-parse` does.

The parser is vendored and bundled; nothing new is installed. The result is still ordinary
mdast with this package's node types (`wikilink`, `highlight`, `tag`, `comment`, `callout`,
`calloutTitle`, `footnote`), so every remark and rehype plugin downstream keeps working.

**Closer to Obsidian.** Against Obsidian's own recorded answers, footnote definitions and
references now agree on 6,828 of 6,844 documents (from 6,307), and node positions are
Obsidian's: every recorded section and heading start and end matches, against 97% and 94%
before.

**`strict` is what Obsidian intends:** the CommonMark, GFM and LaTeX it says it supports, plus
the syntax it documents — including task boxes holding any character (`- [-]`, `- [?]`), which
Obsidian documents as checkboxes and `strict` now reads the same way. Where those standards are
silent about Obsidian's own syntax, `strict` reads it as Obsidian does, inside quotes and lists
too; everything else Obsidian's parser merely does — tab arithmetic, lazy-line and list quirks —
is `legacy`'s alone. Its tree matches `remark-parse` and `remark-gfm` on every
CommonMark and GFM spec example except the seven that hold Obsidian syntax and the two task
lists, where it adds `data.taskChar`.

- **Footnotes** are in neither spec, so `strict` reads them as Obsidian does where `remark-gfm`
  differs. A label directly under a paragraph is more of that paragraph, not a definition. A
  `2.` line continues a definition's text, while a table, a link reference definition or a
  setext underline ends it. A label may hold `[` and a backslash escapes nothing in it. A `[^`
  label that is not a footnote's is plain text, not a link reference definition.
- **A `%%` comment** ends at its closing `%%`, and the text after it takes the lines below it,
  in a quote or list item too. An opener on a lazy line of a quote or list item ends that
  container. Left open in one, a comment takes the lazy lines below it, up to a blank line or a
  line that starts a block. A `%%` line directly under a footnote definition's text is more of
  that text.
- **A callout's title line stands alone:** the line under it starts a fresh block, and text after
  the marker is read as blocks, so a definition there is found by its references.
- **A highlight crossing emphasis** goes to whichever opened first, as in Reading view:
  `**a==b**c==` is bold, `==a**b==c**` highlighted.
- **Inside `^[ … ]`** a footnote reference is text.
- **A tag starts** at a line's start, after whitespace, or right after a construct -- a bracket
  pair counting as one whether or not it is defined, so `[x]#tag` holds a tag. Against literal
  text it does not: `a*#tag`, `&amp;#tag`, `x]#tag` and `##tag` hold none.
- **A footnote label after a task box** is a definition inside the task item:
  `- [ ] [^1]: note`.
- **A frontmatter closer with text after it** still closes the frontmatter, and the text is read
  as Markdown: `---[^1]: note` defines.
- **A `---` opener followed by spaces or a tab** opens no frontmatter.
- **`$$`** delimits display math as in LaTeX, including `$$x^2` on one line and a closing `$$`
  at the end of a line. Left open in a quote or list item, a bare `$$` takes the lazy lines
  below it, while `$$y` there is text. A `$$` after a callout's marker is the title's text.
- **`[[` straight after a bracket pair** is no wikilink: `a [x][[w]] b` holds none, and **`[^x]`
  there** is no footnote reference: `a [text][^9] b` is text.
- **`[^x](u)`** is a link to `u` wherever an inline link forms, whether or not `[^x]` is
  defined.
- **A footnote label holding a `|`** directly under a table written without leading pipes is
  another row of that table.
- **An inline footnote** continues over a lazy line.

**Tree shapes that changed in `legacy`,** each to what Obsidian reports:

- A block's position starts at its line, indentation included (` ### foo` starts at column 1).
- A `%%` comment's `children` are its body read as inline content, so a footnote label inside
  one is a `footnoteReference` — the reference Obsidian indexes there.
- A `%%` that is not at the start of its line pairs only with a `%%` on the same line.
- `$$ … $$` inside a quote or list item is display `inlineMath` whose value keeps its line
  endings.
- `root.data.lineOffsets` is remark-parse 8's own table (a task box now counts).
- A `#` after another `#` starts no tag: `##tag` holds none, and `#a##b` only `#a`.
- `processor.parse()` alone returns the finished tree; nothing is left for `run()`.

**Formatting is stable.** Parsing and writing back with `remark-stringify` now reaches a fixed
point on every recorded case, and `$$` display math is written back as display math.

**Security.** Published remark-parse 8 contains HTML tag expressions that backtrack
exponentially — a 205-character line took over four minutes to parse — and quadratic
expressions in two of its helpers. The vendored copy replaces them with linear equivalents,
proven identical on every recorded document and on millions of generated inputs, and the
legacy reader stays linear on every pathological input the test suite covers. `strict` is gated
on the same inputs, and a run of `]` — which made `remark-gfm`'s footnote reader quadratic,
32,000 of them taking 23 seconds — is linear there.
