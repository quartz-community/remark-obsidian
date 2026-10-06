---
"@quartz-community/remark-obsidian": patch
---

Place a short-indent-plus-tab line past its own indent

`remark-parse@8` does not count a tab that follows a space, so one to three spaces plus a
tab is content rather than indented code. That line is re-parsed without the whitespace
that never counted, and the result was anchored at the line start rather than past it — so
the content was placed on top of its own indent.

`  \tfoo` reported a paragraph spanning `  \t`, which named the section after the
whitespace and dropped `foo` from it entirely. `  \tfoo\tbaz\t\tbim` lost `bim` the same
way.
