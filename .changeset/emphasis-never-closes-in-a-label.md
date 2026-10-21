---
"@quartz-community/remark-obsidian": patch
---

Legacy emphasis no longer closes on a delimiter inside a footnote label.

A GFM footnote call requires its name to be defined, so an _undefined_ `[^ch2*]` is not a call at
all — it stays literal text, and `bareFootnoteRefs` recognises it afterwards. That works until the
name contains an emphasis delimiter. `Opening [^ch2*] and [^ch2*]` had the `*` of the first label
pair with the `*` of the second:

```
text("Opening [^ch2")  emphasis  text("] and [^ch2")  text("]")
```

destroying both references, where Obsidian reports both. The same happened with `_` in a name.

Only the _closer_ is tested, which is what makes the rule expressible: the construct is entered at
the marker and its scan materialises only forward, so whether the opener sits inside a label is
not knowable — but it does not need to be. The closer of a cross-label pair is always inside the
second label, which is in the scanned slice. Emphasis that legitimately spans a label is
unaffected: `*a [^x] b*` and `**a [^y*] b**` still form, because their closers are outside any
label.

Differential harness: 6116 → 6131 of 6818 documents with no regressions, references 97.96% →
98.10%.
