---
"@quartz-community/remark-obsidian": patch
---

A footnote definition behind a tab that follows a quote marker no longer defines, even when the
quote also holds ordinary lines. The whole-quote case was already handled; a mixed quote now
converts just the tab-indented definition to the indented code Obsidian reads it as. A
definition separated from the marker by spaces still defines, and a tab-indented one defines
once an earlier space-separated definition in the same quote has established its content
column.
