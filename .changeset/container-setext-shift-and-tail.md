---
"@quartz-community/remark-obsidian": patch
---

Place a container setext heading's children, and keep what follows the underline

`containerSetextTransform` left its reparsed children numbered from the fragment. That is
worse than it looks: `contentStart` in `setext-underline.ts` deliberately trusts a
heading's children over its own span, so an unshifted child reported offset 0, that pass
read the whole document as the heading's content, counted three lines and demoted the
heading it had just been handed. `- a` / `- b` / `===` lost its heading and came back as a
paragraph spanning the entire source.

The underline also has to be the _second_ line rather than the paragraph being two lines
long. `- item` / `===` / `more` is a heading plus `more`, while a run on the fourth line is
not an underline at all — capping the block conflated the two.
