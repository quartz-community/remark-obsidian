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

|                                                                                                                                                                                                             | `legacy` (default) | `strict` |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------- |
| Obsidian's documented syntax — wikilinks, embeds, callouts, tags, `%%`, `==`, `$`, frontmatter, task boxes holding any character                                                                            | on                 | **on**   |
| What Obsidian delivers beyond the standards — emphasis, lists, entities, autolinks, code spans, html blocks, link labels, task re-parse, where footnote definitions and `%%` comments end inside containers | on                 | **off**  |
| Its rendering — an undefined `[^x]` shown without its brackets, a line ending shown as a break                                                                                                              | on                 | **off**  |

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
parser, and a `remark-parse` added later would put micromark back. The feature
options (`wikilinks`, `comments`, `math`, `callouts`, …) work under both presets.

### Obsidian parity

This plugin targets the **reading-mode and `metadataCache` semantics of a specific
public Obsidian release**, with a small set of documented, deliberate divergences
where Obsidian has an acknowledged defect. A harness renders a generated corpus
inside real Obsidian and compares the result against ours, so the claim is measured
rather than asserted — including the divergences, which are enumerated rather than
implied.

`npm test` runs the gate against committed goldens and needs no Obsidian.
Re-recording the goldens does — see [`test/parity/README.md`](test/parity/README.md).
