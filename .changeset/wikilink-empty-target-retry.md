---
"@quartz-community/remark-obsidian": patch
---

An empty wikilink target does not close the link

`[[]]]` is a link to `]` in Obsidian: an empty target is not a link, so the first
bracket is taken into the target and the next two close it. We rejected at the first
`]` instead and found no link at all.

The distinction is a consumed-character count rather than emptiness of the span, which
is what keeps the neighbours intact:

| source  | Obsidian                                           |
| ------- | -------------------------------------------------- |
| `[[]]`  | no link — the scan runs out                        |
| `[[]]]` | a link to `]`                                      |
| `[[ ]]` | a link with an empty path — a space is a character |

4 cases move from `replicate` to `match` with no regression.
