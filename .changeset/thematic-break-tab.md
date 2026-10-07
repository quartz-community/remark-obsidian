---
"@quartz-community/remark-obsidian": patch
---

A tab between thematic-break markers cancels the break

`remark-parse@8` accepts only spaces between the markers, so a tab drops the line to the
list tokenizer and it becomes nested items. CommonMark counts a tab as whitespace and
reports a break, which is what we did.

```
* * *     a break to both          *⇥*⇥*⇥    three nested lists
*  *  *   still a break            * * *⇥   a trailing tab alone cancels it
***       still a break            _⇥_⇥_⇥   a paragraph: `_` opens no list
```

Each item starts at its marker and runs to the end of the line, as `metadataCache`
reports. Only a break whose own source holds a tab is touched.
