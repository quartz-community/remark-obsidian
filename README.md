# remark-obsidian

A [remark](https://github.com/remarkjs/remark) plugin that parses Markdown the way
[Obsidian](https://obsidian.md) does: wikilinks and embeds, callouts, `==highlights==`,
`#tags`, `%%comments%%`, math, footnotes and inline footnotes, frontmatter and custom task
boxes — with Obsidian's tokens and positions, measured against the app itself. It is the
Markdown parser behind [Quartz](https://quartz.jzhao.xyz)'s Obsidian support.

## Install

```bash
npm install @quartz-community/remark-obsidian
```

## Usage

```js
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkObsidian from "@quartz-community/remark-obsidian";

const markdown = "A [[note|link]], ==a highlight== and a #tag.\n";
const processor = unified().use(remarkParse).use(remarkGfm).use(remarkObsidian);
const tree = processor.runSync(processor.parse(markdown), markdown);
```

Add the plugin **after** `remark-parse`: under `legacy` it replaces the processor's parser,
and a `remark-parse` added later would put micromark back. Under `legacy`, other plugins'
micromark syntax extensions (`remark-directive`, `remark-frontmatter`, …) are therefore not
consulted, though their transforms still run; use `strict` if you rely on one. Under `strict`,
pass the source to `run`, as above: its passes read it.

The result is ordinary mdast with this package's node types — `wikilink`, `highlight`, `tag`,
`comment`, `callout`, `calloutTitle`, `footnote` — so downstream remark and rehype plugins work
unchanged, and `remark-stringify` writes every one of them back. Rendering them to HTML is the
renderer's job: in Quartz, its `obsidian-flavored-markdown` transformer and
`@quartz-community/rehype-obsidian`. With plain `remark-rehype` they fall back to generic
elements.

## Two presets

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
| What Obsidian delivers beyond the standards — emphasis, lists, entities, autolinks, code spans, html blocks, link labels, tab arithmetic                                                                  | on                 | **off**  |
| Its rendering — an undefined `[^x]` shown without its brackets, a line ending shown as a break                                                                                                            | on                 | **off**  |

**Use `legacy`** for an Obsidian plugin, or for Quartz rendering a vault: the point is that
the output matches what the author saw in the app. It parses with remark-parse 8 — the parser
Obsidian itself forks — plus Obsidian's own readers, so its tokens and positions are
Obsidian's rather than an approximation of them. The parser is vendored and bundled; nothing
extra is installed.

**Use `strict`** for what a note means rather than how one app shows it. Obsidian says it
supports CommonMark, GFM and LaTeX; its emphasis, list, entity, autolink, code-span,
html-block and link-label behaviour departs from them, inherited from remark-parse 8 and never
fixed. `strict` keeps the standards and Obsidian's documented syntax, and parses with
micromark, as `remark-parse` does. `*a**` is literal text under `legacy`, as in Obsidian, and
emphasis followed by `*` under `strict`, as in CommonMark.

## Options

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

## Upgrading from 1.x

2.0 is a major release, and [the changelog](CHANGELOG.md) lists every change. In short: add the
plugin after `remark-parse`, and expect the new node types (`callout`, `calloutTitle`,
`footnote`, `yaml`, kept `comment`s) and the positioned `break`s that the options above turn on
by default. Turn off any you do not want; `keepComments: false` restores 1.x's deleted
comments. Nothing was removed from the API.

## Obsidian parity

This plugin targets the **reading-mode and `metadataCache` semantics of a specific public
Obsidian release**, currently 1.14.5. A harness renders a generated corpus inside real Obsidian
and compares the result against ours, so the claim is measured rather than asserted —
including the divergences, which are enumerated rather than implied:

- **`legacy` matches Obsidian on all 3,469 recorded cases marked to match**, of 3,471. The other
  two are a rendering difference between Obsidian's own two renderers and an embed that
  resolves a note into itself.
- **On 6,844 notes whose footnote answers Obsidian's cache recorded**, `legacy` agrees on 6,830,
  down to every definition's and reference's exact start and end offsets. The 14 left are
  places where the cache misplaces a fact or the answers' recording added one.
- **`strict` matches `remark-parse` and `remark-gfm`** on every CommonMark and GFM spec example
  except eight: six that hold Obsidian syntax, and two task lists where it adds
  `data.taskChar`. It answers 513 live probes
  about Obsidian's syntax and footnotes as Obsidian does, bar a few recorded exclusions.

## Development

```bash
npm test          # unit tests and the Obsidian parity gates
npm run typecheck # both tsconfig projects
npm run lint      # src only
npm run format    # prettier check
npm run build
```

`npm test` runs the gates against committed goldens and needs no Obsidian. Re-recording the
goldens does — see [`test/parity/README.md`](test/parity/README.md).
