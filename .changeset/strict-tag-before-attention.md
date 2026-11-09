---
"@quartz-community/remark-obsidian": patch
---

Formatting under `strict` no longer renames a tag that emphasis or strong follows in two shapes:

- **A web address opening the emphasis.** `#tag*https://e.test/p*` was written
  `#ta&#x67;*<https://e.test/p>*`, a tag named `ta`. A literal address that opens emphasis,
  strong or strikethrough and ends a word is now written bare, as GFM reads it back.
- **Strikethrough opening the attention.** `#tag**~~del~~**` came back as `#ta&#x67;**~~del~~**`.
  micromark opens attention before a `~` whatever precedes it, so the tag is now written as it is.
