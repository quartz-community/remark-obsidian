---
"@quartz-community/remark-obsidian": patch
---

A backtick line indented four or more columns is code, not a fence.

The adjacent-indented-code merge excluded fenced blocks by matching `/^[ \t]*(?:```|~~~)/`, which
also matches a line that merely _looks_ like a fence while being indented code. CommonMark makes a
fence indented four or more columns indented code instead, so the bound is three:

````
    ```
Text `[^x]`
[^1]: body text
    ```
````

That is one indented code block whose first line is backticks, and the guard refused to merge it.
Four of the six remaining same-lines-different-grouping documents were exactly that shape.

Obsidian's code-block ranges move from 843/883 to 847/883 agreeing, with the footnote dimension
unchanged and no corpus regressions.
