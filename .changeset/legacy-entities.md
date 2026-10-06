---
"@quartz-community/remark-obsidian": minor
---

Resolve a character reference written without its semicolon

CommonMark requires the terminator, so micromark leaves `&amp` as four characters
where Obsidian renders `&`. The rule is HTML's historical one, and the legacy stack
agrees with the app on every case:

| source  | Obsidian |     | source         | Obsidian |
| ------- | -------- | --- | -------------- | -------- |
| `&amp`  | `&`      |     | `&notreal`     | `¬real`  |
| `&copy` | `©`      |     | `&ampx`        | `&x`     |
| `&#35`  | `#`      |     | `&nosuchthing` | literal  |
| `&AMP`  | `&`      |     | `` `&amp` ``   | literal  |

Named references from HTML's legacy table resolve bare and match **greedily**, which
is why `&notreal` stops after `not`. Numeric references resolve bare too. Anything
outside the table stays literal, and a code span still protects its contents.

New `legacyEntities` option, on by default for the same reason as its neighbours:
leaving it off silently shows markup the app resolves.

The scan is bounded by the longest name in the table rather than reading to end of
file, so a construct on a character as common as `&` cannot become quadratic.

All 14 `probe/entity/*` cases match, from 5.
