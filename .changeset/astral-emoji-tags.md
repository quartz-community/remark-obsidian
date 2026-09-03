---
"@quartz-community/remark-obsidian": patch
---

Tokenize tags that begin with a non-BMP emoji. `isTagChar` tested each UTF-16
code unit against `\p{L}\p{M}\p{Emoji}`, but an astral emoji arrives as two lone
surrogates (`Cs`), so `#📚/status/finished` was rejected at its first character
and never became a tag.
