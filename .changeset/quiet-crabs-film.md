---
"@quartz-community/remark-obsidian": patch
---

Keep `[^1]: x` a footnote definition when a `---` block precedes it.

Registering `micromark-extension-frontmatter` alongside
`micromark-extension-gfm-footnote` changes which construct wins, and the footnote
definition starts losing to the link reference definition. On its own
`[^Note]: alpha` is a `footnoteDefinition`; after any `---` it becomes a
`definition` with `identifier: "^note"`, so the definition disappears and every
reference to it goes unresolved. It reproduces with official `remark-frontmatter`
in either registration order, so it is an upstream interaction rather than
something this package introduced — worth filing separately.

Converting back is safe rather than a guess: with GFM footnotes enabled a label
opening with `^` is always a footnote definition, never a link reference. The
body is rebuilt from source, because the mis-parse scattered it across the
definition's `url` and `title`. Two corpus cases.
