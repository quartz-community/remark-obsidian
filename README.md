# remark-obsidian

Quartz's remark plugin for Obsidian.

## Development

```bash
npm test          # unit tests and the Obsidian parity gate
npm run typecheck # both tsconfig projects
npm run format    # prettier check
npm run build
```

### Two presets

`strict` is what Obsidian **intends**: the CommonMark, GFM and LaTeX it says it supports,
plus the syntax it documents adding. `legacy` is what Obsidian **delivers**, divergences
included:

```js
.use(remarkObsidian)                        // legacy, the default
.use(remarkObsidian, { preset: "strict" })  // CommonMark/GFM/LaTeX + Obsidian's syntax
```

|                                                                                                                                                                                                           | `legacy` (default) | `strict` |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------- |
| Obsidian's documented syntax — wikilinks, embeds, callouts, tags, `%%`, `==`, `$`, frontmatter, task boxes holding any character, footnotes — each read as Obsidian reads it, inside quotes and lists too | on                 | **on**   |
| What Obsidian delivers beyond the standards — emphasis, lists, entities, autolinks, code spans, html blocks, link labels, tab arithmetic, task re-parse                                                   | on                 | **off**  |
| Its rendering — an undefined `[^x]` shown without its brackets, a line ending shown as a break                                                                                                            | on                 | **off**  |

**Use `legacy`** for an Obsidian plugin, or for Quartz rendering a vault: the point
is that the output matches what the author saw in the app. It parses with
remark-parse 8 — the parser Obsidian itself forks — plus Obsidian's own readers, so
its tokens and positions are Obsidian's rather than an approximation of them. The
parser is vendored and bundled, and the tree it returns is ordinary mdast with this
package's node types, so downstream remark and rehype plugins work unchanged.

**Use `strict`** for what a note means rather than how one app shows it. Obsidian
says it supports CommonMark, GFM and LaTeX; its emphasis, list, entity, autolink,
code-span, html-block and link-label behaviour departs from them, inherited from
remark-parse 8 and never fixed. `strict` keeps the standards and Obsidian's documented
syntax, and parses with micromark, as `remark-parse` does.

Add the plugin **after** `remark-parse`: under `legacy` it replaces the processor's
parser, and a `remark-parse` added later would put micromark back. Under `legacy`, other
plugins' micromark syntax extensions (`remark-directive`, `remark-frontmatter`, …) are
therefore not consulted, though their transforms still run; use `strict` if you rely on one.

### Options

Every option is a boolean, works under both presets, and wins over the preset's value for it.

| option              | default                               | what it does                                                                                                                                 |
| ------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `preset`            | `"legacy"`                            | `"legacy"` or `"strict"`, as above                                                                                                           |
| `wikilinks`         | on                                    | `[[target#heading\|alias]]` and `![[embed]]` as `wikilink` nodes                                                                             |
| `highlights`        | on                                    | `==text==` as `highlight`                                                                                                                    |
| `tags`              | on                                    | `#tag` as `tag`                                                                                                                              |
| `math`              | on                                    | `$inline$` and `$$display$$`                                                                                                                 |
| `comments`          | on                                    | `%%comment%%`                                                                                                                                |
| `keepComments`      | on                                    | keep a comment as a `comment` node rather than deleting it; it renders as an empty `<obsidian-comment>`, which `rehype-obsidian` removes     |
| `parseComments`     | on                                    | parse a kept comment's body into its `children`, so a reference inside one is a `footnoteReference`                                          |
| `callouts`          | on                                    | `> [!type] Title` as a `callout` holding a `calloutTitle`                                                                                    |
| `inlineFootnotes`   | on                                    | `^[note]` as a `footnote`                                                                                                                    |
| `customTaskChars`   | on                                    | any one character in a task box is a checkbox (`- [-]`), kept as `data.taskChar`                                                             |
| `frontmatter`       | on                                    | a leading `---` block as a `yaml` node                                                                                                       |
| `bareFootnoteRefs`  | on under `legacy`, off under `strict` | Obsidian renders an undefined `[^x]` as `x`; the node stays a `footnoteReference`, and `rehype-obsidian` drops the delimiters when rendering |
| `positionedBreaks`  | on under `legacy`, off under `strict` | a soft line ending becomes a positioned `break`, as `remark-breaks` would make it                                                            |
| `lineOffsets`       | on                                    | `root.data.lineOffsets`: how many columns each line's containers consume                                                                     |
| `escapedLineBreaks` | off                                   | write a `break` back as a trailing backslash rather than a newline, for a chain without `remark-breaks`                                      |

### Upgrading from 1.x

2.0 is a major release, and [the changelog](CHANGELOG.md) lists every change. In short: add the
plugin after `remark-parse`, and expect the new node types (`callout`, `calloutTitle`,
`footnote`, `yaml`, kept `comment`s) and the positioned `break`s that the options above turn on
by default. Turn off any you do not want; `keepComments: false` restores 1.x's deleted
comments. Nothing was removed from the API.

### Obsidian parity

This plugin targets the **reading-mode and `metadataCache` semantics of a specific
public Obsidian release**, with a small set of documented, deliberate divergences
where Obsidian has an acknowledged defect. A harness renders a generated corpus
inside real Obsidian and compares the result against ours, so the claim is measured
rather than asserted — including the divergences, which are enumerated rather than
implied.

`npm test` runs the gate against committed goldens and needs no Obsidian.
Re-recording the goldens does — see [`test/parity/README.md`](test/parity/README.md).
