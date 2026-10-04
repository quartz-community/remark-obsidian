---
"@quartz-community/remark-obsidian": patch
---

Parse the rest of a callout's marker line as block content.

`> [!note] Title` reads as a title because a bare run of words is a
paragraph. `> [!note] [^1]: x` does not: measured against Obsidian it renders
no text at all, because the remainder is a footnote definition and a
definition is relocated out of the callout rather than shown as a heading. So
the test is what the remainder parses as, and only a lone paragraph becomes a
title.

Two further details came from the measurement. Such a callout carries an
empty title node rather than none, because a callout with no title node
displays its capitalised type — `> [!note]` alone reads "Note" — and this one
shows nothing. And list markers count as container prefix, so
`- > [!note] ...` is a callout inside a list item; anchoring on `>` alone
missed it.

The first version of that prefix check was an exponential regex, which the
ReDoS gate caught before it could ship. It is now a bounded scan.

Three cases from the author's list move to matching; seven of the twelve are
now done.
