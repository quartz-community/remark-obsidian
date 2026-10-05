---
"@quartz-community/remark-obsidian": patch
---

Show an email autolink without its scheme.

Obsidian renders `<mailto:a@e.test>` as `a@e.test`, and only `mailto:` is
dropped — `<https://x>` keeps `https://`. The projection kept the scheme for
both, which put 33 fuzz-reduced cases behind one wrong display string.
