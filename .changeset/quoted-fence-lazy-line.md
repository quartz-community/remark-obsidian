---
"@quartz-community/remark-obsidian": patch
---

A quoted fence runs to its quoted closer, so labels between stay inside code.

A fenced code block opened inside a blockquote is not ended by a following line that omits
the `>`. Measured against live 1.15.0 -- the quoted closer is reached, the whole span is one
code block, and the labels inside it are not references:

    >   ~~~ / Some words / > [^a]: def / >   ~~~     one code block, NO ref `a`
    > ```` / Text end. %% [^ch2*] %%  / > ````       one code block, NO ref `ch2*`

Ours ended the block at the unquoted line, which left `> [^a]: def` outside it as ordinary
quoted text and turned the label into a reference we invented.

It is CONDITIONAL on a quoted closer existing. Where a quoted fence never reaches one,
Obsidian ends the block with the quote and parses the rest of the note as ordinary flow --
absorbing there cost 29 documents whose root definitions below the opener all went missing.
That makes the condition a LOOKAHEAD, which is why it cannot live in the fence's own
continuation and is enforced from the quote instead, through the chunk-scan-under-`check`
idiom `legacy-scan.ts` already uses for the rescanning inline tokenizers.

The quote ABSORBS the line rather than the fence tolerating it, which is the cheaper half of
the design: because the continuation then succeeds, micromark never marks the line lazy, so
stock's fence continuation is untouched and blank lines are carried for free. Tolerating lazy
lines in the fence instead reaches list items too -- where an item's fence already runs too
long rather than too short -- and cost 114 documents to gain 33.

`legacyCodeFenced` borrows micromark's `codeFenced` whole and substitutes one call rather
than forking ~300 lines of fence-length and info-string bookkeeping: its `tokenize` is
invoked with the `effects` we build, and `effects.attempt` reaches exactly the closing fence.

    referee 6145 -> 6148 / 6818   +7 GAINED, 4 LOST, by --ids identity
    5 probe-ledger entries NOW AGREE with Obsidian; 0 moved away
    450 tests pass, 4 gates green
