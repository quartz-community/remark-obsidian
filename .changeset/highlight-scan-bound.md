---
"@quartz-community/remark-obsidian": patch
---

`==highlight==` is no longer quadratic on a long run of `=`.

The decision function needs four characters to reject `=` x20000 -- a closer sitting on the
opener has empty content -- but the chunk scan behind it read to end of input first, once
per opener. Bounding that scan at the two conditions the decider already treats as final
takes 20000 from over 20 seconds to 149ms, and growth from ~4x per doubling to ~1.96x.
