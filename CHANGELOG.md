## 2.0.1

### Patch Changes

- 7e7bedd: Shorten the package description to fit npm's 255-character limit, which cut the 2.0.0 one off
  mid-word.

## 2.0.0

### Major Changes

- bf2a689: Parse Markdown the way Obsidian does, with two presets.

  `preset: "legacy"`, the default, is what Obsidian **delivers**. It parses with remark-parse 8,
  the parser Obsidian itself forks, plus Obsidian's own readers, so its tokens and positions are
  Obsidian's rather than an approximation of them. `preset: "strict"` is what Obsidian
  **intends**: the CommonMark, GFM and LaTeX it says it supports, plus the syntax it documents
  adding. It parses with micromark, as `remark-parse` does.

  The parser is vendored and bundled; nothing new is installed. The result is still ordinary
  mdast with this package's node types (`wikilink`, `highlight`, `tag`, `comment`, `callout`,
  `calloutTitle`, `footnote`), so every remark and rehype plugin downstream keeps working.

  **Upgrading from 1.x**

  - **Add the plugin after `remark-parse`.** Under `legacy` it replaces the processor's parser,
    so other plugins' micromark syntax extensions (`remark-directive`, `remark-frontmatter`, …)
    are not consulted; their transforms still run. Use `strict` if you rely on one.
  - **New behaviour is on by default**, each with an option to turn it off:
    - `frontmatter`: a leading `---` block is a `yaml` node.
    - `callouts`: `> [!type] Title` is a `callout` holding a `calloutTitle`.
    - `inlineFootnotes`: `^[ … ]` is a `footnote` node.
    - `keepComments`: a `%%` comment stays in the tree as a `comment` node instead of being
      deleted, rendered as an empty `<obsidian-comment>` that `rehype-obsidian` removes.
      `keepComments: false` restores 1.x.
    - `parseComments`: a kept comment's body is also parsed into its `children`, so a footnote
      reference inside one is a `footnoteReference`.
    - `positionedBreaks`: a soft line ending becomes a positioned `break`, as `remark-breaks`
      would make it. Off under `strict`; turn it off for a chain without `remark-breaks`.
    - `bareFootnoteRefs`: Obsidian renders an undefined `[^x]` as `x`. The reference stays a
      `footnoteReference` in the tree, so formatting writes `[^x]` back unchanged;
      `rehype-obsidian` drops the delimiters when rendering. Off under `strict`.
    - `lineOffsets`: `root.data.lineOffsets` holds remark-parse 8's table of how many columns
      each line's containers consume.
  - **A line break is written back as a newline**, not a trailing backslash, because this
    package is built for a chain with `remark-breaks`. `escapedLineBreaks: true` writes a
    backslash.
  - **`processor.parse()` returns the finished tree** under `legacy`; nothing is left for
    `run()`.
  - New exports: `RemarkObsidianPreset`, `RemarkObsidianFlags`, `COMMENT_ELEMENT`,
    `inlineFootnoteSyntax`, `calloutTransform`, `commentTailTransform`,
    `bareFootnoteRefTransform`, `mathDisplayTransform`. Nothing was removed.

  **Closer to Obsidian.** Against Obsidian's own recorded footnote answers, definitions and
  references agree on 6,830 of 6,844 documents, against 984 for 1.1.0. Of the 14 left, 10 are
  places where Obsidian's cache misplaces a fact and our position is the true one. The other 4
  are references that only the answers' recording correction holds, inside code or an unclosed
  fence. In those 6,830
  documents every definition and reference also has Obsidian's exact start and end offsets, as
  do all 869 recorded inline footnotes. Every recorded section and heading starts and ends where
  Obsidian says. `legacy` matches Obsidian's rendered output on all 3,469 recorded cases marked
  to match.

  **What `strict` keeps.** Its tree matches `remark-parse` and `remark-gfm` on every CommonMark
  and GFM spec example except the six that hold Obsidian syntax and the two task lists, where
  it adds `data.taskChar`. Obsidian's own syntax is read as Obsidian reads it, inside quotes and
  lists too, wherever the standards say nothing about it. Tab arithmetic, lazy-line and list
  quirks, and every other departure Obsidian's parser makes from the standards are `legacy`'s
  alone. In detail:

  - **Task boxes** hold any character (`- [-]`, `- [?]`), as Obsidian documents, with the
    character kept as `data.taskChar`.
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
  - **A callout's title line stands alone:** the line under it starts a fresh block, and text
    after the marker is read as blocks, so a definition there is found by its references.
  - **A highlight crossing emphasis** goes to whichever opened first, as in Reading view:
    `**a==b**c==` is bold, `==a**b==c**` highlighted.
  - **Inside `^[ … ]`** a footnote reference is text.
  - **A tag starts** at a line's start, after whitespace, or right after a construct. A bracket
    pair counts as a construct whether or not it is defined, so `[x]#tag` holds a tag. A tag
    never starts against literal text: `a*#tag`, `&amp;#tag`, `x]#tag` and `##tag` hold none.
  - **A footnote label after a task box** is a definition inside the task item:
    `- [ ] [^1]: note`.
  - **A frontmatter closer with text after it** still closes the frontmatter, and the text is read
    as Markdown: `---[^1]: note` defines.
  - **A `---` opener followed by spaces or a tab** opens no frontmatter.
  - **`$$`** delimits display math as in LaTeX, including `$$x^2` on one line and a closing `$$`
    at the end of a line. Inside a quote or list item, a `$$` ending a line of text opens display
    math, and the text before it keeps its formatting. Left open in a quote or list item, a bare
    `$$` takes the lazy lines below it, while `$$y` there is text. A `$$` after a callout's
    marker is the title's text.
  - **`[[` straight after a bracket pair** is no wikilink: `a [x][[w]] b` holds none. Likewise
    **`[^x]` there** is no footnote reference: `a [text][^9] b` is text.
  - **`[^x](u)`** is a link to `u` wherever an inline link forms, whether or not `[^x]` is
    defined.
  - **A footnote label holding a `|`** directly under a table written without leading pipes is
    another row of that table.
  - **An inline footnote** continues over a lazy line.

  **Tree shapes under `legacy`,** each matching what Obsidian reports:

  - A block's position starts at its line, indentation included: ` ### foo` starts at column 1.
  - A `%%` that is not at the start of its line pairs only with a `%%` on the same line.
  - `$$ … $$` inside a paragraph, quote or list item is `inlineMath` with `data.display: true`,
    rendered with `math-display`, and its value keeps its line endings.
  - A `#` after another `#` starts no tag: `##tag` holds none, and `#a##b` holds only `#a`.

  **Formatting is stable.** Parsing and writing back with `remark-stringify` reaches a fixed point
  on every recorded case. Callouts are written back as their blockquote. An aliased wikilink in a
  table cell escapes its `|`. `$$` display math is written back as display math. Task lists and
  `%%` comments no longer throw `runSync finished async` in a processor holding an asynchronous
  plugin, as Quartz's does.

  **Security.** Published remark-parse 8 contains HTML tag expressions that backtrack
  exponentially — a 205-character line took over four minutes to parse — and quadratic
  expressions in two of its helpers. The vendored copy replaces them with linear equivalents,
  proven identical on every recorded document and on millions of generated inputs. The `legacy`
  reader stays linear on every pathological input the test suite covers. `strict` is tested
  against the same inputs. A run of `]`, which made `remark-gfm`'s footnote reader quadratic
  (32,000 of them took 23 seconds), is linear there.

## 1.1.0

### Minor Changes

- cfe8d89: Add helpers for finding wikilinks and embeds in a tree.

  `collectWikilinks(tree, { embedded })` returns wikilink nodes in document order,
  optionally filtered to embeds or plain links. `collectEmbedPaths(tree)` returns
  the target of every embed, covering both `![[target]]` wikilinks and mdast's own
  `image` nodes, deduplicated and in document order. `isWikilink` and `isEmbed`
  are exported as type guards.

  Consumers previously had to hand-roll a visit and know that `embedded === true`
  is what separates an embed from a link, so that rule was duplicated in every
  dependent. It now lives in the package that defines the node.

  Because these walk the tree rather than the source text, content inside fenced
  and inline code is excluded structurally: it parses to `code` nodes and is never
  visited.

## 1.0.0

### Major Changes

- Stable 1.0 release. All `@quartz-community/*` dependencies now use `^1.0.0` ranges.

  Pre-1.0 caret ranges pinned the minor version (`^0.2.1` means `>=0.2.1 <0.3.0`), so
  published fixes to shared packages could never be resolved by dependents. Moving the
  ecosystem to 1.0 makes caret ranges behave conventionally.
