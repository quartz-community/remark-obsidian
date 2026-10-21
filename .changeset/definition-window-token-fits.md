---
"@quartz-community/remark-obsidian": patch
---

An ender past a definition's 1,024-character window must _fit_ in it, not merely begin in it.

`remark-footnotes@2` looks for something that could end a definition only within its first 1,024
characters, and Obsidian inherits that. `definitionWindowTransform` tested where the ender _starts_;
the window truncates the text, so an ender is recognised only if what survives still reads as one.
Measured against live Obsidian with the ender's start offset across the boundary:

```
ender    1000  1020  1023  1024  1025     (0 = ender ends it, 1 = lazy text)
heading     0     0     0     1     1     `#` alone is still a heading
item        0     0     0     1     1     `-` alone is still an item
fence       0     0     1     1     1     one backtick is NOT a fence
label       0     1     1     1     1     `[^2]` without its colon is no label
```

So the threshold is per-ender: one character for a heading, an item or a quote, three for a fence or
a thematic break. The rules document states the same boundaries from the other side — _"a label at
character 1,020 no longer fits, nor a fence at 1,022"_.

The **label** boundary is deliberately not taken. Absorbing a definition into a definition inverts
the inner span: `[^1]: ` + 1013 characters + `\n[^2]: x` produced `footnoteDefinition off 1020-1019`,
an end before its start, because the pass copies the absorbed block's end onto the host and a
sibling definition's end is already the host's. Its five probe rows still diverge and say so.

Footnote agreement moves from 6028/6818 to 6029/6818 with zero regressions, verified by identity;
the probe table goes from 6 diverging cells to 5.
