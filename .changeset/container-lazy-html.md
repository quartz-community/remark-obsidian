---
"@quartz-community/remark-obsidian": patch
---

Absorb an HTML line as lazy continuation into a list or blockquote

Obsidian does not let an HTML block interrupt a paragraph inside a container, so
`- x` followed by `</div>` is a single list. We ended the list and started an HTML
block, reporting a stray section Obsidian has no equivalent for.

The legacy stack draws the boundary sharply, and it is the container that matters
rather than the construct:

| source            | blocks                                           |
| ----------------- | ------------------------------------------------ |
| `- x` `</div>`    | one `list`                                       |
| `para` `</div>`   | `paragraph` and `html` — html interrupts at root |
| `- x` `` `</div>` | `list` then `html` — the blank line ends it      |

5 cases move from `replicate` to `match` with no regression.
