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

Where Obsidian and CommonMark disagree, pick which one you want:

```js
.use(remarkObsidian)                        // legacy, the default
.use(remarkObsidian, { preset: "strict" })  // CommonMark/GFM-compliant
```

|                                                                                                                                                                                       | `legacy` (default) | `strict` |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------- |
| Obsidian syntax — wikilinks, embeds, callouts, tags, `%%`, `==`, `$`, frontmatter                                                                                                     | on                 | **on**   |
| Obsidian's inherited divergences — emphasis, lists, entities, autolinks, code spans, html blocks, link labels, task re-parse, bare footnote refs, soft breaks, custom task characters | on                 | **off**  |

**Use `legacy`** for an Obsidian plugin, or for Quartz rendering a vault: the point
is that the output matches what the author saw in the app. It parses with
remark-parse 8 — the parser Obsidian itself forks — plus Obsidian's own readers, so
its tokens and positions are Obsidian's rather than an approximation of them. The
parser is vendored and bundled, and the tree it returns is ordinary mdast with this
package's node types, so downstream remark and rehype plugins work unchanged.

**Use `strict`** off-platform. Obsidian's extensions are the reason to use this
package, but its emphasis, list, entity, autolink, code-span, html-block and
link-label behaviour are divergences it inherited from remark-parse 8 and has not
fixed — reproducing those outside Obsidian helps nobody. `strict` parses with
micromark, as `remark-parse` does.

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
