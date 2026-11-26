---
"@quartz-community/remark-obsidian": patch
---

`strict` runs its passes at parse time, as `legacy` does its reading. They re-parse the document and fragments of it (callouts, comments, footnote definitions), so as a transformer they discarded what plugins registered before this one had done to the tree: in Quartz, GitHub-flavored-markdown's SmartyPants and `replacements` were undone in any note holding a callout. `processor.parse()` now returns the finished tree under `strict`; a tree that did not come from this parser is still finished by the transformer.
