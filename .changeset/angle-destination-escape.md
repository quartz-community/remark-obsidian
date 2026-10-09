---
"@quartz-community/remark-obsidian": patch
---

A backslash is an ordinary character inside an angle-wrapped link destination.

`[link](<foo\>)` is a link whose path is `foo\`: the backslash is literal and the `>`
closes the destination. micromark reads `\>` as an escape, so the destination never
terminates and nothing links. Held to destinations that actually hold a backslash, which
keeps it off the seventeen matching `](<` cases.
