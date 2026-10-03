# CommonMark and GFM divergences in Obsidian's Markdown parser

Obsidian's documentation states support for CommonMark, GitHub Flavored Markdown
and LaTeX. This is a measured record of where the reading-view parser departs from
the first two, intended for the Obsidian team.

Scope note: `[[wikilinks]]`, `==highlights==`, `%%comments%%` and `$math$` are
Obsidian extensions, so the specs have nothing to say about what they mean. They
appear here only under Group G, where a spec rule (backslash escaping) still
governs them.

## Method

Each case was rendered with `MarkdownRenderer.render` inside a real Obsidian
instance. The CommonMark column is the output of `remark-parse` + `remark-gfm` +
`remark-rehype`, used as a reference implementation — not a reading of the spec
prose. Every HTML fragment below is measured output from one side or the other, with
`<p>` wrappers and `dir` attributes stripped for width.

Each emphasis divergence was checked in both directions: Obsidian differs from the
reference, **and** our own parser agrees with the reference. That second check
passed for **26 of 26** cases, which is what makes "Obsidian diverges" the right
description rather than "the two implementations differ".

Measured on Obsidian **1.13.7** and **1.14.2**. All divergences are byte-identical
on both; across the whole probe the only difference between the two versions is a
cosmetic `data-highlight=""` attribute added to `<mark>` in 1.14.2.

Coverage comes from a 490-case differential corpus (`corpus.ts`) that crosses each
delimiter shape with 13 container contexts and 12 trailing-character variants. 26
cases are emphasis divergences; 408 of the 490 agree with Obsidian exactly.

## Probable common root cause

The 1.14.2 bundle contains `blockTokenizers`, `interruptParagraph` and
`options.pedantic` — the API surface of **legacy `remark-parse` (v8/v9)**, which
predates that project's micromark rewrite. Those releases implemented emphasis with
a pre-CommonMark tokenizer rather than CommonMark's delimiter-run and flanking
algorithm, which would account for Groups A through E together. `a_b_c` is handled
correctly, so `pedantic` appears to be off.

Stated as inference, not certainty: the tokenizer names are visible in the bundle,
the configuration is not. It does fit the team's description of these as
long-standing behaviour.

## Group A — emphasis flanking is not applied (CommonMark 6.2)

CommonMark 6.2 requires a left-flanking delimiter run to not be followed by
whitespace. Obsidian opens emphasis anyway, so asterisks and underscores used as
ordinary prose characters get consumed.

| input       | CommonMark  | Obsidian                |
| ----------- | ----------- | ----------------------- |
| `a * b * c` | `a * b * c` | `a <em> b </em> c`      |
| `a * b* c`  | `a * b* c`  | `a <em> b</em> c`       |
| `a *b * c`  | `a *b * c`  | `a <em>b </em> c`       |
| `a* b *c`   | `a* b *c`   | `a<em> b </em>c`        |
| `a _ b _ c` | `a _ b _ c` | `a <em> b </em> c`      |
| `**a ** b`  | `**a ** b`  | `<strong>a </strong> b` |

This group has the widest practical reach, because it affects text containing no
emphasis at all — arithmetic, shell globs, and asterisks used as footnote markers.
`5 * 3 * 2 = 30` renders as `5 <em> 3 </em> 2 = 30`.

## Group B — leftover emphasis delimiters are placed inside the span (CommonMark 6.2)

When a delimiter run is longer than its partner, CommonMark leaves the surplus
characters outside the emphasis. Obsidian moves them inside, and in three shapes
declines to emphasise at all.

| input         | CommonMark                                     | Obsidian                                |
| ------------- | ---------------------------------------------- | --------------------------------------- |
| `***a**`      | `*<strong>a</strong>`                          | `<strong>*a</strong>`                   |
| `**a***`      | `<strong>a</strong>*`                          | `<strong>a*</strong>`                   |
| `***a*`       | `**<em>a</em>`                                 | `<em>**a</em>`                          |
| `*a***`       | `<em>a</em>**`                                 | `*a***`                                 |
| `*text**`     | `<em>text</em>*`                               | `*text**`                               |
| `_text__`     | `<em>text</em>_`                               | `_text__`                               |
| `___a__`      | `_<strong>a</strong>`                          | `<strong>_a</strong>`                   |
| `****text**`  | `**<strong>text</strong>`                      | `*<strong>*text</strong>`               |
| `**text****`  | `<strong>text</strong>**`                      | `<strong>text**</strong>`               |
| `****a****`   | `<strong><strong>a</strong></strong>`          | `*<strong>*a**</strong>`                |
| `*****a*****` | `<em><strong><strong>a</strong></strong></em>` | `<strong>*</strong>a<strong>*</strong>` |

`*****a*****` is the clearest signal that the underlying algorithm is not
CommonMark's: each emphasised span contains a literal asterisk, and the letter `a`
sits outside both of them as plain text.

## Group C — emphasis and strong nest in the opposite order (CommonMark 6.2)

| input     | CommonMark                    | Obsidian                      |
| --------- | ----------------------------- | ----------------------------- |
| `***a***` | `<em><strong>a</strong></em>` | `<strong><em>a</em></strong>` |
| `___a___` | `<em><strong>a</strong></em>` | `<strong><em>a</em></strong>` |

Purely structural — the rendered text is identical, so this is invisible until
something reads the tree. It matters for any tool that round-trips or rewrites
Markdown.

## Group D — overlapping delimiter runs resolve differently (CommonMark 6.2)

| input           | CommonMark                                | Obsidian                                  |
| --------------- | ----------------------------------------- | ----------------------------------------- |
| `*a **b* c**`   | `<em>a <em><em>b</em> c</em></em>`        | `<em>a **b</em> c**`                      |
| `**a **b** c**` | `<strong>a <strong>b</strong> c</strong>` | `<strong>a </strong>b<strong> c</strong>` |

In the second case Obsidian produces two sibling spans where CommonMark produces one
containing the other, so the emphasised **text** differs, not just the tree shape.

## Group E — an escaped closing delimiter suppresses emphasis entirely (CommonMark 6.1)

`\*` is a literal asterisk, which leaves the remaining delimiter free to pair.
CommonMark emphasises; Obsidian emits no emphasis and drops the backslash.

| input                | CommonMark             | Obsidian            |
| -------------------- | ---------------------- | ------------------- |
| `**a\**`             | `*<em>a*</em>`         | `**a**`             |
| `**text\**`          | `*<em>text*</em>`      | `**text**`          |
| `\**text\**`         | `*<em>text*</em>`      | `**text**`          |
| `**text` ⏎ `text\**` | `*<em>text text*</em>` | `**text<br> text**` |

## Group F — task list item bodies are re-parsed as blocks (GFM 5.3)

GFM 5.3 keeps the content after a task marker as the list item's inline content.
Obsidian re-parses it as block content, so a body that happens to look like a list
or quote marker produces nested blocks.

| input           | GFM                       | Obsidian                              |
| --------------- | ------------------------- | ------------------------------------- |
| `- [ ] 1.`      | task item, text `1.`      | task item containing a nested `<ol>`  |
| `- [ ] > quote` | task item, text `> quote` | task item containing a `<blockquote>` |

## Group G — backslash escapes ignored before extension delimiters (CommonMark 6.1)

CommonMark 6.1 makes any backslash-escaped ASCII punctuation character literal, so
an escaped delimiter character should not be able to close a construct. Three of
Obsidian's four extension delimiters close anyway.

| input         | expected under 6.1    | Obsidian                             |
| ------------- | --------------------- | ------------------------------------ |
| `[[target\]]` | literal, no link      | internal link, anchor text `target\` |
| `==text\==`   | literal, no highlight | `<mark>text\</mark>`                 |
| `%%text\%%`   | literal, visible text | comment, content hidden              |
| `$x\$`        | literal, no math      | literal `$x$` — **conformant**       |

The last row is the useful part: inline math honours the escape while wikilinks,
highlights and comments do not. Since all four are Obsidian's own constructs, that
asymmetry looks like independent implementations rather than a deliberate rule,
which is why we are raising it rather than mirroring it.

Version note: we could not bisect this further. It is identical on 1.13.7 and 1.14.2,
so it is not new in 1.14; confirming whether it changed at 1.13.x or earlier needs
older builds than we have.

## Conformant

Recorded so the report is not one-sided. Of 25 targeted spec cases 15 match the
reference exactly, and 408 of the 490 corpus cases agree with Obsidian:

- Backslash escapes: `\*`, `\_`, `\[`, `` \` ``, `\~`, `\|` inside a table cell, and
  `\` before a non-punctuation character
- `$x\$` (Group G's exception)
- Intraword delimiters: `a_b_c` produces no emphasis, while `a*b*c` does
- Ordinary nesting: `**a *b* c**`, `*a **b** c*`, `**a _b_ c**`
- Emphasis correctly shielded by code spans, fenced code, indented code and HTML
  blocks, and correctly parsed inside headings, list items, ordered items, task
  items, nested lists, blockquotes and table cells
- GFM table cell counts, **both** rules: excess cells in an over-long row are
  discarded, and a short row is padded with an empty cell
- Hard line break from two trailing spaces
- ATX heading closing sequence: `# heading #`
- A double-backtick code span containing a literal backtick, interior spaces intact:

```text
`` a ` b ``
```

## Bearing on `@quartz-community/remark-obsidian`

Recorded here because it sets which of the above we intend to match.

Groups A through E affect CommonMark's own emphasis, and mirroring them would change
how ordinary prose parses, so we would rather not — a formatter such as
`obsidian-linter` acting on that basis could rewrite documents that every other
CommonMark tool reads correctly. All 26 corpus cases are therefore triaged
`report-upstream`, with our own output pinned so the divergence cannot drift
silently. Group F is already mirrored, being narrow and specific to Obsidian's own
task handling. On Group G we are waiting on the team, because the inline-math
exception suggests the current behaviour is unintended.
