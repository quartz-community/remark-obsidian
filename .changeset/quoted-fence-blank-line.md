---
"@quartz-community/remark-obsidian": patch
---

A blank line ends a quoted fence, however far away its closer is.

This corrects the rule shipped one commit earlier. A quoted fence runs to its quoted closer, so
the quote absorbs the lines between rather than closing — but absorbing a BLANK line was wrong.
Measured against live 1.15.0, with the quote/root asymmetry as the control:

    > ``` / > a / > [^b]: def / > ```        defs []      the fence holds
    > ``` / > a / BLANK / [^b]: def / > ```  defs ["b"]   the blank ENDED it
    > ``` / > a / BLANK / > [^b]: def / ...  defs ["b"]   even re-quoted, still ended
    ``` / a / BLANK / [^b]: def / ```        defs []      at ROOT a blank ends nothing

The last row is why the guard belongs in the blockquote and not in the fence construct: a root
fence spans its blank lines, so the rule is the QUOTE's. That is the same asymmetry already
recorded for a `%%` region — an unquoted empty line ends a blockquote, while at root a blank
terminates nothing.

Found by `ablate` on the `MISSING inside our code` bucket, which named `legacyLists` decisive on
11 documents at ratio 0.58. All three sampled reductions were the same shape — a blank line
inside a quoted fence with Obsidian defining the label after it — which is precisely what the
previous commit's blank-line absorption suppressed.

    referee 6158 -> 6163 / 6818   +5 GAINED, 0 LOST, by --ids identity
    6 oracle-verified rows match, including the previous commit's own target
    450 tests pass, 0 probes drifted, 4 gates green
