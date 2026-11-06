---
"@quartz-community/remark-obsidian": minor
---

Add `bomOffsets`, off by default. With it on, a leading byte order mark counts in every
position and in `data.lineOffsets`, under both presets, so an offset indexes the string that was
parsed, on every line, with `\n`, `\r\n`, or `\r` line endings. Off, positions stay as they were:
one short after a mark, which is what Obsidian's cache reports.
