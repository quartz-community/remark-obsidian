---
"@quartz-community/remark-obsidian": patch
---

An email autolink literal is written back bare instead of gaining a pair of angles.

`mdast-util-to-markdown` offers `<...>` shorthand whenever a link's text equals its
destination, without checking that CommonMark would actually autolink that address. For a
domain holding `_` or a trailing `-` it will not, so `write a@b_c.com now` became
`write <a@b_c.com> now`, whose re-parse leaves the angles as text and gains another pair
every pass.

An address CommonMark rejects cannot have arrived through `<...>`, so the source held a
bare literal and writing it bare is lossless as well as stable. Upstream bug, confirmed at
`mdast-util-to-markdown@2.2.0`.
