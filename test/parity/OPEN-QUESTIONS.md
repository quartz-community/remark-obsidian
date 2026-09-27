# Questions for the Obsidian team, and their answers

**Answered 2026-09-27.** Q1–Q6 have replies from the team, recorded verbatim in
each section. Q7 is still open. The triage states in `goldens/obsidian.json` have
been updated to match.

| Q   | Subject                       | Answer                                           | Triage               |
| --- | ----------------------------- | ------------------------------------------------ | -------------------- |
| Q1  | Tag after inline construct    | Known problem                                    | `report-upstream`    |
| Q2  | Heading metadata raw source   | Deferred to Licat, undecided                     | `upstream-undecided` |
| Q3  | `$$…$$` display math anywhere | Bug; `$$` should work only on its own line/block | `report-upstream`    |
| Q4  | Whitespace-only wikilink      | File a forum bug report                          | `report-upstream`    |
| Q5  | Nested wikilink precedence    | Undecided; editor and reading mode diverge       | `upstream-undecided` |
| Q6  | `===text==`                   | Obsidian is wrong; ours is CommonMark-correct    | `report-upstream`    |
| Q6b | `==text ==` / `== text==`     | Neither should highlight — **we** are wrong      | `replicate`          |
| Q7  | Task-body reparse status      | No answer yet                                    | `report-upstream`    |

Behaviours found by the parity harness that we need clarified before deciding
whether to reproduce them. Observed in **Obsidian 1.13.7** (installer 1.13.7,
Linux) unless a section says otherwise.

Cases where Obsidian is right and we are wrong are listed at the end and need no
input; they are ours to fix.

## Surfaces

Every observation below names the surface it was taken from, because they are not
interchangeable and a finding on one does not imply the same on another. All three
are legitimate evidence; conflating them is what is not.

| Surface           | What it is                                                 | Who consumes it                      |
| ----------------- | ---------------------------------------------------------- | ------------------------------------ |
| **Reading view**  | The rendered DOM from `MarkdownRenderer` / a preview leaf. | Readers, and static-site generators. |
| **metadataCache** | `getFileCache`, `resolvedLinks`, `unresolvedLinks`.        | Plugins, and this package's callers. |
| **UI pane**       | Backlinks, Outline, Graph, autocomplete.                   | Users, directly.                     |

For a parser like this one, **metadataCache discrepancies are first-class** — it is
the surface plugin authors actually read, and it is what the harness compares. A
UI pane is a derived view that may filter or aggregate, so a metadataCache finding
must not be restated as a claim about a pane without opening that pane.

Two corrections already caused by ignoring that distinction, recorded so they are
not repeated:

- `metadataCache.headings` storing raw markdown was reported as breaking
  `[[Note#Heading]]` navigation. It does not: `resolveSubpath` matches both the raw
  and the rendered form. The metadataCache finding stands; the navigation claim was
  wrong.
- `getBacklinksForFile` including a self-reference was reported as the Backlinks
  pane showing a note as its own backlink. Unverified — the pane was never read.
  The API finding stands; the pane claim was withdrawn.

---

## Q1 — `#` starts a tag after any inline construct, but not after plain text

**Surface: reading view and metadataCache — they agree. KNOWN: previously
reported, never triaged as a bug.**

Prior reports:

- [Reding mode: incorrectly detects a tag when attached to another inline block](https://forum.obsidian.md/t/reding-mode-incorrectly-detects-a-tag-when-attached-to-another-inline-block-tag-wikilink-bold-etc/82901)
  (2024-06-03, Obsidian 1.5.12) covers both halves of this: a tag recognised after
  an inline construct, and `#tag#you` splitting into two tags. Filed in Help rather
  than Bug reports, a staff member said they would check with the team, and the
  thread auto-closed after inactivity with no resolution. Note the title's
  misspelling of "Reding" when searching.
- [Tags not clickable if at the beginning of bold/italic/... string](https://forum.obsidian.md/t/tags-not-clickable-if-at-the-beginning-of-bold-italic-string/3046)
  (2020-07-10, Obsidian 0.7.6) is the inverse case — a tag at the _start_ of bold
  is not recognised — and carries the clearest statement of the intended rule, from
  staff: "Hashtags require space or beginning of line right before it…"

Still reproducible on 1.13.7 and 1.14.2, and no 1.12–1.14 release note addresses
it.

```md
foo#next
(foo)#next
foo.#next
```

None of the above produce a tag. All of the following do produce tag `next`:

```md
a[[target]]#next
a%%c%%#next
a==t==#next
a$x$#next
a`c`#next
a**b**#next
```

And `#` also terminates a tag, so a run produces two:

```md
#tag#tag
```

yields tags `tag` and `tag`.

Each construct case is prefixed with a word deliberately, to rule out the
alternative explanation that the construct is removed and `#` ends up at the
start of the line. The tag still forms with the prefix present.

**Ambiguity.** The boundary looks like a _node_ boundary rather than a
_character_ boundary: `)` and `.` do not enable a tag, but the end of a code
span or a bold run does. That is consistent with the tag scanner restarting on
each text node rather than with an intended rule, and it is not described in the
[tag format documentation](https://help.obsidian.md/Editing+and+formatting/Tags#Tag+format).

**Question.** Is tag-after-inline-construct intended, or an artefact of
per-text-node scanning?

**Impact on us.** We currently require whitespace or start-of-line before `#`,
so we produce no tag in all six construct cases. If this is intended we mirror
it. If it is an artefact we would rather not bake it into a parser that several
plugins depend on.

---

## Q2 — Heading metadata keeps raw inline syntax

**Surface: metadataCache. KNOWN at the UI level, and staff have called it a
current limitation rather than a bug — do not file.**

Prior reports:

- [Render text in Outline pane instead of showing the raw markdown](https://forum.obsidian.md/t/render-text-in-outline-pane-instead-of-showing-the-raw-markdown-reading-mode-rendering-publish-on-this-page/5341)
  (2020-09-06) is the canonical long-standing feature request for exactly this
  source-versus-rendered heading distinction.
- [Inline LaTeX in headings breaks in the "ON THIS PAGE" section of Obsidian Publish](https://forum.obsidian.md/t/inline-latex-in-headings-breaks-in-the-on-this-page-section-of-obsidian-publish/106198)
  (2025-09-27) drew a staff reply that Markdown and LaTeX are deliberately not
  rendered in the Outline, in both the app and Publish.

No report names `metadataCache.headings[].heading` specifically, and the API types
declare it only as `string` without saying whether it is source or rendered — so it
is undocumented rather than contradicted. Given staff have already characterised
the visible behaviour as a limitation, an API-level report would likely get the
same answer.

Navigation is unaffected — see the retraction below.

| Source         | `metadataCache` heading name | Renders as    |
| -------------- | ---------------------------- | ------------- |
| `# [[target]]` | `[[target]]`                 | a link        |
| `# ==text==`   | `==text==`                   | a highlight   |
| `# $x^2$`      | `$x^2$`                      | rendered math |
| `# %%text%%`   | `%%text%%`                   | **empty**     |

Rendering resolves all four correctly. `metadataCache.headings` retains the raw
source.

**Retraction.** This was first reported as breaking `[[Note#Heading]]`. It does
not. `resolveSubpath` resolves both forms against a `# **bold**` heading:

| Subpath     | Result   |
| ----------- | -------- |
| `#bold`     | resolves |
| `#**bold**` | resolves |

Verified on 1.14.2. Heading navigation works, so there is no user-facing breakage.

**What remains.** A plugin reading `metadataCache.headings[].heading` receives raw
markdown, so anything building a table of contents renders `**bold**` literally
rather than as bold text. This affects standard CommonMark — `# **bold**`,
`` # `code` ``, `# *italic*` — not only Obsidian-specific syntax.

The `%%hidden%%` row is the odd one: the heading renders as empty in reading view
while still carrying a metadata name.

**Question.** Should heading metadata store the rendered text rather than the
raw source?

**Impact on us.** Currently treated as an upstream bug and not mirrored.

---

## Q3 — `$$…$$` is display math in every context, which appears to contradict the documented supported forms

**Surface: reading view and metadataCache `sections` — they agree.**

All of the following render as **display** math:

```md
$$E=mc^2$$
```

```md
- $$x^2$$
```

```md
# $$x^2$$
```

```md
$$ $$
```

```md
$$$$x^2$$
```

The last renders display math followed by the literal text `x^2$$`.

Note that the enclosing section type stays `paragraph`, `list`, or `heading` in
each case. Only delimiters on their own lines produce an actual `math` section,
so this is display _styling_ applied inline rather than promotion to a block.

**Ambiguity.** [This forum reply](https://forum.obsidian.md/t/block-math-syntax-discrepancy-between-editor-and-reading-mode-latex/113922)
states that the only supported block-math forms are `text $$x+1$$ text` and `$$`
on its own lines, and that other forms should not be interpreted as block math.
But `$$x^2$$` inside a list item and inside a heading _is_ rendered as display
math.

**Question.** Is `text $$x+1$$ text` intended to mean "display math rendered
inline"? And is the same treatment inside headings and list items intended, or
unintended?

**Impact on us.** This is the root cause of
[remark-obsidian#4](https://github.com/quartz-community/remark-obsidian/issues/4)
and 18 sibling cases. If the behaviour is intended, one rule change resolves all 19. If not, we need to know which contexts are canonical.

---

## Q4 — A whitespace-only target self-links, while an empty one is plain text

**Surface: reading view and metadataCache — they agree. Reported as a bug.**

Reading view, which is where this is user-visible:

| Source   | Reading view                                             |
| -------- | -------------------------------------------------------- |
| `[[]]`   | plain text                                               |
| `[[ ]]`  | `<a data-href="" href="" class="internal-link">` — empty |
| `![[]]`  | plain text                                               |
| `![[ ]]` | **the note embedded into itself**                        |

metadataCache, which is what plugins read:

| Source        | `resolvedLinks` | `unresolvedLinks` |
| ------------- | --------------- | ----------------- |
| `[[]]`        | `{}`            | `{}`              |
| `[[ ]]`       | itself, count 1 | `{}`              |
| `[[   ]]`     | itself, count 1 | `{}`              |
| `[[\t]]`      | itself, count 1 | `{}`              |
| `![[ ]]`      | itself, count 1 | `{}`              |
| `[[#h]]`      | itself, count 1 | `{}`              |
| `[[page]]`    | `page`, count 1 | `{}`              |
| `[[missing]]` | `{}`            | `missing`         |

`[[ ]]` reaches the same "current file" path that a bare-subpath `[[#h]]` link
legitimately uses, which is presumably how the self-reference arises.

**Not verified: the Backlinks pane.** `getBacklinksForFile` includes the
self-reference, but an earlier claim that the pane displays it was withdrawn — the
pane was never actually read, and a control case with a genuine backlink also read
as empty, so the probe was unsound rather than the pane being filtered.

**Impact on us.** We adopt trimming regardless. Filed as a bug, so the recorded
`links: [{ path: "" }]` case should be triaged `report-upstream` rather than
`replicate` once confirmed.

---

## Q4b — `[[|alias]]` produces an unresolved link named `|alias`

**Surface: metadataCache. Graph node not independently verified.**

```md
[[|alias]]
```

The alias separator is not honoured when the path is empty, so the entire
`|alias` string becomes the link target:

- `getFileCache().links` → `{ link: "|alias", original: "[[|alias]]" }`
- `unresolvedLinks` → `{ "|alias": 1 }`

Unlike Q4 this **is** visible in the graph, as an unresolved node literally named
`|alias`. It is also creatable by accident: typing `[[` then an alias before the
target name.

**Question.** Should an empty path before `|` be rejected, or should the pipe
still split so the target is empty and self-resolves per Q4?

**Impact on us.** We currently produce no link here. We will follow whichever
behaviour is intended, but this one looks like a genuine defect.

---

## Q5 — Nested wikilinks resolve inner-first

**Surface: reading view and metadataCache — they agree.**

```md
[[A[[B]]]]
```

links to `B` and renders as `[[AB]]`.

**Question.** Is inner-wins the intended precedence?

**Impact on us.** We currently produce path `A[[B`, which is wrong under any
answer. We only need to know the correct target.

---

## Q6 — `===text==` highlights `=text`

**Surface: reading view.**

```md
===text==
```

produces a highlight whose content is `=text`.

For contrast, these do **not** highlight:

```md
==text ==
== text==
```

and this one does, spanning the line break:

```md
==a
b==
```

The whitespace rules are symmetric and sensible. The three-`=` case looks like
the opening delimiter greedily consuming two characters and leaving the third as
content.

**Question.** Is the `=text` content from `===text==` intended?

**Impact on us.** A one-line change either way; we would rather not encode an
accident.

---

## Q7 — Status of the reading-mode task-body reparse

**Surface: reading view.**

```md
- [ ] 1.
- [ ] 1) text
- [ ] - bullet
- [ ] > quote
```

In reading mode each task body is reparsed as block markdown, nesting an `<ol>`,
`<ol>`, `<ul>`, and `<blockquote>` respectively inside the task item. Live
Preview renders all four flat. Already reported on the forum against 1.14 early
access.

**Question.** Is a fix planned?

**Impact on us.** Currently marked as an upstream bug and deliberately not
mirrored, since reproducing it would mean reproducing a divergence between
Obsidian's own two renderers. We just want to avoid mirroring something that is
about to change.

---

## Not questions — our bugs, fixing regardless

Listed so none of these are mistaken for requests for adjudication.

| Source                    | Obsidian                 | We currently produce      |
| ------------------------- | ------------------------ | ------------------------- |
| `$5 and $10`              | no math                  | math — **live bug**       |
| `[[ page ]]`              | path `page`              | path `" page "` untrimmed |
| `==text ==`               | not a highlight          | a highlight               |
| `== text==`               | not a highlight          | a highlight               |
| `%%%%text%%`              | text `text%%`            | text `ext%%` — off-by-one |
| `![[![[target]]`          | embed of `target`        | embed of `![[target`      |
| `![[image.png\|100x100]]` | display text `image.png` | display text `100x100`    |

The currency case is the highest priority: it affects anyone writing prices in a
note, and it is independent of all the math questions above.

---

## Notes

Two findings that need no action, recorded to avoid re-investigation:

- **The empty-comment bug is fixed in 1.13.7.** `# H1` / `%%%%` / `# H2` keeps
  both headings in metadata. Earlier reports described this as fixed in 1.13.2;
  confirmed.
- **Highlight whitespace handling is symmetric.** Leading and trailing spaces
  both disable the highlight; there is no asymmetry between `==text ==` and
  `== text==`.

One capability note relevant to future recordings: Obsidian **1.14** exposes the
LaTeX source in `data-latex` on `mjx-math`, while 1.13 and earlier discard it
irrecoverably. Recording against 1.14 lets the harness assert math _content_
rather than only display-vs-inline, which surfaced three further divergences
(`$$\nMath$$`, `$$x^2` unclosed, and `$$x^2\nx^2$$` all mis-delimit on our side).
