---
"@quartz-community/remark-obsidian": minor
---

Parse `~~` the way Obsidian does, via a port of `remark-parse@8`'s delete tokenizer

Obsidian's strikethrough closes on the first `~~` it reaches, honours no escape at
all, and requires a double tilde:

- `~~del\~~` is a `delete` holding `del\`, where GFM reads `\~` as an escaped tilde
  so the closer never forms and the whole run stays literal.
- `]]~~~~` renders `]]`, because `~~~~` is an *empty* delete rather than four tildes.
- `~x~` is literal text; single-tilde strikethrough is a GFM extension Obsidian
  does not have.

New `legacyStrikethrough` option, on by default for the same reason
`legacyEmphasis` is: leaving it off silently produces different strikethrough from
the app.

**Requires `remark-gfm` to be registered before this package.** A combined
micromark extension prepends its constructs, so for a code both claim the
later-registered plugin wins; with gfm second it owns `~` and this option is inert.
`@quartz-community/obsidian-flavored-markdown` therefore needs to order *after*
`@quartz-community/github-flavored-markdown`.

Measured on the recorded corpus: the reorder alone is behaviour-neutral (0 fixed, 0
broken), and the tokenizer on top of it fixes 21 cases with no regression.
