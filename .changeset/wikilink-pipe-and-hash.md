---
"@quartz-community/remark-obsidian": patch
---

Two wikilink target rules, matching Obsidian.

- A leading `|` is a path character, not an alias separator: `[[|b]]` is a link to `|b`,
  where we produced no link at all. Obsidian only splits where the split leaves a target
  behind.
- A backslash does not escape the fragment separator: `[[a\#b]]` is a link whose target is
  `a\` and whose heading is `b`. Inside a wikilink a backslash is an ordinary character,
  never an escape — the same rule `|` and `]` already followed.

A resolved target still drops a backslash that touches the closer, so `[[target\]]`
resolves to `target` and `[[a#^blk\]]` to `^blk`. An alias never does.
