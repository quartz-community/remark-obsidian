---
"@quartz-community/remark-obsidian": patch
---

Two position and reading fixes on the default path:

- Under `strict`, a leading byte order mark no longer changes how a note is read. The passes
  read the text the offsets index, so a callout, a definition or a comment behind a mark reads
  as it does without one.
- Under `legacy`, a note with `\r\n` line endings no longer misplaces a block on a callout's
  empty title line (`> [!note] [^1]: def`): its start was shifted once per node sharing it.
