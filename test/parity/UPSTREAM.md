# Upstream defects found while building this package

Each entry is reproduced on the named package at the version this repo depends on, with
**none of this package loaded**, and carries the control that isolates it. Where we work
around one, the workaround is named — those are guards against upstream behaviour, not
repairs of our own, and they should be removed if the defect is fixed.

Verify any entry before filing: run its snippet against current versions first.

## 1. A rejected opening `---` makes a footnote definition parse as a link reference

**`micromark-extension-frontmatter` 2.0.0** (via `remark-frontmatter` 5, `mdast-util-frontmatter` 2.0.1), with `remark-gfm`.

```js
unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter)
  .parse("---\n[^Note]: alpha\n");
```

|                             | first child     | second child                   |
| --------------------------- | --------------- | ------------------------------ |
| without `remarkFrontmatter` | `thematicBreak` | `footnoteDefinition` id `note` |
| with `remarkFrontmatter`    | `thematicBreak` | **`definition` id `^note`**    |

The `---` is not frontmatter — it has no closer, and both sides agree it is a
`thematicBreak`. But registering the frontmatter extension still changes which construct
wins the **next** line, and the GFM footnote definition loses to CommonMark's link
reference definition. The identifier `^note` is the tell: a link reference swallowed the
caret.

**Controls.** `***\n[^Note]: alpha` is correct with the extension loaded, so it is the
`---` marker specifically, not thematic breaks. `---\na: 1\n---\n[^Note]: alpha` and
`---\n---\n[^Note]: alpha` are both correct, so a frontmatter block that **succeeds** does
no harm — only one the extension attempts and rejects. `text\n\n---\n\n[^Note]: alpha` is
correct, so it must be at the start of the document. Registration order does not matter.

**Workaround here:** `src/lib/lrd-footnote.ts` converts the node back, rebuilding the body
from source because the mis-parse scatters it across `url` and `title`.

## 2. Overlapping sibling positions for a definition before a setext heading

**`mdast-util-from-markdown` / `micromark`**, via bare `remark-parse` 11 + `remark-gfm` 4.

```js
unified().use(remarkParse).use(remarkGfm).parse("[ref]: /url\npara\n===\n");
```

```
definition@0:0-0:11
heading@0:0-2:3      <- starts at 0:0, inside the definition's span
```

Two root siblings overlap: the heading's start is the definition's start, so the definition
is contained in its following sibling. Positions on a tree from one parse should be disjoint
for siblings, and a consumer that splices by offset — `obsidian-linter` does — cannot order
these two edits.

The heading's **content** begins on line 1, which is what its own `children` say; only the
heading node's `position.start` is wrong.

**We DO produce the overlap in our own output.** An earlier revision of this item claimed we
did not. That was wrong, and the measurement is one line:

```
[ref]: /url / bar / ---   →   definition@0-0, heading@0-2
```

The heading starts on line 0, inside the definition that precedes it. We pass upstream's
positions straight through, so of course we reproduce them. The claim had been written from
the premise that a defect filed against upstream is therefore absent downstream, which does
not follow for a position we never rewrite.

`INVARIANT_VIOLATIONS` in `compose.test.ts` already contradicted the prose, recording a
`SIBLINGS OVERLAP: root > definition/heading` row for every composition sequence that hits
this, and asserting the set EXACTLY so the count cannot drift unnoticed. Those rows **must
not reach zero**: rewriting the heading's start to line 1 would make our tree disagree with
every other `remark` consumer about the same document, and parity does not need it.

**Parity is unaffected** because the `headings` projection reads the heading's first child's
line rather than the node's own start, which is where Obsidian's answer lives too. So this is
a tree-shape defect we inherit, NOT a parity defect — those are different things, and the
distinction is why no fix is warranted here.

**Still a live concern for consumers**, which is the part the old wording got backwards: a
splice-by-offset consumer such as `obsidian-linter` sees these overlapping siblings in OUR
output, not merely in bare `remark-parse`'s. Filed for the ecosystem, and worth stating
plainly rather than disclaiming.

## 3. `<...>` autolink shorthand is offered for addresses CommonMark will not autolink

**`mdast-util-to-markdown` 2.2.0** (current), via bare `remark-stringify` 11.

```js
let s = "write a@b_c.com now\n";
for (let i = 0; i < 3; i++) s = String(chain.processSync(s));
```

```
write a@b_c.com now        source
write <a@b_c.com> now      pass 1
write <<a@b_c.com>> now    pass 2
write <<<a@b_c.com>>> now  pass 3
```

Two characters per pass, unbounded. `formatLinkAsAutolink` offers the shorthand whenever a
link's text equals its destination and the scheme matches, but never checks whether
CommonMark would autolink that address. For an email whose domain holds an `_` it will not —
CommonMark's domain labels exclude `_` while GFM's literal autolink accepts it. So the
written `<a@b_c.com>` re-parses as a GFM literal _inside_ literal angle brackets, and the
next pass adds another pair.

**Suggested fix:** validate a `mailto:` target against the email-autolink grammar in
`formatLinkAsAutolink` before offering the shorthand.

**Workaround here:** `src/lib/mdast/autolink-literal-to-markdown.ts` writes the address
bare, which is lossless rather than merely convergent — an address CommonMark rejects cannot
have reached the tree through `<...>`, so the source held a bare literal and a bare literal
re-parses to the identical node.

## 4. An unclosed html block gains line endings on every pass

**`mdast-util-to-markdown` 2.2.0**, via bare `remark-stringify` 11.

```
[^9]: x
    <!--
[^1]: one
-->
```

```
pass 1: "[^9]: x\n\n    <!--\n\n\n[^1]: one\n    \\-->\n"
pass 2: "[^9]: x\n\n    <!--\n\n\n\n\n[^1]: one\n    \\-->\n"
pass 3: "[^9]: x\n\n    <!--\n\n\n\n\n\n\n[^1]: one\n    \\-->\n"
```

Two line endings per pass, unbounded. micromark gives an **unclosed** html block a span that
runs through the line ending after it, so `node.value` ends with `\n`; the handler is
`return node.value || ''` and the block separator writes a line ending too. Written raw the
two add, and because the block is unclosed it re-absorbs the surplus on the next parse.

**Workaround here:** `src/lib/mdast/html-tail-to-markdown.ts` strips trailing line endings
from the value, keeping one when the value is entirely line endings so the block does not
vanish. Interior line endings are content and stay.

## 5. `remark-math` extends a list item past its sibling's start

**`remark-math` 6.0.0** (`micromark-extension-math` 3.1.0, `mdast-util-math` 3.0.0), via bare
`remark-parse` 11.

```
1. Hello $$
   Math
   $$
2.
```

| pipeline                       | items                    |
| ------------------------------ | ------------------------ |
| `remark-parse` alone           | `[0..25]` `[26..28]`     |
| `remark-parse` + `remark-math` | **`[0..28]`** `[26..28]` |

The first item's end moves from 25 to 28, past the second item's start at 26, so two root
siblings of the same list overlap. A consumer splicing by offset cannot order edits across
them.

**Controls.** `- a $$` / `  x` / `  $$` / `- b` behaves identically, so it is not the ordered
marker. And `1. $$` / `   x` / `   $$` / `2.` is **correct** — `[0..16]` and `[17..19]` — so
the trigger is content BEFORE the opener on the item's own line, not the math block itself.

**Workaround here:** `src/lib/list-item-extent.ts` clamps an item's end to the next item's
start. Repaired rather than only reported, unlike item 2 below, because this one appears in
the tree this package ships.

## 9. A whitespace-only line in a footnote definition's fence gains the indent on every pass

**`micromark-extension-gfm-footnote`** with `mdast-util-to-markdown` 2, via bare
`remark-parse` + `remark-gfm` + `remark-stringify`; found by `fuzz/invariant-sweep.ts`.

Input, as a JSON string since the trailing spaces are the point:

```
"[^1]: \n    ~~~~\n    \n"
```

````
pass 1: "[^1]: ```\n        \n    ```\n"
pass 2: "[^1]: ```\n            \n    ```\n"
pass 3: "[^1]: ```\n                \n    ```\n"
````

Four spaces per pass, unbounded. The definition's continuation does not consume the indent of
a whitespace-only line, so the fenced code's `value` is `"    "` -- the container's indent read
as content -- and the writer indents that line again. Reproduced with none of this package
loaded; under `strict` it is inherited as-is. Rare in generated documents (2 seeds of 5,000).

**Worked around in `strict`** (`footnote-code-blank-lines.ts`), on the parse side rather than in
the writer, which would touch every code block. Inside a footnote definition only, a
whitespace-only line of code loses the definition's four columns, which is what micromark
should have consumed. That gives the same `value` remark-parse 8 reads (`a` / `··` / `b` from
`····a` / `······` / `····b`). Every other line, and every other container's indent, was
already consumed correctly. The upstream defect stands.

## 6–8. Obsidian `metadataCache`

These are recorded from the goldens rather than reproduced here, since they need the
application. Each is enumerated in `test/parity/README.md` with its case ids, and each is
classified **must-not-fix** — reproducing them in our own offsets would be strictly worse
than diverging, because a consumer splicing at those offsets would corrupt the file.

**6. A reported column is short by the width of a `%%` marker.** Four rows across
`links`, `embeds` and `footnoteRefs` — `fuzz/embed/24` on two of its rows, plus
`hunt/aftercloser-chain-eats-referenced-definition/0` and
`hunt/continuation-masked-under-foreign-label/2`. The sibling project's author documents
this class as `P1`, so this is corroboration on specific inputs rather than a new finding.

**7. Zero-width `blocks` entries past the end of the document.** `inline ^[^9] real[^7]`
registers `9@3:0-3:0` on a three-line note. The renderer relocates an inline footnote's body
to a trailing section and the `^9` inside it is read as a block identifier **there**, so the
position names a region the author never wrote. Both of the corpus's 72 `blocks` entries
that are zero-width are this.

**8. An embed array is not in source order.** `fuzz/embed/75` lists its second embed first;
24 of the 25 recorded link and embed arrays with two or more entries are source-ordered and
this is the only exception. Its earlier embed sits inside `$...$` inside a callout, so the
renderer resolves it late. The value of the ordering being positional is that a consumer can
rely on it.

## These do not explain the referee's remaining disagreements

Worth stating with numbers, because the claim reads as plausible and is wrong by three
orders of magnitude. Of the **1,609** documents where the referee and this package still
disagree:

| defect                             | can it reach this oracle?         | documents |
| ---------------------------------- | --------------------------------- | --------: |
| `%%` column shortfall (5)          | yes, via a reference column       |     **2** |
| frontmatter `---` interaction (1)  | yes, in principle                 |     **0** |
| overlapping definition/heading (2) | no — neither node is a footnote   |         0 |
| autolink angle growth (3)          | no — serialiser only              |         0 |
| html tail line endings (4)         | no — serialiser only              |         0 |
| zero-width `blocks` (6)            | no — the referee stores no blocks |         0 |
| embed ordering (7)                 | no — the referee stores no embeds |         0 |

Four of the seven cannot appear here by construction: this oracle compares **parse** output,
so both serialiser defects are invisible to it, and it stores only `text`, `defs` and `refs`,
so the two about other node types have nothing to disagree with.

**The frontmatter one is already neutralised.** 56 documents open with a rejected `---`, and
12 of them disagree — 21.4% against a 23.6% base rate, so they fail marginally _less_ than
average. `lrdFootnoteTransform` converts the node back and the defect costs us nothing on
this corpus.

**And the `%%` figure is another base-rate trap**, the fifth of its shape here. 47.1% of
disagreeing documents hold a `%%` against 31.1% of all documents, a lift of 1.52, which
reads as a lead. The actionable count is **2 rows**: the defect is a two-column shortfall,
and only two reference rows are off by exactly two with a `%%` on the line. The lift says
`%%` documents are harder for _us_ — comment extents, regions, freed definitions — not that
Obsidian is wrong about them.

So the remaining 1,609 are ours. They sit in five buckets —

    refSet 560 · both 402 · defSet 320 · defSpan 232 · defCol 102

— and four of the five are measured as **not line-local**, each refutation recorded in
`README.md`: `defCol` has the same prefix carrying opposite deltas, the `defSpan` quote
family scores 91 better against 395 worse, `defSet`'s invented definitions survive no prefix
grouping, and `refSet` is largely a cascade from a definition placed wrongly. All four need
the containing **block**, which this oracle does not store.

That is the honest ceiling on it, and it is a limit of the instrument rather than a count of
what is left to fix. The corpus against real Obsidian is the instrument for the rest, which
the probe wave demonstrated by finding a nested-host column bug the referee provably could
not adjudicate.

## Withdrawn: the harness's own Reading-View correction

Previously listed here as an eighth item: the recorder writes Reading View's `text` into the
golden for the ids in `KNOWN_PROXY_DIVERGENCES`, and that correction appeared not to fire —
`hunt/blockquote-region-outlives-quote/1` and `commonmark/html-blocks/171` came back with
detached-renderer values and were restored by hand after every recording.

**It did not reproduce.** On the recording at 3,391 cases both came back with their correct
corrected values, verified by diffing the whole golden against the previous commit: zero
cases changed. The note was stale, and the hand-restore step is no longer needed.

The separate, real limitation it was confused with is still documented in
`test/parity/README.md`: a corrected `text` is only commensurable when the document reduces
to one block, which is why `commonmark/html-blocks/171` is `accepted` rather than `match`.
That is a property of comparing projections captured from two different DOMs, not a defect
in the correction.
