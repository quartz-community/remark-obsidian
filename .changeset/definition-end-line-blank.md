---
"@quartz-community/remark-obsidian": patch
---

A footnote definition no longer absorbs the paragraph after a blank line it had swallowed.

`definitionLazyTransform` takes the line below a definition into it, which is right: lazy
continuation needs an open paragraph and a bare `[^1]:` or `[^1]: >` leaves none, so micromark
ends the definition where Obsidian keeps it open. The pass guards that with "only a block with
no blank line before it", spelled as

    source.slice(definitionEnd, from) !== "\n"

and that guard is DEFEATED BY ITS OWN PREMISE. A definition holding an indented block runs
through the blank line that follows it, so the blank is INSIDE the definition's span and the gap
to the next block really is a single newline:

    [^a]: def / ⟨4sp⟩``` / blank / after [^b]      arrives as footnoteDefinition@0..2,
                                                   where line 2 IS the blank

So the rule was satisfied by a blank line that had been absorbed rather than by its absence, and
the following paragraph -- with any reference in it -- was pulled into the definition. Obsidian
ends the definition at its content: `broad-20261004.json#13` has `ch2*` spanning 15..16 where we
ran to 18.

Fixed by also requiring the definition's OWN END LINE to be non-blank, which is the thing the
gap test cannot see. Not tab-specific: the four-space form behaved identically, and bare
`remark-parse` + `remark-gfm` get both right, so this was ours in BOTH presets rather than a
tokenizer or legacy-flag divergence.

Found by classifying every diverging document by WHICH OF OUR NODES covers the first diverging
fact -- the mechanism axis rather than the input shape. 669 divergences concentrate into five
buckets covering 86%, and `MISSING inside our footnoteDefinition` was the largest at 260.

    referee 6148 -> 6158 / 6818   +10 GAINED, 0 LOST, by --ids identity
    3 probe-ledger entries NOW AGREE with Obsidian, 0 moved away
    450 tests pass, 4 gates green
