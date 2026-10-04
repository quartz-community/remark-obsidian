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
reference, **and** our own parser agreed with the reference. That second check
passed for **26 of 26** cases, which is what makes "Obsidian diverges" the right
description rather than "the two implementations differ".

Those 26 are now deliberately reproduced rather than left divergent — see
[Bearing on `@quartz-community/remark-obsidian`](#bearing-on-quartz-communityremark-obsidian).
The tables below are the original measurement and still describe Obsidian against
the CommonMark reference; they are no longer a description of our own output.

Measured on Obsidian **1.13.7** and **1.14.2**. All divergences are byte-identical
on both; across the whole probe the only difference between the two versions is a
cosmetic `data-highlight=""` attribute added to `<mark>` in 1.14.2.

Coverage comes from a 1122-case differential corpus (`corpus.ts`) that crosses each
delimiter shape with 13 container contexts and 12 trailing-character variants. 26
cases are emphasis divergences; 1032 of the 1122 agree with Obsidian exactly.

## Common root cause

The 1.14.2 bundle contains `blockTokenizers`, `interruptParagraph` and
`options.pedantic` — the API surface of **legacy `remark-parse` (v8/v9)**, which
predates that project's micromark rewrite. Those releases implemented emphasis with
a pre-CommonMark tokenizer rather than CommonMark's delimiter-run and flanking
algorithm. `a_b_c` is handled correctly, so `pedantic` is off.

This began as inference from the names visible in the bundle. It is now
**confirmed by construction**: porting `remark-parse@8.0.3`'s `strong.js` and
`emphasis.js` verbatim, with `pedantic` off, reproduces Obsidian on **all 26**
divergences in Groups A through E, including shapes no rule-of-thumb would
predict — `*****a*****`, `****a****` and `**a\**` among them. A one-line
behavioural summary cannot produce those; the actual algorithm can.

The specific defect those tokenizers carry is a loop that reads ahead two
characters (`value.charAt(index + 2)` in `strong.js`) while advancing the cursor
by one, so a character can be examined twice and appended to the output buffer
twice. That is what puts the surplus delimiter _inside_ the span in Group B.

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
asymmetry looks like independent implementations rather than a deliberate rule.

Reproducing it exposed a second asymmetry inside the first, which is sharper
evidence for the same conclusion. For highlights the escape is honoured on an
**opening** run and ignored on a **closing** one, and ignored on the closer only
while a highlight is actually open:

| input        | Obsidian             | reading                            |
| ------------ | -------------------- | ---------------------------------- |
| `==text\==`  | `<mark>text\</mark>` | closer: escape ignored             |
| `\==text==`  | `==text==`, no mark  | opener: escape honoured            |
| `\==text\==` | `==text==`, no mark  | nothing open, so both are honoured |

A single rule — "the escape does not apply to this delimiter" — cannot produce
all three. The behaviour is what a scanning tokenizer does when it looks for a
closer without re-checking escapes, and it is unlikely to be deliberate.

Version note: we could not bisect this further. It is identical on 1.13.7 and 1.14.2,
so it is not new in 1.14; confirming whether it changed at 1.13.x or earlier needs
older builds than we have.

## Conformant

Recorded so the report is not one-sided. Of 25 targeted spec cases 15 match the
reference exactly, and 1032 of the 1122 corpus cases agree with Obsidian:

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

**Groups A through E are reproduced**, behind the `legacyEmphasis` option, which is
on by default. The package's contract is to parse a document the way Obsidian
parses it, and emphasis is not an area where a consumer can absorb a difference:
a vault rendered by Quartz has to break its lines and bold its words where Obsidian
does, or the published page is not the note. Leaving these divergent was also not
the neutral choice it first appears — it silently produced different emphasis from
the app for any unbalanced run, which is most of Group B.

The implementation is a verbatim port of the two legacy tokenizers rather than a
reimplementation of their observable behaviour, for the reason given under
[Common root cause](#common-root-cause): the output is not summarisable, so
anything short of the original algorithm would match the easy cases and quietly
miss the rest. `legacyEmphasis: false` restores micromark's CommonMark attention
for consumers that want spec behaviour.

Group F is likewise mirrored, being narrow and specific to Obsidian's own task
handling.

**Group G's escape handling is mirrored as well**, including the asymmetry. The
earlier plan was to wait for the team, on the reasoning that the inline-math
exception suggests the behaviour is unintended — but that conflates two separate
questions. Whether Obsidian should change is for the team; whether this package
reproduces today's Obsidian is not, and the answer is the same as everywhere else
in compat mode. A note whose `[[target\]]` resolves in the app has to resolve
here too, however the app came to decide that. Reporting it and reproducing it
are independent, and both are now done.

What remains `report-upstream` is the narrower set this package does not yet
reproduce for implementation reasons rather than policy: over-long opening runs
for highlights and display math (`====text==`, `$$$$x^2$$`). Those four keep
their pinned output so the divergence cannot drift silently.
