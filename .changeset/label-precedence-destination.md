---
"@quartz-community/remark-obsidian": minor
---

Build the outer link even where no inner link exists

Label precedence previously fired only where the tree had already found a link. It now also
fires where raw scanning finds a label and destination the tree found _nothing_ for — which
is what a code span, an html attribute, a math span or a comment swallowing the `](u)`
leaves behind. `[foo`](u)``is a link to `u` labelled`` foo` ``, as are CommonMark's spec
examples 342, 519, 522, 524 and 525.

Three things made that safe. A full CommonMark destination reader, so a title no longer
lands in the url. A guard asking the _tree_ whether an image, wikilink or footnote
reference already owns the bracket. And a guard for a construct that opened earlier and
still encloses it — whichever opens first wins, so `[foo *bar](u)*` is a link while
`*[foo*](/uri)` is emphasis.
