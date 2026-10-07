---
"@quartz-community/remark-obsidian": patch
---

Take an html line's setext underline from the next sibling

At root an html block swallows the underline, so both lines sit inside one node. Inside a
container they do not: the html node is just the tag and the run arrives as the next
sibling paragraph — so `- <br>` / `===` found a single line and was skipped, where Obsidian
reports a heading.

The underline must be on the very next line. A blank line ends the container's block, and
the run is then prose of its own.
