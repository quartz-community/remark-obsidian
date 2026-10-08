---
"@quartz-community/remark-obsidian": patch
---

A closing `</pre>` now interrupts a paragraph, as it does in Obsidian.

micromark keeps `pre` only in its raw-tag list, which governs opening tags, so a bare
`</pre>` lands on a block type that refuses to interrupt. Obsidian's parser carries `pre`
in its block-tag list. Narrow by measurement: `</script>`, `</style>` and `</textarea>`
stay absorbed, as the arbiter says they should.

Both html block-tag differences now sit behind the new `legacyHtmlBlocks` option, on by
default.
