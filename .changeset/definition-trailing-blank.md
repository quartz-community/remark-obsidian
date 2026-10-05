---
"@quartz-community/remark-obsidian": patch
---

A footnote definition does not end on a blank line

Where a definition's body ends in an unclosed opener — an indented fence, an
indented `$$` — micromark lets that construct consume the blank line after it,
because indented code and an unclosed fence may legitimately contain blanks. The
definition's span grows by one line as a result. `remark-parse@8` stops at the last
line that holds something, and Obsidian parses with `remark-parse@8`:

```
[^1]: body            lines 0..1 to Obsidian, 0..2 to micromark
    ```
                      <- the blank micromark takes in
next
```

Measured against the legacy stack across four shapes, each exactly one line out.
Only the definition's own end point moves; its children already end where they
end, and the blank was never any node's content.
