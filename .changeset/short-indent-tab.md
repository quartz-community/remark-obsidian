---
"@quartz-community/remark-obsidian": patch
---

Do not let a tab after one to three spaces open indented code

micromark expands a tab to the next four-column stop, so ` \t` reaches column
four and opens an indented code block. `remark-parse@8` does not count a tab that
follows a space at all, so the same line is ordinary content — and since Obsidian
parses with `remark-parse@8`, a footnote definition written there is a definition
rather than code.

Measured against the legacy stack across nine indentations, which is what settles
a rule this counter-intuitive. A tab counts fully only when it opens the line:

```
\t[^1]: def       -> code        (tab opens the line)
\t \t[^1]: def    -> code
    [^1]: def     -> code        (four spaces)
 \t[^1]: def      -> definition  (one space, then a tab)
  \t\t[^1]: def   -> definition
   [^1]: def      -> definition  (three spaces)
```

So a line is indented code only when it opens with a tab or with four spaces.

Only a single-line block is reinterpreted: a run of indented lines would need
each one's indent weighed against the others, and the recorded families are all
one line.
