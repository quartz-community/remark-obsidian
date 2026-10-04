---
"@quartz-community/remark-obsidian": patch
---

Widen the fuzz generator where no seed count could reach.

Measuring which constructs the generator can emit over 10,000 documents found
two it could **never** produce — embed sizing and autolinks — and two more
under 3%: wikilink aliases at 0.9% and heading targets at 2.8%. Those are
precisely where the known divergences are, so the fuzzer was blindest exactly
where it was needed.

Seed count cannot fix a distribution. The second-field wikilink forms and the
embed parameter forms are now listed explicitly rather than arising by
accident through nesting, and autolinks exist in the grammar at all:

    wikilink alias   0.9% -> 57.8%      embed size   never -> 44.4%
    wikilink heading 2.8% -> 59.7%      autolink     never -> 22.0%
