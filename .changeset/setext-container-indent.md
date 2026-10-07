---
"@quartz-community/remark-obsidian": patch
---

Measure a setext underline's indent from its container

`remark-parse@8` allows no indent before a setext underline, which is why that pass
demotes one. But the indent a list item puts in front of its _own_ underline belongs to
the list — `- item` / `  ===` is a heading to CommonMark and to Obsidian, and demoting it
on two spaces that were never sloppiness cost the heading outright.

Only inside a container: at root an indented paragraph also starts past column one, so
reading the indent off the heading alone made a heading of CommonMark's example 84, which
is a paragraph.
