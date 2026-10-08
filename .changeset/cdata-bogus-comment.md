---
"@quartz-community/remark-obsidian": patch
---

Fixes the parity harness's visible-text projection dropping a bare `<` run.

The tag strip used `<[^>]*>`, which ate `<]]>`. A browser only opens a tag on `<` plus a
letter, `/`, `!` or `?`, so `<![CDATA[>&<]]>` renders `&<]]>` -- the rule the comment
beside it already stated. No parse change: micromark and the arbiter agree on the node.
