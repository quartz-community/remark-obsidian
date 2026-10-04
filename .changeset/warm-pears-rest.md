---
"@quartz-community/remark-obsidian": patch
---

Record 29 cases from the Footnotes Shortcuts author's deviation list.

An independent list of places Obsidian deviates from stock remark-parse 8 +
remark-footnotes 2 + remark-math 3. Every callout point in it was already
confirmed by goldens recorded here, which is why the rest is recorded rather
than taken on trust.

16 of the 29 documents were not in the corpus at all, despite 2182 cases —
an outside reader of the same problem found surface two sweeps and a spec
import had missed. 17 already match; 12 diverge and are triaged with their
source, covering block structure after a callout marker, leading-pipe style
in tables, the tail of a frontmatter closing line, two `%%` opener rules, and
whether anything inside `^[...]` stays live.
