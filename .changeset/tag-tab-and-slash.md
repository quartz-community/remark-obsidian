---
"@quartz-community/remark-obsidian": patch
---

Recognise a tag after a tab, and allow slash-shaped tag paths

Two independent bugs in the tag tokenizer, both measured against Obsidian 1.14.4:

- **A tab before `#` did not start a tag.** micromark expands a tab into
  `horizontalTab` plus `virtualSpace` fillers up to the next tab stop, so the code
  immediately before the `#` is the filler rather than the tab. `rd⇥#tag` yielded
  nothing while `rd #tag` tagged correctly.
- **A slash needed a tag character after it, and did not count as a non-digit.** So
  `#a/`, `#a//b` and `#123/456` were all rejected, though Obsidian reads each as a
  tag. A slash is now ordinary content and satisfies the non-digit requirement,
  which keeps `#123` correctly _not_ a tag.

10 cases move from `replicate` to `match` with no regression, and the positioned
oracle's `tags` divergences drop from 16 to 6.
